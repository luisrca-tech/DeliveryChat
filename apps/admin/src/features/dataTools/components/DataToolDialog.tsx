import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Switch } from "@repo/ui/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import {
  useCreateDataToolMutation,
  useSetDataToolEnabledMutation,
  useTestDataToolMutation,
  useUpdateDataToolMutation,
} from "../hooks/useDataToolMutations";
import {
  ParamSchemaBuilder,
  paramRowsToSchema,
  schemaToParamRows,
  type ParamRow,
} from "./ParamSchemaBuilder";
import {
  buildDataToolBody,
  canEnableTool,
  canSaveDataTool,
  coerceParams,
} from "../lib/dataToolForm";
import type {
  DataSourceKind,
  DataTool,
  TestDataToolResult,
} from "../types/dataTools.types";

export type DataToolDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  sourceKind: DataSourceKind | null;
  tool: DataTool | null;
};

function buildParamValues(rows: ParamRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.name, ""]));
}

export function DataToolDialog({
  open,
  onOpenChange,
  applicationId,
  sourceKind,
  tool,
}: DataToolDialogProps) {
  const isEdit = Boolean(tool);
  const createMutation = useCreateDataToolMutation(applicationId);
  const updateMutation = useUpdateDataToolMutation(applicationId);
  const testMutation = useTestDataToolMutation(applicationId);
  const enableMutation = useSetDataToolEnabledMutation(applicationId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [config, setConfig] = useState("");
  const [paramRows, setParamRows] = useState<ParamRow[]>([]);
  const [rawJsonMode, setRawJsonMode] = useState(false);
  const [rawJsonText, setRawJsonText] = useState("{}");
  const [savedTool, setSavedTool] = useState<DataTool | null>(tool);
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<TestDataToolResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setSavedTool(tool);
    setName(tool?.name ?? "");
    setDescription(tool?.description ?? "");
    const rows = tool ? schemaToParamRows(tool.inputSchema) : [];
    setParamRows(rows);
    setRawJsonMode(false);
    setRawJsonText(JSON.stringify(tool?.inputSchema ?? { properties: {} }, null, 2));
    setConfig(
      tool
        ? tool.backingType === "http"
          ? tool.config.urlTemplate
          : tool.config.query
        : "",
    );
    setTestValues(buildParamValues(rows));
    setTestResult(null);
  }, [open, tool]);

  const effectiveKind = tool?.backingType ?? sourceKind;

  const resolvedSchema = useMemo(() => {
    if (rawJsonMode) {
      try {
        return JSON.parse(rawJsonText);
      } catch {
        return null;
      }
    }
    return paramRowsToSchema(paramRows);
  }, [rawJsonMode, rawJsonText, paramRows]);

  const formInputs = {
    effectiveKind,
    name,
    description,
    config,
    resolvedSchema,
  };

  const canSave = canSaveDataTool(formInputs);

  const handleSave = async () => {
    const body = buildDataToolBody(formInputs);
    if (!body) return;

    try {
      const result = savedTool
        ? await updateMutation.mutateAsync({ toolId: savedTool.id, body })
        : await createMutation.mutateAsync(body);
      setSavedTool(result);
      setTestResult(null);
      const rows = schemaToParamRows(result.inputSchema);
      setParamRows(rows);
      setTestValues(buildParamValues(rows));
      toast.success(isEdit || savedTool ? "Tool saved" : "Tool created");
    } catch (e) {
      toast.error("Failed to save tool", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const handleTest = async () => {
    if (!savedTool) return;
    const params = coerceParams(paramRows, testValues);
    try {
      const result = await testMutation.mutateAsync({
        toolId: savedTool.id,
        params,
      });
      setTestResult(result);
      if (result.ok) {
        setSavedTool((prev) =>
          prev ? { ...prev, lastTestedAt: new Date().toISOString() } : prev,
        );
      }
    } catch (e) {
      toast.error("Test request failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const handleEnableToggle = async (enabled: boolean) => {
    if (!savedTool) return;
    try {
      const updated = await enableMutation.mutateAsync({
        toolId: savedTool.id,
        enabled,
      });
      setSavedTool(updated);
      if (enabled) {
        // Enabling is the terminal step of the create → test → enable flow —
        // close the dialog so the user lands back on the updated table.
        toast.success("Tool enabled — the AI can use it now");
        onOpenChange(false);
      }
    } catch (e) {
      toast.error("Failed to update tool status", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const canEnable = canEnableTool(savedTool);
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{savedTool ? "Edit data tool" : "New data tool"}</DialogTitle>
          <DialogDescription>
            The AI decides when to call this tool based only on its name,
            description, and parameters — write them as if briefing a new
            teammate who has never seen your system.
          </DialogDescription>
        </DialogHeader>

        {!effectiveKind ? (
          <p className="text-sm text-destructive">
            Configure a data source before adding tools.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-2">
              <Label htmlFor="tool_name">Name</Label>
              <Input
                id="tool_name"
                placeholder="searchProducts"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Must start with a letter; letters, digits, and underscores only.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tool_description">Description</Label>
              <textarea
                id="tool_description"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                placeholder="Searches the product catalog by category and returns matching product names, prices, and links."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The AI decides when to use this tool based on this description
                — be specific: what it returns, when it applies, and any
                limits. At least 10 characters.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="tool_config">
                {effectiveKind === "http" ? "URL template" : "SQL query"}
              </Label>
              <textarea
                id="tool_config"
                rows={effectiveKind === "http" ? 2 : 4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                placeholder={
                  effectiveKind === "http"
                    ? "/products?category={category}"
                    : "SELECT name, price FROM products WHERE category = $1 LIMIT 20"
                }
                value={config}
                onChange={(e) => setConfig(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {effectiveKind === "http"
                  ? "Resolved against the data source's base URL. Use {paramName} placeholders — GET only."
                  : "Read-only query. Params bind positionally as $1, $2, … in the order listed below."}
              </p>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Parameters</Label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline"
                  onClick={() => setRawJsonMode((v) => !v)}
                >
                  {rawJsonMode ? "Use guided builder" : "Edit raw JSON Schema"}
                </button>
              </div>
              {rawJsonMode ? (
                <textarea
                  rows={6}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  value={rawJsonText}
                  onChange={(e) => setRawJsonText(e.target.value)}
                />
              ) : (
                <ParamSchemaBuilder rows={paramRows} onChange={setParamRows} />
              )}
              {rawJsonMode && resolvedSchema === null && (
                <p className="text-sm text-destructive">Invalid JSON</p>
              )}
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Test request</p>
                  <p className="text-xs text-muted-foreground">
                    {savedTool
                      ? "Send a live request with sample parameters."
                      : "Save the tool first to run a test."}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!savedTool || testMutation.isPending}
                  onClick={handleTest}
                >
                  {testMutation.isPending ? "Testing..." : "Send test request"}
                </Button>
              </div>

              {savedTool && paramRows.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {paramRows.map((row) =>
                    row.name ? (
                      <div key={row.name} className="grid gap-1">
                        <Label className="text-xs">{row.name}</Label>
                        <Input
                          value={testValues[row.name] ?? ""}
                          onChange={(e) =>
                            setTestValues((prev) => ({
                              ...prev,
                              [row.name]: e.target.value,
                            }))
                          }
                          placeholder={row.type}
                          className="h-8 text-sm"
                        />
                      </div>
                    ) : null,
                  )}
                </div>
              )}

              {testResult && (
                <div
                  className={`rounded-md p-3 text-xs font-mono ${
                    testResult.ok
                      ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                      : "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200"
                  }`}
                >
                  {testResult.ok ? (
                    <pre className="whitespace-pre-wrap break-all">
                      {JSON.stringify(
                        testResult.truncated
                          ? testResult.dataPreview
                          : testResult.data,
                        null,
                        2,
                      )}
                      {testResult.truncated ? "\n… (truncated)" : ""}
                    </pre>
                  ) : (
                    <p>
                      [{testResult.kind}] {testResult.error}
                    </p>
                  )}
                </div>
              )}

            </div>

            <div className="flex items-center justify-between rounded-md border p-4">
              <div>
                <p className="text-sm font-medium">Tool status</p>
                <p className="text-xs text-muted-foreground">
                  Only enabled tools are offered to the AI in conversations.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Switch
                          checked={savedTool?.enabled ?? false}
                          disabled={!canEnable || enableMutation.isPending}
                          onCheckedChange={handleEnableToggle}
                        />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {canEnable
                        ? "Enable this tool for the AI to use"
                        : "Run a successful test before enabling"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span className="text-sm">
                  {savedTool?.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? "Saving..." : savedTool ? "Save changes" : "Create tool"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { ParamSchemaBuilder, schemaToParamRows } from "./ParamSchemaBuilder";
import {
  buildDataToolBody,
  canEnableTool,
  coerceParams,
  dataToolFormSchema,
  planDataToolSave,
  resolveToolSchema,
  toDataToolFormValues,
  type DataToolFormValues,
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

function buildParamValues(
  rows: DataToolFormValues["paramRows"],
): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.name, ""]));
}

export function DataToolDialog({
  open,
  onOpenChange,
  applicationId,
  sourceKind,
  tool,
}: DataToolDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {/* Radix unmounts the content when closed, so the body (form + workflow
            state) initializes fresh on every open — no reset effect needed. */}
        <DataToolDialogBody
          key={tool?.id ?? "new"}
          onOpenChange={onOpenChange}
          applicationId={applicationId}
          sourceKind={sourceKind}
          tool={tool}
        />
      </DialogContent>
    </Dialog>
  );
}

function DataToolDialogBody({
  onOpenChange,
  applicationId,
  sourceKind,
  tool,
}: Omit<DataToolDialogProps, "open">) {
  const isEdit = Boolean(tool);
  const createMutation = useCreateDataToolMutation(applicationId);
  const updateMutation = useUpdateDataToolMutation(applicationId);
  const testMutation = useTestDataToolMutation(applicationId);
  const enableMutation = useSetDataToolEnabledMutation(applicationId);

  // Server-workflow state — not form fields: the persisted tool, the test
  // harness, and the pending status confirmed only by "Save changes".
  const [savedTool, setSavedTool] = useState<DataTool | null>(tool);
  const [enabled, setEnabled] = useState(tool?.enabled ?? false);
  const [testValues, setTestValues] = useState<Record<string, string>>(() =>
    buildParamValues(tool ? schemaToParamRows(tool.inputSchema) : []),
  );
  const [testResult, setTestResult] = useState<TestDataToolResult | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isDirty, isValid },
  } = useForm<DataToolFormValues>({
    resolver: zodResolver(dataToolFormSchema),
    mode: "onChange",
    defaultValues: toDataToolFormValues(tool),
  });

  const rawJsonMode = watch("rawJsonMode");
  const rawJsonText = watch("rawJsonText");
  const paramRows = watch("paramRows");

  const effectiveKind = tool?.backingType ?? sourceKind;

  const resolvedSchema = useMemo(
    () => resolveToolSchema({ rawJsonMode, rawJsonText, paramRows }),
    [rawJsonMode, rawJsonText, paramRows],
  );

  const handleSave = handleSubmit(async (values) => {
    const plan = planDataToolSave({ savedTool, fieldsDirty: isDirty, enabled });
    let current = savedTool;

    if (plan.saveFields) {
      const body = buildDataToolBody({
        effectiveKind,
        name: values.name,
        description: values.description,
        config: values.config,
        resolvedSchema,
      });
      if (!body) return;
      try {
        const result = current
          ? await updateMutation.mutateAsync({ toolId: current.id, body })
          : await createMutation.mutateAsync(body);
        current = result;
        setSavedTool(result);
        // The server resets enabled/lastTestedAt on every field edit.
        setEnabled(result.enabled);
        reset(toDataToolFormValues(result));
        setTestResult(null);
        setTestValues(buildParamValues(schemaToParamRows(result.inputSchema)));
        toast.success(isEdit || savedTool ? "Tool saved" : "Tool created");
      } catch (e) {
        toast.error("Failed to save tool", {
          description: e instanceof Error ? e.message : "Unknown error",
        });
        return;
      }
    }

    if (plan.applyStatus && current) {
      try {
        const updated = await enableMutation.mutateAsync({
          toolId: current.id,
          enabled,
        });
        setSavedTool(updated);
        setEnabled(updated.enabled);
        toast.success(
          updated.enabled ? "Tool enabled — the AI can use it now" : "Tool disabled",
        );
      } catch (e) {
        toast.error("Failed to update tool status", {
          description: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    if (plan.blockedEnable) {
      setEnabled(false);
      toast.info("Status not changed — run a successful test before enabling");
    }
  });

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

  const canEnable = canEnableTool(savedTool);
  const saving =
    createMutation.isPending || updateMutation.isPending || enableMutation.isPending;
  const statusDirty = savedTool ? enabled !== savedTool.enabled : false;
  const hasChanges = !savedTool || isDirty || statusDirty;

  return (
    <>
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
              className="font-mono"
              {...register("name")}
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
              {...register("description")}
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
              {...register("config")}
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
                onClick={() => setValue("rawJsonMode", !rawJsonMode)}
              >
                {rawJsonMode ? "Use guided builder" : "Edit raw JSON Schema"}
              </button>
            </div>
            {rawJsonMode ? (
              <textarea
                rows={6}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                {...register("rawJsonText")}
              />
            ) : (
              <Controller
                control={control}
                name="paramRows"
                render={({ field }) => (
                  <ParamSchemaBuilder
                    rows={field.value ?? []}
                    onChange={field.onChange}
                  />
                )}
              />
            )}
            {rawJsonMode && errors.rawJsonText && (
              <p className="text-sm text-destructive">{errors.rawJsonText.message}</p>
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
                Status changes apply when you save.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Switch
                        checked={enabled}
                        disabled={(!canEnable && !enabled) || saving}
                        onCheckedChange={setEnabled}
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
                {enabled ? "Enabled" : "Disabled"}
                {statusDirty && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (pending save)
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={!isValid || saving || !hasChanges}
        >
          {saving ? "Saving..." : savedTool ? "Save changes" : "Create tool"}
        </Button>
      </DialogFooter>
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { useDataSourceQuery } from "../hooks/useDataSourceQuery";
import { usePutDataSourceMutation } from "../hooks/useDataSourceMutations";
import type { DataSourceKind } from "../types/dataTools.types";

const httpSchema = z.object({
  baseUrl: z.string().url("Enter a valid URL, e.g. https://api.example.com"),
  allowedHost: z.string().min(1, "Allowed host is required"),
});

const sqlSchema = z.object({
  connectionString: z.string().optional(),
});

type HttpFormValues = z.infer<typeof httpSchema>;
type SqlFormValues = z.infer<typeof sqlSchema>;

function hostFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export type DataSourceSectionProps = {
  applicationId: string;
};

export function DataSourceSection({ applicationId }: DataSourceSectionProps) {
  const { data: source, isLoading } = useDataSourceQuery(applicationId);
  const putMutation = usePutDataSourceMutation(applicationId);

  const [kind, setKind] = useState<DataSourceKind>("http");
  const [headers, setHeaders] = useState<
    { name: string; value: string; isExisting: boolean }[]
  >([]);
  const [newHeaderName, setNewHeaderName] = useState("");
  const [newHeaderValue, setNewHeaderValue] = useState("");

  useEffect(() => {
    if (!source) return;
    setKind(source.kind);
    if (source.kind === "http") {
      setHeaders(
        source.headerNames.map((name) => ({
          name,
          value: "",
          isExisting: true,
        })),
      );
    }
  }, [source]);

  const httpForm = useForm<HttpFormValues>({
    resolver: zodResolver(httpSchema),
    values:
      source?.kind === "http"
        ? { baseUrl: source.baseUrl, allowedHost: source.allowedHost }
        : { baseUrl: "", allowedHost: "" },
  });

  const sqlForm = useForm<SqlFormValues>({
    resolver: zodResolver(sqlSchema),
    defaultValues: { connectionString: "" },
  });

  const baseUrlValue = httpForm.watch("baseUrl");
  const suggestedHost = useMemo(
    () => hostFromUrl(baseUrlValue),
    [baseUrlValue],
  );

  const handleUseSuggestedHost = () => {
    if (suggestedHost) httpForm.setValue("allowedHost", suggestedHost);
  };

  const handleAddHeader = () => {
    const name = newHeaderName.trim();
    if (!name || !newHeaderValue) return;
    setHeaders((prev) => [
      ...prev.filter((h) => h.name !== name),
      { name, value: newHeaderValue, isExisting: false },
    ]);
    setNewHeaderName("");
    setNewHeaderValue("");
  };

  const handleRemoveHeader = (name: string) => {
    setHeaders((prev) => prev.filter((h) => h.name !== name));
  };

  const submitHttp = httpForm.handleSubmit(async (values) => {
    // Only send `headers` when the admin actually changed something (added a
    // new one, or removed an existing one) — otherwise we preserve the saved
    // secrets by omitting the field entirely.
    const currentNames = new Set(headers.map((h) => h.name));
    const removedExisting =
      source?.kind === "http" &&
      source.headerNames.some((name) => !currentNames.has(name));
    const addedNew = headers.some((h) => !h.isExisting);

    const headersPayload: Record<string, string> | undefined =
      removedExisting || addedNew
        ? Object.fromEntries(
            headers.filter((h) => !h.isExisting).map((h) => [h.name, h.value]),
          )
        : undefined;

    try {
      await putMutation.mutateAsync({
        kind: "http",
        baseUrl: values.baseUrl,
        allowedHost: values.allowedHost,
        ...(headersPayload !== undefined ? { headers: headersPayload } : {}),
      });
      toast.success("Data source saved");
    } catch (e) {
      toast.error("Failed to save data source", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  });

  const submitSql = sqlForm.handleSubmit(async (values) => {
    const trimmed = values.connectionString?.trim();
    if (!trimmed && source?.kind !== "sql") {
      sqlForm.setError("connectionString", {
        message:
          "Connection string is required when creating a SQL data source",
      });
      return;
    }
    try {
      await putMutation.mutateAsync({
        kind: "sql",
        ...(trimmed ? { connectionString: trimmed } : {}),
      });
      sqlForm.reset({ connectionString: "" });
      toast.success("Data source saved");
    } catch (e) {
      toast.error("Failed to save data source", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  });

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-md bg-muted" />;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Configure how the AI reaches your systems. Choose HTTP for a REST API or
        SQL for a direct, read-only database connection.
      </p>
      <div className="grid gap-2 max-w-xs">
        <Label htmlFor="data_source_kind">Kind</Label>
        <Select
          value={kind}
          onValueChange={(value) => setKind(value as DataSourceKind)}
        >
          <SelectTrigger id="data_source_kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="http">HTTP API</SelectItem>
            <SelectItem value="sql">SQL database</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {kind === "http" ? (
        <form onSubmit={submitHttp} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="data_source_base_url">Base URL</Label>
            <Input
              id="data_source_base_url"
              placeholder="https://api.example.com"
              {...httpForm.register("baseUrl")}
            />
            {httpForm.formState.errors.baseUrl && (
              <p className="text-sm text-destructive">
                {httpForm.formState.errors.baseUrl.message}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="data_source_allowed_host">Allowed host</Label>
            <Input
              id="data_source_allowed_host"
              placeholder="api.example.com"
              {...httpForm.register("allowedHost")}
            />
            {suggestedHost && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={handleUseSuggestedHost}
              >
                Use {suggestedHost}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Must exactly match the base URL&apos;s host — this is the SSRF
              guardrail: requests can only reach this host.
            </p>
            {httpForm.formState.errors.allowedHost && (
              <p className="text-sm text-destructive">
                {httpForm.formState.errors.allowedHost.message}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Headers (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Sent with every request, e.g. an API key. Values are write-only —
              saved values are never shown again.
            </p>
            {headers.length > 0 && (
              <div className="space-y-2">
                {headers.map((header) => (
                  <div
                    key={header.name}
                    className="flex items-center gap-2 rounded-md border px-3 py-2"
                  >
                    <code className="text-xs font-mono">{header.name}</code>
                    <span className="flex-1 text-xs text-muted-foreground">
                      {header.isExisting
                        ? "•••• (saved)"
                        : "•••• (will be saved)"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Remove header ${header.name}`}
                      onClick={() => handleRemoveHeader(header.name)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Header name"
                value={newHeaderName}
                onChange={(e) => setNewHeaderName(e.target.value)}
                className="max-w-[200px] font-mono text-sm"
              />
              <Input
                placeholder="Header value"
                type="password"
                value={newHeaderValue}
                onChange={(e) => setNewHeaderValue(e.target.value)}
                className="font-mono text-sm"
              />
              <Button type="button" variant="outline" onClick={handleAddHeader}>
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </div>
          </div>

          <Button type="submit" disabled={putMutation.isPending}>
            {putMutation.isPending ? "Saving..." : "Save data source"}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitSql} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="data_source_connection_string">
              Connection string
            </Label>
            <Input
              id="data_source_connection_string"
              type="password"
              placeholder={
                source?.kind === "sql" && source.hasConnectionString
                  ? "•••• (saved — leave blank to keep current)"
                  : "postgres://user:password@host:5432/db"
              }
              {...sqlForm.register("connectionString")}
            />
            <p className="text-xs text-muted-foreground">
              Write-only. Leave blank to keep the currently saved connection
              string. Must be a read-only credential.
            </p>
            {sqlForm.formState.errors.connectionString && (
              <p className="text-sm text-destructive">
                {sqlForm.formState.errors.connectionString.message}
              </p>
            )}
          </div>

          <Button type="submit" disabled={putMutation.isPending}>
            {putMutation.isPending ? "Saving..." : "Save data source"}
          </Button>
        </form>
      )}
    </div>
  );
}

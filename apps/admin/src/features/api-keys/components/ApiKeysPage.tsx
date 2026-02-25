import { useState, useCallback, useMemo } from "react";
import { Key, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { useApplicationsQuery } from "../hooks/useApplicationsQuery";
import { useApiKeysQuery } from "../hooks/useApiKeysQuery";
import {
  useCreateApiKeyMutation,
  useRevokeApiKeyMutation,
  useRegenerateApiKeyMutation,
} from "../hooks/useApiKeyMutations";
import { useBillingStatusQuery } from "@/features/billing/hooks/useBillingStatus";
import { ApiKeyLimitError } from "../lib/api-keys.client";
import type {
  ApiKeyEnvironment,
  ApiKeyListItem,
} from "../types/api-keys.types";
import type { ApiKeyCreatedResponse } from "../types/api-keys.types";
import { ApiKeyListTable } from "./ApiKeyListTable";
import { CreateApiKeyDialog } from "./CreateApiKeyDialog";
import { RevokeApiKeyDialog } from "./RevokeApiKeyDialog";
import { RegenerateApiKeyDialog } from "./RegenerateApiKeyDialog";
import { KeyRevealDialog } from "./KeyRevealDialog";

export function ApiKeysPage() {
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [environmentFilter, setEnvironmentFilter] = useState<
    ApiKeyEnvironment | "all"
  >("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeKey, setRevokeKey] = useState<ApiKeyListItem | null>(null);
  const [regenerateKey, setRegenerateKey] = useState<ApiKeyListItem | null>(
    null,
  );
  const [revealKey, setRevealKey] = useState<ApiKeyCreatedResponse | null>(
    null,
  );

  const { data: billing } = useBillingStatusQuery();
  const { data: appsData } = useApplicationsQuery();
  const { data: keysData, isLoading: keysLoading } =
    useApiKeysQuery(selectedAppId);

  const createMutation = useCreateApiKeyMutation(selectedAppId);
  const revokeMutation = useRevokeApiKeyMutation(selectedAppId);
  const regenerateMutation = useRegenerateApiKeyMutation(selectedAppId);

  const applications = useMemo(
    () => appsData?.applications ?? [],
    [appsData?.applications],
  );
  const apiKeys = keysData?.apiKeys ?? [];
  const used = keysData?.used ?? 0;
  const limit = keysData?.limit ?? 0;
  const plan = billing?.plan ?? "FREE";

  const handleCreateKey = useCallback(
    async (body: {
      name?: string;
      environment?: ApiKeyEnvironment;
      expiresAt?: string;
    }) => {
      if (!selectedAppId) return;
      try {
        const result = await createMutation.mutateAsync(body);
        setCreateOpen(false);
        setRevealKey(result);
      } catch (e) {
        if (e instanceof ApiKeyLimitError) {
          toast.error("Plan limit reached", {
            description: "Upgrade to add more keys.",
          });
        } else {
          toast.error("Failed to create key", {
            description: e instanceof Error ? e.message : "Unknown error",
          });
        }
        throw e;
      }
    },
    [selectedAppId, createMutation],
  );

  const handleRevoke = useCallback(
    async (key: ApiKeyListItem) => {
      try {
        await revokeMutation.mutateAsync(key.id);
        setRevokeKey(null);
        toast.success("API key revoked");
      } catch (e) {
        toast.error("Failed to revoke key", {
          description: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
    [revokeMutation],
  );

  const handleRegenerate = useCallback(
    async (
      key: ApiKeyListItem,
      body?: { name?: string; expiresAt?: string },
    ) => {
      try {
        const result = await regenerateMutation.mutateAsync({
          keyId: key.id,
          body,
        });
        setRegenerateKey(null);
        setRevealKey(result);
        toast.success("API key regenerated");
      } catch (e) {
        toast.error("Failed to regenerate key", {
          description: e instanceof Error ? e.message : "Unknown error",
        });
      }
    },
    [regenerateMutation],
  );

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-bold">API Keys</h1>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          disabled={!selectedAppId || used >= limit}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Key
        </Button>
      </div>

      <p className="text-muted-foreground">
        Manage API keys for your applications. Keys are shown in full only once
        at creation.
      </p>

      <div className="space-y-4">
        <div className="grid gap-2">
          <label htmlFor="application-select" className="text-sm font-medium">
            Application
          </label>
          <Select
            value={selectedAppId ?? ""}
            onValueChange={(v) => setSelectedAppId(v || null)}
          >
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Select application" />
            </SelectTrigger>
            <SelectContent>
              {applications.map((app) => (
                <SelectItem key={app.id} value={app.id}>
                  {app.name} ({app.domain})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {applications.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Create an application first to manage API keys.
            </p>
          )}
        </div>

        {selectedAppId && (
          <ApiKeyListTable
            keys={apiKeys}
            used={used}
            limit={limit}
            plan={plan}
            environmentFilter={environmentFilter}
            onEnvironmentFilterChange={setEnvironmentFilter}
            onRevoke={(key) => setRevokeKey(key)}
            onRegenerate={(key) => setRegenerateKey(key)}
            isLoading={keysLoading}
            onCreateClick={() => setCreateOpen(true)}
          />
        )}
      </div>

      <CreateApiKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreateKey}
        submitting={createMutation.isPending}
      />

      {revokeKey && (
        <RevokeApiKeyDialog
          open={!!revokeKey}
          onOpenChange={(open) => !open && setRevokeKey(null)}
          onConfirm={() => revokeKey && handleRevoke(revokeKey)}
          keyName={revokeKey.name}
          keyPrefix={revokeKey.keyPrefix}
          revoking={revokeMutation.isPending}
        />
      )}

      {regenerateKey && (
        <RegenerateApiKeyDialog
          open={!!regenerateKey}
          onOpenChange={(open) => !open && setRegenerateKey(null)}
          onConfirm={(body) =>
            regenerateKey && handleRegenerate(regenerateKey, body)
          }
          keyName={regenerateKey.name}
          keyPrefix={regenerateKey.keyPrefix}
          regenerating={regenerateMutation.isPending}
        />
      )}

      {revealKey && (
        <KeyRevealDialog
          open={!!revealKey}
          onOpenChange={(open) => !open && setRevealKey(null)}
          apiKey={revealKey.key}
          keyPrefix={revealKey.keyPrefix}
        />
      )}
    </div>
  );
}

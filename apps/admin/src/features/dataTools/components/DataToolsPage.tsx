import { Database } from "lucide-react";
import { useApplicationQuery } from "@/features/applications/hooks/useApplicationQuery";
import { useBillingStatusQuery } from "@/features/billing/hooks/useBillingStatus";
import { resolveAiLock } from "@/features/ai/lib/aiPlanGates";
import { useDataSourceQuery } from "../hooks/useDataSourceQuery";
import { DataToolsFeatureLockedError } from "../lib/dataTools.client";
import { ConnectionCard } from "./ConnectionCard";
import { DataToolsTable } from "./DataToolsTable";
import { FeatureLockedCard } from "./FeatureLockedCard";

export type DataToolsPageProps = {
  applicationId: string;
};

export function DataToolsPage({ applicationId }: DataToolsPageProps) {
  const { data: applicationDetail } = useApplicationQuery(applicationId);
  const { data: billingStatus } = useBillingStatusQuery();
  const { data: source, isLoading, error } = useDataSourceQuery(applicationId);

  const applicationName = applicationDetail?.application.name ?? "Application";
  const isLocked = error instanceof DataToolsFeatureLockedError;
  // The lock itself is the API's call (`ai_addon_not_active`); the plan only
  // decides WHICH way out we offer. Default to the purchase message when billing
  // has not loaded yet — the API already told us the org has no add-on.
  const lock =
    resolveAiLock(billingStatus?.plan, Boolean(billingStatus?.aiAddonActive)) ??
    "addon_inactive";

  return (
    <div className="max-w-full space-y-6">
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-primary" />
        <h1 className="text-3xl font-bold">Data tools</h1>
      </div>
      <p className="text-muted-foreground">
        {applicationName} · Connect the AI to your systems and define the
        read-only capabilities it can use to answer visitors.
      </p>

      {isLocked ? (
        <FeatureLockedCard lock={lock} />
      ) : isLoading ? (
        <div className="h-32 animate-pulse rounded-md bg-muted" />
      ) : (
        <div className="space-y-8">
          <ConnectionCard applicationId={applicationId} />
          {source && (
            <DataToolsTable
              applicationId={applicationId}
              sourceKind={source.kind}
            />
          )}
        </div>
      )}
    </div>
  );
}

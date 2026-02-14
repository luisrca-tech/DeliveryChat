import { useMemo } from "react";
import { Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import {
  billingQueryKeys,
  useBillingStatusPollingQuery,
} from "../hooks/useBillingStatus";
import { BILLING_POLL_MAX_ATTEMPTS } from "../constants/billing.constants";

export function BillingSuccessPage() {
  const queryClient = useQueryClient();
  const { data, isError, error } = useBillingStatusPollingQuery();

  const queryState = queryClient.getQueryState(billingQueryKeys.status());
  const attempts =
    (queryState?.dataUpdateCount ?? 0) + (queryState?.errorUpdateCount ?? 0);
  const isReady = Boolean(data?.isReady);

  const state = useMemo(() => {
    if (isReady) {
      return { title: "Done! Redirecting...", details: null };
    }
    if (attempts >= BILLING_POLL_MAX_ATTEMPTS) {
      return {
        title: "This is taking longer than expected.",
        details: "Please refresh the page or contact support.",
      };
    }
    if (isError) {
      return {
        title: "Confirming your payment...",
        details: error instanceof Error ? error.message : "Request failed",
      };
    }
    return {
      title: "Provisioning your workspace...",
      details: data?.planStatus
        ? `Current status: ${data.planStatus}`
        : "Waiting for billing status to update...",
    };
  }, [attempts, data?.planStatus, error, isError, isReady]);

  return (
    <div className="min-h-[calc(100vh-2rem)] flex items-center justify-center px-4 py-12">
      {isReady ? <Navigate to="/" /> : null}
      <Card className="w-full max-w-lg border-border/50 shadow-soft">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-bold">{state.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm">
              Don’t close this tab — we’re syncing your billing status.
            </p>
          </div>
          {state.details && (
            <p className="text-sm text-muted-foreground bg-muted/30 rounded-md p-3 border border-border/50">
              {state.details}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

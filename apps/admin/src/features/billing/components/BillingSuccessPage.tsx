import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { useBillingStatusPollingQuery } from "../hooks/useBillingStatus";
import { BILLING_POLL_MAX_ATTEMPTS } from "../constants/billing.constants";

export function BillingSuccessPage() {
  const navigate = useNavigate();
  const attemptsRef = useRef(0);

  const { data, isError, error, dataUpdatedAt } = useBillingStatusPollingQuery();

  useEffect(() => {
    if (dataUpdatedAt) attemptsRef.current += 1;
  }, [dataUpdatedAt]);

  const state = useMemo(() => {
    if (data?.isReady) {
      return { title: "Done! Redirecting...", details: null };
    }
    if (attemptsRef.current >= BILLING_POLL_MAX_ATTEMPTS) {
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
  }, [data, isError, error]);

  useEffect(() => {
    if (data?.isReady) {
      const t = setTimeout(() => {
        navigate({ to: "/" });
      }, 500);
      return () => clearTimeout(t);
    }
  }, [data?.isReady, navigate]);

  return (
    <div className="min-h-[calc(100vh-2rem)] flex items-center justify-center px-4 py-12">
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


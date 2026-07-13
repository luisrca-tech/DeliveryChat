import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bot, CreditCard, Mail } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { ConfirmDialog } from "@repo/ui/components/ui/confirm-dialog";
import { AiAddonPurchaseDialog } from "./AiAddonPurchaseDialog";
import { useBillingStatusQuery } from "../hooks/useBillingStatus";
import { useCreatePortalSessionMutation } from "../hooks/useBillingPortal";
import {
  useAiAddonStatusPollingQuery,
  useCancelAiAddonMutation,
  useEnableAiAddonMutation,
} from "../hooks/useAiAddon";
import { daysUntil } from "../utils/billing.utils";
import { AiAddonError } from "../lib/billing.client";
import type { AiAddonErrorCode } from "../types/billing.types";
import { env } from "@/env";

const AI_ADDON_ERROR_MESSAGES: Record<AiAddonErrorCode, string> = {
  no_active_subscription:
    "An active subscription is required before adding the AI add-on.",
  subscription_not_active:
    "Your subscription must be active or trialing to add the AI add-on.",
  plan_not_eligible:
    "The AI add-on is only available on the PREMIUM and ENTERPRISE plans.",
  ai_addon_already_active:
    "The AI add-on is already active for this organization.",
  ai_addon_not_active: "There is no active AI add-on to cancel.",
  internal_server_error: "Something went wrong. Please try again.",
  unknown_error: "Something went wrong. Please try again.",
};

function aiAddonErrorMessage(e: unknown): string {
  if (e instanceof AiAddonError) return AI_ADDON_ERROR_MESSAGES[e.code];
  return e instanceof Error ? e.message : "Unknown error";
}

export function BillingSettingsPage() {
  const { data: status } = useBillingStatusQuery();
  const portal = useCreatePortalSessionMutation();
  const enableAddon = useEnableAiAddonMutation();
  const cancelAddon = useCancelAiAddonMutation();
  const [pendingAddonAction, setPendingAddonAction] = useState<
    "enable" | "cancel" | null
  >(null);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);

  const trialDaysLeft = useMemo(() => {
    if (!status?.trialEndsAt) return null;
    return daysUntil(status.trialEndsAt);
  }, [status?.trialEndsAt]);

  const openPortal = async () => {
    try {
      const result = await portal.mutateAsync();
      window.location.href = result.url;
    } catch (e) {
      toast.error("Unable to open billing portal", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const isSuperAdmin = status?.role === "super_admin";
  const isAddonEligiblePlan =
    status?.plan === "PREMIUM" || status?.plan === "ENTERPRISE";
  const isAddonActive = Boolean(status?.aiAddonActive);
  const isAddonPendingEnable =
    pendingAddonAction === "enable" && !isAddonActive;
  const isAddonPendingCancel = pendingAddonAction === "cancel" && isAddonActive;

  // Polls the shared billing-status cache key until aiAddonActive flips —
  // the webhook-driven entitlement lands asynchronously after the mutation.
  useAiAddonStatusPollingQuery(
    isAddonPendingEnable || isAddonPendingCancel,
    isAddonPendingEnable,
  );

  const handleEnableAddon = async () => {
    try {
      await enableAddon.mutateAsync();
      setPendingAddonAction("enable");
      setIsPurchaseDialogOpen(false);
      toast.success("AI add-on purchase started", {
        description: "It will activate once payment is confirmed.",
      });
    } catch (e) {
      toast.error("Unable to enable the AI add-on", {
        description: aiAddonErrorMessage(e),
      });
    }
  };

  const handleCancelAddon = async () => {
    try {
      await cancelAddon.mutateAsync();
      setPendingAddonAction("cancel");
      setIsCancelDialogOpen(false);
      toast.success("AI add-on cancellation started", {
        description: "It will be removed once confirmed.",
      });
    } catch (e) {
      toast.error("Unable to cancel the AI add-on", {
        description: aiAddonErrorMessage(e),
      });
    }
  };

  return (
    <div className="max-w-full space-y-6">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        <h1 className="text-3xl font-bold">Billing & Plans</h1>
      </div>

      <Card className="border-border/50 shadow-soft">
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            Manage your subscription, upgrade/downgrade, and payment method.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">
                Plan:{" "}
                <span className="text-primary">{status?.plan ?? "—"}</span>
              </p>
              <p className="text-sm text-muted-foreground">
                Status: {status?.planStatus ?? "—"}
                {status?.planStatus === "trialing" && trialDaysLeft !== null
                  ? ` • Trial ends in ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"}`
                  : ""}
              </p>
            </div>

            {status?.plan === "ENTERPRISE" ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Contact:{" "}
                <a
                  className="text-primary hover:underline"
                  href={`mailto:${env.VITE_RESEND_EMAIL_TO}`}
                >
                  {env.VITE_RESEND_EMAIL_TO}
                </a>
              </div>
            ) : status?.plan === "FREE" ? (
              <Button
                onClick={() => {
                  window.location.href = "/onboarding/plans";
                }}
                variant="default"
              >
                Choose a plan
              </Button>
            ) : (
              <Button onClick={openPortal} disabled={portal.isPending}>
                {portal.isPending ? "Opening..." : "Manage subscription"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-soft">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <CardTitle>AI Assistant add-on</CardTitle>
          </div>
          <CardDescription>
            R$ 120/month (US$ 24 for USD-billed accounts) — autonomous AI
            answers in the widget, connects to your data, human escalation
            included.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            <li>Autonomous AI answers your visitors directly in the widget</li>
            <li>
              Connects to your own product/data sources for grounded answers
            </li>
            <li>Automatic escalation to a human operator when needed</li>
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {!isAddonEligiblePlan ? (
              <p className="text-sm text-muted-foreground">
                Available on Premium and Enterprise plans.
              </p>
            ) : isAddonActive ? (
              <>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                  Active
                </span>
                {isSuperAdmin ? (
                  <Button
                    variant="destructive"
                    onClick={() => setIsCancelDialogOpen(true)}
                    disabled={cancelAddon.isPending || isAddonPendingCancel}
                  >
                    {isAddonPendingCancel ? "Cancelling..." : "Cancel add-on"}
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Contact your Admin to manage this add-on.
                  </p>
                )}
              </>
            ) : isSuperAdmin ? (
              <Button
                onClick={() => setIsPurchaseDialogOpen(true)}
                disabled={enableAddon.isPending || isAddonPendingEnable}
              >
                {isAddonPendingEnable ? "Enabling..." : "Enable add-on"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Contact your Admin to enable this add-on.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <AiAddonPurchaseDialog
        open={isPurchaseDialogOpen}
        onOpenChange={setIsPurchaseDialogOpen}
        onConfirm={handleEnableAddon}
        isConfirming={enableAddon.isPending}
      />

      <ConfirmDialog
        open={isCancelDialogOpen}
        onOpenChange={setIsCancelDialogOpen}
        title="Cancel AI add-on"
        description="Are you sure you want to cancel the AI Assistant add-on? The AI will stop answering visitors once the cancellation is confirmed."
        onConfirm={handleCancelAddon}
        confirmLabel="Cancel add-on"
        cancelLabel="Keep add-on"
        variant="destructive"
        isLoading={cancelAddon.isPending}
      />
    </div>
  );
}

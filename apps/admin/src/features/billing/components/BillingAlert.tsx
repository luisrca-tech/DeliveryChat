import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { useBillingStatusQuery } from "../hooks/useBillingStatus";
import { daysUntil } from "../utils/billing.utils";

export function BillingAlert() {
  const { data: status } = useBillingStatusQuery();

  const banner = useMemo(() => {
    if (!status?.planStatus) return null;

    if (status.planStatus === "past_due") {
      return {
        tone: "warning" as const,
        title: "Payment failed",
        description:
          status.role === "super_admin"
            ? "Please update your payment method to restore full access."
            : "Your organization’s payment failed. Please contact your Admin.",
        action:
          status.role === "super_admin" ? (
            <Link to="/settings/billing" className="shrink-0">
              <Button size="sm" variant="default">
                Fix billing
              </Button>
            </Link>
          ) : null,
      };
    }

    if (status.planStatus === "trialing") {
      if (status.trialEndsAt) {
        const days = daysUntil(status.trialEndsAt);
        if (days <= 0) {
          return {
            tone: "warning" as const,
            title: "Trial ended",
            description:
              status.role === "super_admin"
                ? "Choose a plan to continue."
                : "Your trial ended. Please contact your Admin to choose a plan.",
            action:
              status.role === "super_admin" ? (
                <Link to="/onboarding/plans" className="shrink-0">
                  <Button size="sm" variant="default">
                    Choose plan
                  </Button>
                </Link>
              ) : null,
          };
        }

        return {
          tone: "info" as const,
          title: "Trial active",
          description: `Trial ends in ${days} day${days === 1 ? "" : "s"}.`,
          action:
            status.role === "super_admin" ? (
              <Link to="/settings/billing" className="shrink-0">
                <Button size="sm" variant="outline">
                  Manage billing
                </Button>
              </Link>
            ) : null,
        };
      }

      return {
        tone: "info" as const,
        title: "Trial active",
        description: "Your trial is active.",
        action: null,
      };
    }

    return null;
  }, [status]);

  if (!banner) return null;

  const icon =
    banner.tone === "warning" ? (
      <AlertTriangle className="h-4 w-4 text-primary" />
    ) : (
      <Clock className="h-4 w-4 text-primary" />
    );

  return (
    <div className="px-4 pt-4">
      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{icon}</div>
          <div className="space-y-0.5">
            <p className="font-medium">{banner.title}</p>
            <p className="text-sm text-muted-foreground">
              {banner.description}
            </p>
          </div>
        </div>
        {banner.action}
      </div>
    </div>
  );
}

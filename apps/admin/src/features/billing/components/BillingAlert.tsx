import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock, X } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { authClient } from "@/lib/authClient";
import { useBillingStatusQuery } from "../hooks/useBillingStatus";
import {
  daysUntil,
  getBillingBannerDismissKey,
  getBillingAlertDismissStorageKey,
} from "../utils/billing.utils";

function readDismissedFromStorage(storageKey: string | null): boolean {
  if (!storageKey || typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

export function BillingAlert() {
  const { data: status } = useBillingStatusQuery();
  const { data: sessionData } = authClient.useSession();
  const sessionId = sessionData?.session?.id;
  const [dismissed, setDismissed] = useState(false);

  const banner = useMemo(() => {
    if (!status?.planStatus) return null;

    const bannerKey = getBillingBannerDismissKey({
      planStatus: status.planStatus,
      trialEndsAt: status.trialEndsAt,
    });
    if (!bannerKey) return null;

    const isSuperAdmin = status.role === "super_admin";

    if (status.planStatus === "past_due") {
      return {
        bannerKey,
        tone: "warning" as const,
        title: "Payment failed",
        description:
          isSuperAdmin
            ? "Please update your payment method to restore full access."
            : "Your organization’s payment failed. Please contact your Admin.",
        action:
          isSuperAdmin ? (
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
            bannerKey,
            tone: "warning" as const,
            title: "Trial ended",
            description:
              isSuperAdmin
                ? "Choose a plan to continue."
                : "Your trial ended. Please contact your Admin to choose a plan.",
            action:
              isSuperAdmin ? (
                <Link to="/onboarding/plans" className="shrink-0">
                  <Button size="sm" variant="default">
                    Choose plan
                  </Button>
                </Link>
              ) : null,
          };
        }

        return {
          bannerKey,
          tone: "info" as const,
          title: "Trial active",
          description: `Trial ends in ${days} day${days === 1 ? "" : "s"}.`,
          action:
            isSuperAdmin ? (
              <Link to="/settings/billing" className="shrink-0">
                <Button size="sm" variant="outline">
                  Manage billing
                </Button>
              </Link>
            ) : null,
        };
      }

      return {
        bannerKey,
        tone: "info" as const,
        title: "Trial active",
        description: "Your trial is active.",
        action: null,
      };
    }

    return null;
  }, [status]);

  const storageKey =
    sessionId && banner
      ? getBillingAlertDismissStorageKey(sessionId, banner.bannerKey)
      : null;

  const isDismissed =
    dismissed ||
    (storageKey ? readDismissedFromStorage(storageKey) : false);

  if (!banner || isDismissed) return null;

  const icon =
    banner.tone === "warning" ? (
      <AlertTriangle className="h-4 w-4 text-primary" />
    ) : (
      <Clock className="h-4 w-4 text-primary" />
    );

  const handleDismiss = () => {
    if (storageKey) {
      try {
        window.sessionStorage.setItem(storageKey, "1");
      } catch (err) {
        console.error("Failed to persist billing alert dismiss:", err);
      }
    }
    setDismissed(true);
  };

  return (
    <div className="px-4 pt-4">
      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5">{icon}</div>
          <div className="space-y-0.5">
            <p className="font-medium">{banner.title}</p>
            <p className="text-sm text-muted-foreground">
              {banner.description}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-1 shrink-0">
          {banner.action}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss billing notice"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

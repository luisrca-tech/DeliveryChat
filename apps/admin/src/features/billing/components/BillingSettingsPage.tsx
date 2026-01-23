import { useMemo } from "react";
import { toast } from "sonner";
import { CreditCard, Mail } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { useBillingStatusQuery } from "../hooks/useBillingStatus";
import { useCreatePortalSessionMutation } from "../hooks/useBillingPortal";
import { env } from "@/env";
export function BillingSettingsPage() {
  const { data: status } = useBillingStatusQuery();
  const portal = useCreatePortalSessionMutation();

  const trialDaysLeft = useMemo(() => {
    if (!status?.trialEndsAt) return null;
    const ms = new Date(status.trialEndsAt).getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
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

  return (
    <div className="max-w-4xl space-y-6">
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
            ) : (
              <Button onClick={openPortal} disabled={portal.isPending}>
                {portal.isPending ? "Opening..." : "Manage subscription"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

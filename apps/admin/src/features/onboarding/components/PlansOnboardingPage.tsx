import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { useCreateCheckoutMutation } from "@/features/billing/hooks/useBillingCheckout";
import type {
  CheckoutPlan,
  EnterpriseRequestDetails,
} from "@/features/billing/types/billing.types";
import { PLAN_CARDS } from "../constants/plans.constants";
import { EnterpriseRequestDialog } from "@/features/billing/components/EnterpriseRequestDialog";

export function PlansOnboardingPage() {
  const navigate = useNavigate();
  const checkout = useCreateCheckoutMutation();
  const [loadingPlan, setLoadingPlan] = useState<CheckoutPlan | null>(null);
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);

  const startCheckout = async (
    plan: CheckoutPlan,
    enterpriseDetails?: EnterpriseRequestDetails,
  ) => {
    setLoadingPlan(plan);
    try {
      const data = await checkout.mutateAsync({
        plan,
        ...(enterpriseDetails ? { enterpriseDetails } : {}),
      });

      if ("url" in data && data.url) {
        window.location.href = data.url;
        return;
      }

      if ("status" in data && data.status === "manual_review") {
        toast.success("Request received!", {
          description:
            data.message ||
            "We have received your request. Our team will contact you shortly.",
        });
        return;
      }

      toast.error("Unexpected response from server");
    } catch (e) {
      toast.error("Unable to start checkout", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setLoadingPlan(null);
    }
  };

  const openEnterprise = () => setEnterpriseOpen(true);

  return (
    <div className="min-h-[calc(100vh-2rem)] px-4 py-12">
      <div className="max-w-6xl mx-auto space-y-10">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold">
              Choose your{" "}
              <span className="bg-linear-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                plan
              </span>
            </h1>
            <p className="text-muted-foreground">
              You can start on a free 14-day trial. You can also skip and decide
              later.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/" })}
            className="shrink-0"
          >
            Skip for now
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {PLAN_CARDS.map((plan) => (
            <Card
              key={plan.key}
              className={`relative border-border/50 bg-card/95 ${
                plan.popular ? "border-primary/50 shadow-soft" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground rounded-full text-xs font-semibold">
                  Most Popular
                </div>
              )}
              <CardHeader className="text-center space-y-2">
                <CardTitle className="text-2xl font-bold">
                  {plan.name}
                </CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="text-4xl font-bold">{plan.price}</div>
              </CardHeader>
              <CardContent className="space-y-6">
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-3 text-sm text-muted-foreground"
                    >
                      <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={plan.popular ? "default" : "outline"}
                  disabled={!!loadingPlan || checkout.isPending}
                  onClick={() =>
                    plan.key === "enterprise"
                      ? openEnterprise()
                      : startCheckout(plan.key)
                  }
                >
                  {loadingPlan === plan.key ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Working...
                    </>
                  ) : (
                    plan.cta
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <EnterpriseRequestDialog
        open={enterpriseOpen}
        onOpenChange={setEnterpriseOpen}
        submitting={loadingPlan === "enterprise" || checkout.isPending}
        onSubmit={async (details) => {
          await startCheckout("enterprise", details);
          setEnterpriseOpen(false);
        }}
      />
    </div>
  );
}

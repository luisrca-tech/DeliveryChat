import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import type { AiLockState } from "@/features/ai/lib/aiPlanGates";

export type FeatureLockedCardProps = {
  /** Why data tools are locked. See `resolveAiLock`. */
  lock: AiLockState;
};

/**
 * The locked state of the data-tools page. The API answers `ai_addon_not_active`
 * for every locked org, so the reason — and therefore the next step — is decided
 * here from the plan: an org that CANNOT buy the add-on must be told to change
 * plan, while an org that simply HAS NOT bought it (or cancelled it) must be told
 * to buy it. One message for both strands whichever half it does not fit.
 */
export function FeatureLockedCard({ lock }: FeatureLockedCardProps) {
  return (
    <Card
      className="max-w-2xl"
      data-testid="data-tools-locked"
      data-lock={lock}
    >
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <CardTitle>Data tools require the AI Assistant add-on</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          Data tools let your AI assistant read live data from your own systems
          (HTTP APIs or a read-only SQL connection) to answer visitor questions
          with real, grounded information.
        </p>
        {lock === "addon_inactive" ? (
          <p>
            Your plan supports the <strong>AI Assistant add-on</strong>, but it
            is not active on your account. Purchase it from Billing to start
            connecting data tools — anything you already configured stays saved.
          </p>
        ) : (
          <p>
            Data tools require the <strong>AI Assistant add-on</strong>. Enable
            it from Billing (available on Premium and Enterprise plans).
          </p>
        )}
        <Link to="/settings/billing">
          <Button>Go to Billing</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

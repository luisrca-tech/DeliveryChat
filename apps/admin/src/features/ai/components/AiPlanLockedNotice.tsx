import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";

export type AiPlanLockedNoticeProps = {
  /** True once the onboarding interview has been completed for this application. */
  contextReady?: boolean;
};

/**
 * Shown to plans that may author an AI context but may not be served by the AI
 * (today: FREE). It is the one place that explains WHY the assistant is off and
 * how to switch it on — without it, a FREE admin finishes the interview and sees
 * nothing but a dead toggle.
 */
export function AiPlanLockedNotice({
  contextReady = false,
}: AiPlanLockedNoticeProps) {
  return (
    <Card data-testid="ai-plan-locked-notice">
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <CardTitle>The AI assistant is off on your current plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          {contextReady
            ? "Your AI context is saved and ready. The assistant will not reply to visitors until you move to a paid plan — nothing you wrote is lost, and it switches on as soon as you subscribe."
            : "You can complete the AI onboarding interview on the Free plan, but the assistant only starts answering visitors on a paid plan."}
        </p>
        <Link to="/settings/billing">
          <Button>See plans</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

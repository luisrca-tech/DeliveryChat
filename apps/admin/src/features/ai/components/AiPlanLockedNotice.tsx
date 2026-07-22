import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import type { AiLockState } from "../lib/aiPlanGates";

export type AiPlanLockedNoticeProps = {
  /** Why the AI capabilities are locked. See `resolveAiLock`. */
  lock: AiLockState;
  /** True once the onboarding interview has been completed for this application. */
  contextReady?: boolean;
};

/**
 * Shown wherever an org cannot use the AI capability being offered. It is the
 * one place that explains WHY the capability is off and how to switch it on —
 * without it, an admin finishes the interview and sees nothing but a dead
 * toggle. Each lock state gets its own diagnosis and its own next step; telling
 * a Premium org to "upgrade" (it already has) is as useless as telling a Basic
 * org to "buy the add-on" (it cannot).
 */
export function AiPlanLockedNotice({
  lock,
  contextReady = false,
}: AiPlanLockedNoticeProps) {
  const title =
    lock === "free_plan"
      ? "The AI assistant is off on your current plan"
      : "AI auto-respond and data tools need the AI Assistant add-on";

  const body =
    lock === "addon_inactive"
      ? "Your plan supports the AI Assistant add-on, but it is not active on your account. Purchase it from Billing to switch on automatic answering and data tools — your AI context and data tools stay saved in the meantime."
      : lock === "upgrade_plan"
        ? "Your plan can draft and improve replies with AI. Answering visitors automatically and connecting data tools come with the AI Assistant add-on, available on the Premium and Enterprise plans."
        : contextReady
          ? "Your AI context is saved and ready. The assistant will not reply to visitors until you move to a paid plan — nothing you wrote is lost, and it switches on as soon as you subscribe."
          : "You can complete the AI onboarding interview on the Free plan, but the assistant only starts answering visitors on a paid plan.";

  return (
    <Card data-testid="ai-plan-locked-notice" data-lock={lock}>
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>{body}</p>
        <Link to="/settings/billing">
          <Button>
            {lock === "addon_inactive" ? "Go to Billing" : "See plans"}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

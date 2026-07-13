import { Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

export function FeatureLockedCard() {
  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <CardTitle>Data tools require the AI Assistant add-on</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          Data tools let your AI assistant read live data from your own systems
          (HTTP APIs or a read-only SQL connection) to answer visitor questions
          with real, grounded information.
        </p>
        <p>
          Data tools require the <strong>AI Assistant add-on</strong>. Enable it
          from <strong>Settings → Billing</strong> (available on Premium and
          Enterprise plans).
        </p>
      </CardContent>
    </Card>
  );
}

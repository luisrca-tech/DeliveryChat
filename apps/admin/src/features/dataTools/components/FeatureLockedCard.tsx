import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";

export function FeatureLockedCard() {
  return (
    <Card className="max-w-2xl">
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <CardTitle>Data tools is an Enterprise feature</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          Data tools let your AI assistant read live data from your own systems
          (HTTP APIs or a read-only SQL connection) to answer visitor
          questions with real, grounded information.
        </p>
        <p>
          This capability is available on <strong>ENTERPRISE custom plans</strong>{" "}
          with the <strong>AI add-on</strong> active. Contact your account team
          to enable it for this organization.
        </p>
      </CardContent>
    </Card>
  );
}

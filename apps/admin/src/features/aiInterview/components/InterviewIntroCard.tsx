import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

export type InterviewIntroCardProps = {
  onStart: () => void;
  isStarting: boolean;
};

export function InterviewIntroCard({
  onStart,
  isStarting,
}: InterviewIntroCardProps) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>Configure AI for this application</CardTitle>
        <CardDescription>
          We will run a short guided interview so the AI understands your
          business, audience, products, tone, and support scenarios. Your
          answers become the context the assistant uses to reply to visitors.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          The interview takes about 8 to 12 turns. You can stop early once we
          have enough material to build a useful context.
        </p>
        <p>
          Nothing is shared with end users until you finish the interview and
          confirm the generated context.
        </p>
      </CardContent>
      <CardFooter>
        <Button onClick={onStart} disabled={isStarting}>
          {isStarting ? "Starting..." : "Start interview"}
        </Button>
      </CardFooter>
    </Card>
  );
}

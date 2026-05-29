import { useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { MarkdownView } from "@repo/ui/components/ui/markdown-view";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/ui/collapsible";
import { useInterviewStateQuery } from "../hooks/useInterviewState";
import { formatCompletedAt } from "../lib/formatCompletedAt";

export type AiContextPageProps = {
  applicationId: string;
};

export function AiContextPage({ applicationId }: AiContextPageProps) {
  const { data, isLoading, isError } = useInterviewStateQuery(applicationId);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading AI context...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6 text-sm text-destructive">
        Unable to load the AI context.
      </div>
    );
  }

  if (data.status !== "completed") {
    return (
      <Navigate
        to="/applications/$applicationId/ai-interview"
        params={{ applicationId }}
        replace
      />
    );
  }

  const completer = data.completedByName ?? "an admin";
  const completedAtLabel = formatCompletedAt(data.completedAt);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 md:flex-row md:items-start">
      <Card className="w-full md:flex-1">
        <CardHeader>
          <CardTitle className="text-lg">AI context summary</CardTitle>
          <p className="text-xs text-muted-foreground">
            Completed by <span className="font-medium">{completer}</span>
            {completedAtLabel ? ` on ${completedAtLabel}` : ""}
          </p>
        </CardHeader>
        <CardContent>
          {data.contextSummary ? (
            <MarkdownView source={data.contextSummary} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No summary is available for this application yet.
            </p>
          )}
        </CardContent>
      </Card>
      <Card className="w-full md:w-[22rem] md:shrink-0">
        <Collapsible open={transcriptOpen} onOpenChange={setTranscriptOpen}>
          <CardHeader className="pb-3">
            <CollapsibleTrigger
              className="flex w-full items-center justify-between gap-2 text-left"
              data-testid="ai-context-transcript-toggle"
            >
              <CardTitle className="text-sm font-medium">
                Interview transcript
              </CardTitle>
              {transcriptOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="flex flex-col gap-3">
              {data.interviewLog.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No transcript available.
                </p>
              ) : (
                data.interviewLog.map((entry, index) => (
                  <div
                    key={`${entry.role}-${index}`}
                    className="flex flex-col gap-1"
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {entry.role === "assistant" ? "Interviewer" : "You"}
                    </span>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                      {entry.content}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}

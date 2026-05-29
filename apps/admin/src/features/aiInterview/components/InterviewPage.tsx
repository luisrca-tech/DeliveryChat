import {
  useBootstrapInterviewMutation,
  useInterviewStateQuery,
} from "../hooks/useInterviewState";
import { InterviewChatScrollback } from "./InterviewChatScrollback";
import { InterviewIntroCard } from "./InterviewIntroCard";

export type InterviewPageProps = {
  applicationId: string;
};

export function InterviewPage({ applicationId }: InterviewPageProps) {
  const { data, isLoading, isError } = useInterviewStateQuery(applicationId);
  const bootstrap = useBootstrapInterviewMutation(applicationId);

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading interview...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6 text-sm text-destructive">
        Unable to load the interview.
      </div>
    );
  }

  if (data.status === "not_started") {
    return (
      <div className="p-6">
        <InterviewIntroCard
          onStart={() => bootstrap.mutate()}
          isStarting={bootstrap.isPending}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <InterviewChatScrollback log={data.interviewLog} />
    </div>
  );
}

import {
  INTERVIEW_MAX_TURNS,
  INTERVIEW_SUGGESTED_MAX,
  INTERVIEW_SUGGESTED_MIN,
  progressToneForTurn,
} from "../lib/interviewProgress";

export type InterviewProgressChipProps = {
  displayTurn: number;
};

const toneClass: Record<ReturnType<typeof progressToneForTurn>, string> = {
  neutral: "bg-muted text-muted-foreground",
  green: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
};

export function InterviewProgressChip({ displayTurn }: InterviewProgressChipProps) {
  const tone = progressToneForTurn(displayTurn);
  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${toneClass[tone]}`}
          data-tone={tone}
        >
          Turn {displayTurn} of {INTERVIEW_MAX_TURNS}
        </span>
      </div>
      <span className="text-muted-foreground">
        Suggested finish: {INTERVIEW_SUGGESTED_MIN}–{INTERVIEW_SUGGESTED_MAX}
      </span>
    </div>
  );
}

import {
  INTERVIEW_MAX_TURNS,
  INTERVIEW_SUGGESTED_MAX,
  INTERVIEW_SUGGESTED_MIN,
  progressToneForTurn,
} from "../lib/interviewProgress";

export type InterviewRulerProps = {
  displayTurn: number;
};

const TONE_TEXT: Record<ReturnType<typeof progressToneForTurn>, string> = {
  neutral: "text-[var(--interview-color-muted)]",
  green: "text-[var(--interview-color-accent)]",
  amber: "text-[var(--interview-color-amber)]",
};

const TONE_RULE: Record<ReturnType<typeof progressToneForTurn>, string> = {
  neutral: "bg-[var(--interview-color-rule)]",
  green: "bg-[var(--interview-color-accent)]",
  amber: "bg-[var(--interview-color-amber)]",
};

const ZONE1_LEN = INTERVIEW_SUGGESTED_MIN - 1; // 1..7
const ZONE2_LEN = INTERVIEW_SUGGESTED_MAX - INTERVIEW_SUGGESTED_MIN + 1; // 8..12

function zoneFillFor(displayTurn: number, zoneStart: number, zoneLen: number) {
  if (displayTurn < zoneStart) return 0;
  if (displayTurn >= zoneStart + zoneLen) return 1;
  return (displayTurn - zoneStart + 1) / zoneLen;
}

export function InterviewRuler({ displayTurn }: InterviewRulerProps) {
  const tone = progressToneForTurn(displayTurn);
  const numeralTone = TONE_TEXT[tone];

  const zoneFill1 = zoneFillFor(displayTurn, 1, ZONE1_LEN);
  const zoneFill2 = zoneFillFor(
    displayTurn,
    INTERVIEW_SUGGESTED_MIN,
    ZONE2_LEN,
  );

  return (
    <div
      data-tone={tone}
      aria-label={`Turn ${displayTurn} of ${INTERVIEW_MAX_TURNS}`}
      className="flex w-full max-w-md items-center gap-4"
    >
      <span
        className={`interview-display text-4xl font-medium leading-none md:text-5xl ${numeralTone}`}
        aria-hidden="true"
      >
        {displayTurn}
      </span>
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="hidden items-end gap-1 md:flex">
          <RulerZone
            label="OPENING"
            labelHint="1–7"
            fill={zoneFill1}
            toneClass={TONE_RULE.neutral}
          />
          <RulerZone
            label="SUGGESTED"
            labelHint="8–12"
            fill={zoneFill2}
            toneClass={TONE_RULE.green}
          />
        </div>
        <div className="flex items-center gap-1 md:hidden">
          <CompressedZone fill={zoneFill1} toneClass={TONE_RULE.neutral} />
          <CompressedZone fill={zoneFill2} toneClass={TONE_RULE.green} />
        </div>
        <p className="interview-eyebrow text-[var(--interview-color-muted)]">
          Turn {displayTurn} of {INTERVIEW_MAX_TURNS}
        </p>
      </div>
    </div>
  );
}

function RulerZone({
  label,
  labelHint,
  fill,
  toneClass,
}: {
  label: string;
  labelHint: string;
  fill: number;
  toneClass: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="relative h-px w-full bg-[var(--interview-color-rule)]">
        <div
          className={`absolute inset-y-0 left-0 ${toneClass}`}
          style={{ width: `${Math.round(fill * 100)}%` }}
        />
      </div>
      <p className="interview-eyebrow text-[var(--interview-color-muted)]">
        {label} <span className="opacity-60">{labelHint}</span>
      </p>
    </div>
  );
}

function CompressedZone({
  fill,
  toneClass,
}: {
  fill: number;
  toneClass: string;
}) {
  return (
    <div className="relative h-0.5 flex-1 bg-[var(--interview-color-rule)]">
      <div
        className={`absolute inset-y-0 left-0 ${toneClass}`}
        style={{ width: `${Math.round(fill * 100)}%` }}
      />
    </div>
  );
}

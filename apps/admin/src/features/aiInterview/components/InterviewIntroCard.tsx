import "../styles/interview-theme.css";
import { InterviewEyebrow } from "./InterviewEyebrow";
import { InterviewTextLink } from "./InterviewTextLink";

export type InterviewIntroCardProps = {
  onStart: () => void;
  isStarting: boolean;
};

const TOPICS = [
  "Brand voice",
  "Audience",
  "Products",
  "Tone",
  "Support scenarios",
];

export function InterviewIntroCard({
  onStart,
  isStarting,
}: InterviewIntroCardProps) {
  return (
    <section className="interview-theme min-h-[100dvh] w-full">
      <div className="mx-auto flex max-w-2xl flex-col gap-10 px-6 py-16 md:py-24">
        <header className="flex flex-col gap-6">
          <InterviewEyebrow>AI Context · New Interview</InterviewEyebrow>
          <h1 className="interview-display text-4xl font-medium leading-[1.1] tracking-tight md:text-5xl">
            Let's give your assistant a voice.
          </h1>
          <p className="interview-italic max-w-[52ch] text-lg leading-relaxed text-[var(--interview-color-muted)] md:text-xl">
            A short, guided interview so the AI understands your business,
            audience, and the way you sound. Your answers become the brief it
            speaks from.
          </p>
        </header>

        <p className="max-w-[60ch] text-sm leading-relaxed text-[var(--interview-color-muted)]">
          Eight to twelve turns. You can finish early once we have enough to
          build a useful brief. Nothing is shown to visitors until you review
          and confirm the result.
        </p>

        <div>
          <InterviewTextLink
            onClick={onStart}
            loading={isStarting}
            loadingLabel="Starting…"
            data-testid="interview-begin-cta"
          >
            Begin interview
          </InterviewTextLink>
        </div>

        <ul
          aria-label="Interview topics"
          className="interview-eyebrow flex flex-wrap gap-x-3 gap-y-2 pt-4 text-[var(--interview-color-muted)]"
        >
          {TOPICS.map((topic, idx) => (
            <li key={topic} className="flex items-center gap-3">
              {idx > 0 ? (
                <span aria-hidden="true" className="opacity-60">
                  ·
                </span>
              ) : null}
              <span>{topic}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

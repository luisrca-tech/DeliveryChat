import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { InterviewQuestionBlock } from "./InterviewQuestionBlock";

describe("InterviewQuestionBlock", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders title-cased topic and round in the eyebrow", () => {
    render(
      <InterviewQuestionBlock topic="brand_voice" round={3}>
        What words does your brand never use?
      </InterviewQuestionBlock>,
    );
    const eyebrow = screen.getByText(/Brand Voice · Round 3/i);
    expect(eyebrow.getAttribute("data-variant")).toBe("default");
    expect(
      screen.getByText("What words does your brand never use?"),
    ).toBeTruthy();
  });

  it("falls back to Discovery when topic is missing", () => {
    render(
      <InterviewQuestionBlock round={1}>Question</InterviewQuestionBlock>,
    );
    expect(screen.getByText(/Discovery · Round 1/i)).toBeTruthy();
  });

  it("falls back to Discovery when topic is empty string", () => {
    render(
      <InterviewQuestionBlock topic="   " round={2}>
        Q
      </InterviewQuestionBlock>,
    );
    expect(screen.getByText(/Discovery · Round 2/i)).toBeTruthy();
  });

  it("renders FINAL QUESTION eyebrow with accent tone and no topic when intent=final_question", () => {
    render(
      <InterviewQuestionBlock
        topic="brand_voice"
        round={8}
        intent="final_question"
      >
        Anything else you want the assistant to remember?
      </InterviewQuestionBlock>,
    );
    const eyebrow = screen.getByText(/Final question/i);
    expect(eyebrow.getAttribute("data-variant")).toBe("final");
    expect(eyebrow.textContent).not.toContain("Brand Voice");
    expect(eyebrow.textContent).not.toContain("Round");
  });

  it("renders LET'S REFOCUS eyebrow with amber tone when guardrailAction=pushback_garbage", () => {
    render(
      <InterviewQuestionBlock
        topic="brand_voice"
        round={2}
        guardrailAction="pushback_garbage"
      >
        Let's go again — what words does your brand never use?
      </InterviewQuestionBlock>,
    );
    const eyebrow = screen.getByText(/Let's refocus · Brand Voice/i);
    expect(eyebrow.getAttribute("data-variant")).toBe("refocus");
  });

  it("renders STAYING ON TRACK eyebrow with amber tone when guardrailAction=redirect_scope", () => {
    render(
      <InterviewQuestionBlock
        topic="audience"
        round={4}
        guardrailAction="redirect_scope"
      >
        Let's circle back — who is the assistant talking to?
      </InterviewQuestionBlock>,
    );
    const eyebrow = screen.getByText(/Staying on track · Audience/i);
    expect(eyebrow.getAttribute("data-variant")).toBe("staying");
  });

  it("prioritizes final intent over guardrail action", () => {
    render(
      <InterviewQuestionBlock
        topic="audience"
        round={8}
        intent="final_question"
        guardrailAction="pushback_garbage"
      >
        Final?
      </InterviewQuestionBlock>,
    );
    const eyebrow = screen.getByText(/Final question/i);
    expect(eyebrow.getAttribute("data-variant")).toBe("final");
  });
});

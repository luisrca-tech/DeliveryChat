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
    expect(screen.getByText(/Brand Voice · Round 3/i)).toBeTruthy();
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
});

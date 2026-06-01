import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { InterviewAnswerBlock } from "./InterviewAnswerBlock";

describe("InterviewAnswerBlock", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the answer content", () => {
    render(<InterviewAnswerBlock>My answer goes here.</InterviewAnswerBlock>);
    expect(screen.getByText("My answer goes here.")).toBeTruthy();
  });
});

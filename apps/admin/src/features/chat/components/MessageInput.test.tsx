import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { MessageInput } from "./MessageInput";

const mockGenerate = vi.fn();
const mockCancelGenerate = vi.fn();
let mockIsGenerating = false;

const mockImprove = vi.fn();
const mockCancelImprove = vi.fn();
let mockIsImproving = false;

let mockAiAvailable = true;

vi.mock("@/features/ai/hooks/useGenerateReply", () => ({
  useGenerateReply: ({ onSuccess }: { onSuccess: (text: string) => void }) => {
    mockGenerate.mockImplementation(() => {
      if (!mockIsGenerating) onSuccess("**AI generated** reply");
    });
    return {
      generate: mockGenerate,
      cancel: mockCancelGenerate,
      isGenerating: mockIsGenerating,
    };
  },
}));

vi.mock("@/features/ai/hooks/useImproveMessage", () => ({
  useImproveMessage: ({ onSuccess }: { onSuccess: (text: string) => void }) => {
    mockImprove.mockImplementation(() => {
      if (!mockIsImproving) onSuccess("## Improved\n\n**better** message");
    });
    return {
      improve: mockImprove,
      cancel: mockCancelImprove,
      isImproving: mockIsImproving,
    };
  },
}));

vi.mock("@/features/ai/hooks/useAiAvailability", () => ({
  useAiAvailability: () => ({
    isAvailable: mockAiAvailable,
    servingAvailable: mockAiAvailable,
    appConfigured: true,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const defaultProps = {
  onSend: vi.fn(),
  onTypingStart: vi.fn(),
  onTypingStop: vi.fn(),
  disabled: false,
  placeholder: "Type a message...",
  conversationId: "conv-123",
};

describe("MessageInput", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsGenerating = false;
    mockIsImproving = false;
    mockAiAvailable = true;
  });

  it("renders the AI generate button when AI is available", () => {
    render(<MessageInput {...defaultProps} />);
    expect(screen.getByTitle("Generate AI reply")).toBeDefined();
  });

  it("hides the AI generate button when AI is not available (FREE/BASIC plan)", () => {
    mockAiAvailable = false;
    render(<MessageInput {...defaultProps} />);
    expect(screen.queryByTitle("Generate AI reply")).toBeNull();
  });

  it("calls generate with conversationId when clicked", () => {
    render(<MessageInput {...defaultProps} />);

    fireEvent.click(screen.getByTitle("Generate AI reply"));
    expect(mockGenerate).toHaveBeenCalledWith("conv-123");
  });

  it("shows AI suggestion indicator on generate success", () => {
    render(<MessageInput {...defaultProps} />);

    fireEvent.click(screen.getByTitle("Generate AI reply"));
    expect(screen.getByText("AI suggestion")).toBeDefined();
  });

  it("shows clear button for AI suggestion and clears on click", () => {
    render(<MessageInput {...defaultProps} />);

    fireEvent.click(screen.getByTitle("Generate AI reply"));
    expect(screen.getByText("Clear")).toBeDefined();

    fireEvent.click(screen.getByText("Clear"));
    expect(screen.queryByText("AI suggestion")).toBeNull();
  });

  it("shows cancel button during generation", () => {
    mockIsGenerating = true;
    render(<MessageInput {...defaultProps} />);
    expect(screen.getByTitle("Cancel generation")).toBeDefined();
  });

  it("shows improve button when AI is available", () => {
    render(<MessageInput {...defaultProps} />);
    expect(
      screen.getByTitle("Type a message first to improve it"),
    ).toBeDefined();
  });

  it("hides improve button when AI is not available", () => {
    mockAiAvailable = false;
    render(<MessageInput {...defaultProps} />);
    expect(
      screen.queryByTitle("Type a message first to improve it"),
    ).toBeNull();
    expect(screen.queryByTitle("Improve message with AI")).toBeNull();
  });

  it("disables AI generate button while improving is in-flight", () => {
    mockIsImproving = true;
    render(<MessageInput {...defaultProps} />);

    const generateBtn = screen.getByTitle(
      "Clear the input to generate an AI reply",
    );
    expect(generateBtn.hasAttribute("disabled")).toBe(true);
  });

  it("renders the send button", () => {
    render(<MessageInput {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the Lexical editor contenteditable", () => {
    const { container } = render(<MessageInput {...defaultProps} />);
    const contentEditable = container.querySelector("[contenteditable]");
    expect(contentEditable).not.toBeNull();
  });

  it("shows improvement review UI on improve success after generating content", async () => {
    render(<MessageInput {...defaultProps} />);

    fireEvent.click(screen.getByTitle("Generate AI reply"));

    await waitFor(() => {
      expect(screen.queryByTitle("Improve message with AI")).not.toBeNull();
    });

    fireEvent.click(screen.getByTitle("Improve message with AI"));

    expect(screen.getByText("AI improvement")).toBeDefined();
    expect(screen.getByText("Accept")).toBeDefined();
    expect(screen.getByText("Reject")).toBeDefined();
  });

  it("hides improvement review UI when Accept is clicked", async () => {
    render(<MessageInput {...defaultProps} />);

    fireEvent.click(screen.getByTitle("Generate AI reply"));

    await waitFor(() => {
      expect(screen.queryByTitle("Improve message with AI")).not.toBeNull();
    });

    fireEvent.click(screen.getByTitle("Improve message with AI"));
    expect(screen.getByText("AI improvement")).toBeDefined();

    fireEvent.click(screen.getByText("Accept"));
    expect(screen.queryByText("AI improvement")).toBeNull();
  });
});

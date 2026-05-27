import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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
      if (!mockIsGenerating) onSuccess("AI generated reply");
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
      if (!mockIsImproving) onSuccess("Improved message text");
    });
    return {
      improve: mockImprove,
      cancel: mockCancelImprove,
      isImproving: mockIsImproving,
    };
  },
}));

vi.mock("@/features/ai/hooks/useAiAvailability", () => ({
  useAiAvailability: () => ({ isAvailable: mockAiAvailable }),
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

  it("shows AI suggestion indicator on success", () => {
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
    expect(screen.getByTitle("Improve message with AI")).toBeDefined();
  });

  it("hides improve button when AI is not available", () => {
    mockAiAvailable = false;
    render(<MessageInput {...defaultProps} />);
    expect(screen.queryByTitle("Improve message with AI")).toBeNull();
  });

  it("disables both AI buttons while either action is in-flight", () => {
    mockIsImproving = true;
    render(<MessageInput {...defaultProps} />);

    const buttons = screen.getAllByRole("button");
    const generateBtn = buttons[0]!;
    const improveBtn = buttons[1]!;

    expect(generateBtn.hasAttribute("disabled")).toBe(true);
    expect(improveBtn.hasAttribute("disabled")).toBe(true);
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
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MessageInput } from "./MessageInput";

const mockGenerate = vi.fn();
const mockCancel = vi.fn();
let mockIsGenerating = false;
let mockAiAvailable = true;

vi.mock("@/features/ai/hooks/useGenerateReply", () => ({
  useGenerateReply: ({ onSuccess }: { onSuccess: (text: string) => void }) => {
    mockGenerate.mockImplementation(() => {
      if (!mockIsGenerating) onSuccess("AI generated reply");
    });
    return {
      generate: mockGenerate,
      cancel: mockCancel,
      isGenerating: mockIsGenerating,
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

  it("enables the generate button only when input is empty", () => {
    render(<MessageInput {...defaultProps} />);

    const generateBtn = screen.getByTitle("Generate AI reply");
    expect(generateBtn.hasAttribute("disabled")).toBe(false);

    const input = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(input, { target: { value: "hello" } });

    expect(
      screen.getByTitle("Clear the input to generate an AI reply").hasAttribute("disabled"),
    ).toBe(true);
  });

  it("calls generate with conversationId when clicked", () => {
    render(<MessageInput {...defaultProps} />);

    fireEvent.click(screen.getByTitle("Generate AI reply"));
    expect(mockGenerate).toHaveBeenCalledWith("conv-123");
  });

  it("populates input with AI suggestion on success", () => {
    render(<MessageInput {...defaultProps} />);

    fireEvent.click(screen.getByTitle("Generate AI reply"));

    expect(screen.getByDisplayValue("AI generated reply")).toBeDefined();
    expect(screen.getByText("AI suggestion")).toBeDefined();
  });

  it("shows clear button for AI suggestion and clears on click", () => {
    render(<MessageInput {...defaultProps} />);

    fireEvent.click(screen.getByTitle("Generate AI reply"));
    expect(screen.getByText("Clear")).toBeDefined();

    fireEvent.click(screen.getByText("Clear"));
    expect(screen.queryByText("AI suggestion")).toBeNull();
    expect(screen.getByDisplayValue("")).toBeDefined();
  });

  it("removes AI indicator when user edits the suggestion", () => {
    render(<MessageInput {...defaultProps} />);

    fireEvent.click(screen.getByTitle("Generate AI reply"));
    expect(screen.getByText("AI suggestion")).toBeDefined();

    const input = screen.getByDisplayValue("AI generated reply");
    fireEvent.change(input, { target: { value: "edited text" } });

    expect(screen.queryByText("AI suggestion")).toBeNull();
  });

  it("allows sending AI suggestion via Enter", () => {
    render(<MessageInput {...defaultProps} />);

    fireEvent.click(screen.getByTitle("Generate AI reply"));
    const input = screen.getByDisplayValue("AI generated reply");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(defaultProps.onSend).toHaveBeenCalledWith("AI generated reply");
  });

  it("disables input and send button during generation", () => {
    mockIsGenerating = true;
    render(<MessageInput {...defaultProps} />);

    const input = screen.getByPlaceholderText("Generating AI reply...");
    expect(input.hasAttribute("disabled")).toBe(true);

    const buttons = screen.getAllByRole("button");
    const sendBtn = buttons[buttons.length - 1];
    expect(sendBtn.hasAttribute("disabled")).toBe(true);
  });

  it("shows cancel button during generation", () => {
    mockIsGenerating = true;
    render(<MessageInput {...defaultProps} />);
    expect(screen.getByTitle("Cancel generation")).toBeDefined();
  });

  it("sends message on Enter key", () => {
    render(<MessageInput {...defaultProps} />);

    const input = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(defaultProps.onSend).toHaveBeenCalledWith("hello");
  });

  it("does not send empty messages", () => {
    render(<MessageInput {...defaultProps} />);

    const input = screen.getByPlaceholderText("Type a message...");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(defaultProps.onSend).not.toHaveBeenCalled();
  });
});

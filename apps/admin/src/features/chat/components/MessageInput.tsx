import { useState, useRef } from "react";
import { Send } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";

type Props = {
  onSend: (content: string) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  disabled: boolean;
  placeholder: string;
};

const TYPING_THROTTLE_MS = 2_000;

export function MessageInput({ onSend, onTypingStart, onTypingStop, disabled, placeholder }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTypingSentRef = useRef(0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    if (newValue.length === 0) {
      onTypingStop();
      lastTypingSentRef.current = 0;
      return;
    }

    const now = Date.now();
    if (now - lastTypingSentRef.current >= TYPING_THROTTLE_MS) {
      lastTypingSentRef.current = now;
      onTypingStart();
    }
  };

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    lastTypingSentRef.current = 0;
    inputRef.current?.focus();
  };

  return (
    <div className="p-3 border-t border-border bg-card/50 shrink-0">
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

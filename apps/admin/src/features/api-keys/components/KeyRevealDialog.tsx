import { useState } from "react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Copy, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export type KeyRevealDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;
  keyPrefix: string;
};

function maskKey(key: string | undefined, prefix: string | undefined): string {
  const k = key ?? "";
  const p = prefix ?? "";
  const visibleLen = Math.min(p.length, k.length);
  return `${k.slice(0, visibleLen)}${"•".repeat(Math.max(0, k.length - visibleLen))}`;
}

export function KeyRevealDialog({
  open,
  onOpenChange,
  apiKey: fullKey,
  keyPrefix,
}: KeyRevealDialogProps) {
  const [visible, setVisible] = useState(true);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(fullKey ?? "");
    toast.success("API key copied to clipboard");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Your API key</DialogTitle>
          <DialogDescription>
            Save this key now. You won&apos;t be able to see it again.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={visible ? (fullKey ?? "") : maskKey(fullKey, keyPrefix)}
              className="font-mono text-sm bg-muted/50 border-input text-foreground"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? "Hide key" : "Show key"}
            >
              {visible ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={copyToClipboard}
              aria-label="Copy key"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <p>
              This is the only time you&apos;ll see the full key. Store it
              securely. If you lose it, you&apos;ll need to regenerate a new
              key.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            I&apos;ve saved it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

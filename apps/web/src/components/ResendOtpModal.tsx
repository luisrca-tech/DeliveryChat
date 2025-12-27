import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { AlertCircle, Mail } from "lucide-react";

interface ResendOtpModalProps {
  open: boolean;
  email: string;
  onClose: () => void;
  onGoToVerification: () => void;
}

export default function ResendOtpModal({
  open,
  email,
  onClose,
  onGoToVerification,
}: ResendOtpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <DialogTitle>Account Already Created</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            We found an account with this email that hasn't been verified yet.
            We've sent a new verification code to your email.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 border border-border">
            <AlertCircle className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Check your email</p>
              <p className="text-sm text-muted-foreground">
                A verification code has been sent to <strong>{email}</strong>
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onGoToVerification}>
            Go to Verification Screen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

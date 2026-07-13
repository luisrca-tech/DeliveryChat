import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { DataSourceSection } from "./DataSourceSection";

export type ConnectionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
};

export function ConnectionDialog({
  open,
  onOpenChange,
  applicationId,
}: ConnectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Data source connection</DialogTitle>
          <DialogDescription>
            How the AI reaches your systems. Secrets are write-only — saved
            values are never shown again.
          </DialogDescription>
        </DialogHeader>

        <DataSourceSection
          applicationId={applicationId}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

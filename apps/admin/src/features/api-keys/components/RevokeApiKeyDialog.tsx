import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";

export type RevokeApiKeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
  keyName: string | null;
  keyPrefix: string;
  revoking?: boolean;
};

export function RevokeApiKeyDialog({
  open,
  onOpenChange,
  onConfirm,
  keyName,
  keyPrefix,
  revoking,
}: RevokeApiKeyDialogProps) {
  const label = keyName || keyPrefix || "this key";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke API key</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to revoke &quot;{label}&quot;? This will
            invalidate the key immediately. Any integrations using it will stop
            working.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={revoking}
          >
            {revoking ? "Revoking..." : "Revoke"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

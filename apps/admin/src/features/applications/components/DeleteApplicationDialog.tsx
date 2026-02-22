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
import type { Application } from "../types/applications.types";

export type DeleteApplicationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: Application | null;
  activeApiKeysCount: number;
  onConfirm: () => Promise<void> | void;
  deleting?: boolean;
};

export function DeleteApplicationDialog({
  open,
  onOpenChange,
  application,
  activeApiKeysCount,
  onConfirm,
  deleting,
}: DeleteApplicationDialogProps) {
  const label = application?.name ?? application?.domain ?? "this application";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete application</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{label}&quot;? This action
            cannot be undone.
            {activeApiKeysCount > 0 && (
              <span className="mt-2 block font-medium text-destructive">
                This will also revoke {activeApiKeysCount} active API key
                {activeApiKeysCount !== 1 ? "s" : ""}.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

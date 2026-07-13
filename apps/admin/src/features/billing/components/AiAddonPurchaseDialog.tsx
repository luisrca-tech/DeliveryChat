import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import { Button } from "@repo/ui/components/ui/button";
import { useAiAddonPreviewQuery } from "../hooks/useAiAddon";
import { useCreatePortalSessionMutation } from "../hooks/useBillingPortal";
import { formatMoney } from "../utils/billing.utils";

type AiAddonPurchaseDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  isConfirming: boolean;
};

function formatBillingDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function AiAddonPurchaseDialog({
  open,
  onOpenChange,
  onConfirm,
  isConfirming,
}: AiAddonPurchaseDialogProps) {
  const preview = useAiAddonPreviewQuery(open);
  const portal = useCreatePortalSessionMutation();

  const openPortal = async () => {
    try {
      const result = await portal.mutateAsync();
      window.location.href = result.url;
    } catch (e) {
      toast.error("Unable to open billing portal", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const canConfirm = preview.isSuccess && !isConfirming;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Enable AI Assistant add-on</AlertDialogTitle>
          <AlertDialogDescription>
            Review the charges before enabling the add-on.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          {preview.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading pricing…
            </div>
          ) : preview.isError ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">
                We couldn&apos;t load the pricing preview. Please try again.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => preview.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : preview.data ? (
            <p className="text-sm text-foreground">
              You&apos;ll be charged a prorated{" "}
              <strong>
                {formatMoney(preview.data.prorationAmount, preview.data.currency)}
              </strong>{" "}
              now, then{" "}
              <strong>
                {formatMoney(preview.data.recurringAmount, preview.data.currency)}
                /month
              </strong>{" "}
              starting {formatBillingDate(preview.data.nextBillingDate)}, on your
              organization&apos;s payment method.
            </p>
          ) : null}

          <button
            type="button"
            onClick={openPortal}
            disabled={portal.isPending}
            className="text-sm text-primary hover:underline disabled:opacity-60"
          >
            {portal.isPending ? "Opening…" : "Manage payment method"}
          </button>
        </div>

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isConfirming}
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={() => onConfirm()} disabled={!canConfirm}>
            <Check className="mr-2 h-4 w-4" />
            {isConfirming ? "Enabling…" : "Confirm & enable"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

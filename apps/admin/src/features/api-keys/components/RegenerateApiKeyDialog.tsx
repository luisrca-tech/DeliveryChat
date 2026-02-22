import { useMemo } from "react";
import { useForm } from "react-hook-form";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import type { RegenerateApiKeyRequest } from "../types/api-keys.types";

export type RegenerateApiKeyFormValues = RegenerateApiKeyRequest & {
  name?: string;
  expiresAt?: string;
};

export type RegenerateApiKeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (values: RegenerateApiKeyRequest) => Promise<void> | void;
  keyName: string | null;
  keyPrefix: string;
  regenerating?: boolean;
};

export function RegenerateApiKeyDialog({
  open,
  onOpenChange,
  onConfirm,
  keyName,
  keyPrefix,
  regenerating,
}: RegenerateApiKeyDialogProps) {
  const form = useForm<RegenerateApiKeyFormValues>({
    defaultValues: {
      name: "",
      expiresAt: "",
    },
  });

  const disabled = useMemo(() => !!regenerating, [regenerating]);
  const label = keyName || keyPrefix || "this key";

  const handleOpenChange = (next: boolean) => {
    if (next) {
      form.reset({ name: "", expiresAt: "" });
    }
    onOpenChange(next);
  };

  const submit = form.handleSubmit(async (values) => {
    await onConfirm({
      name: values.name?.trim() || undefined,
      expiresAt: values.expiresAt?.trim()
        ? new Date(values.expiresAt).toISOString()
        : undefined,
    });
  });

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <form onSubmit={submit} className="space-y-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate API key</AlertDialogTitle>
            <AlertDialogDescription>
              Regenerating &quot;{label}&quot; will invalidate the current key
              and create a new one. The new key will be shown once.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="regen_key_name">New name (optional)</Label>
              <Input
                id="regen_key_name"
                placeholder="e.g. Production key"
                maxLength={255}
                {...form.register("name")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="regen_key_expiresAt">
                New expires at (optional)
              </Label>
              <Input
                id="regen_key_expiresAt"
                type="datetime-local"
                {...form.register("expiresAt")}
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={disabled}>
              Cancel
            </AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={disabled}>
              {disabled ? "Regenerating..." : "Regenerate"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

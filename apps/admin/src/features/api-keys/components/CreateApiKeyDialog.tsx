import { useMemo } from "react";
import { useForm } from "react-hook-form";
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
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import type {
  ApiKeyEnvironment,
  CreateApiKeyRequest,
} from "../types/api-keys.types";

export type CreateApiKeyFormValues = CreateApiKeyRequest & {
  name?: string;
  environment: ApiKeyEnvironment;
  expiresAt?: string;
};

export type CreateApiKeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateApiKeyRequest) => Promise<void> | void;
  submitting?: boolean;
};

export function CreateApiKeyDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting,
}: CreateApiKeyDialogProps) {
  const form = useForm<CreateApiKeyFormValues>({
    defaultValues: {
      name: "",
      environment: "live",
      expiresAt: "",
    },
  });

  const disabled = useMemo(() => !!submitting, [submitting]);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      form.reset({ name: "", environment: "live", expiresAt: "" });
    }
    onOpenChange(next);
  };

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      name: values.name?.trim() || undefined,
      environment: values.environment,
      expiresAt: values.expiresAt?.trim()
        ? new Date(values.expiresAt).toISOString()
        : undefined,
    });
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API key</DialogTitle>
          <DialogDescription>
            Create a new API key for this application. The full key will be
            shown once.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="create_key_name">Name (optional)</Label>
            <Input
              id="create_key_name"
              placeholder="e.g. Production key"
              maxLength={255}
              {...form.register("name")}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="create_key_environment">Environment</Label>
            <Select
              value={form.watch("environment")}
              onValueChange={(v) =>
                form.setValue("environment", v as ApiKeyEnvironment)
              }
            >
              <SelectTrigger id="create_key_environment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="live">Production (live)</SelectItem>
                <SelectItem value="test">Test</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="create_key_expiresAt">Expires at (optional)</Label>
            <Input
              id="create_key_expiresAt"
              type="datetime-local"
              {...form.register("expiresAt")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={disabled}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={disabled}>
              {disabled ? "Creating..." : "Create key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

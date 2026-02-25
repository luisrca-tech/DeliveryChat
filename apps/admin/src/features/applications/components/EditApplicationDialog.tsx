import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import type {
  Application,
  UpdateApplicationRequest,
} from "../types/applications.types";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
});

export type EditApplicationFormValues = z.infer<typeof schema>;

export type EditApplicationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: Application | null;
  onSubmit: (values: UpdateApplicationRequest) => Promise<void> | void;
  submitting?: boolean;
};

export function EditApplicationDialog({
  open,
  onOpenChange,
  application,
  onSubmit,
  submitting,
}: EditApplicationDialogProps) {
  const form = useForm<EditApplicationFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: application?.name ?? "",
      description: application?.description ?? "",
    },
    values: application
      ? {
          name: application.name,
          description: application.description ?? "",
        }
      : undefined,
  });

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit application</DialogTitle>
          <DialogDescription>
            Update application details. Domain cannot be changed to avoid
            breaking existing API keys.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="edit_app_domain">Domain (read-only)</Label>
            <Input
              id="edit_app_domain"
              value={application?.domain ?? ""}
              readOnly
              disabled
              className="font-mono bg-muted"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit_app_name">Name</Label>
            <Input
              id="edit_app_name"
              placeholder="e.g. My Chat Widget"
              maxLength={255}
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit_app_description">Description (optional)</Label>
            <Input
              id="edit_app_description"
              placeholder="Brief description"
              maxLength={500}
              {...form.register("description")}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

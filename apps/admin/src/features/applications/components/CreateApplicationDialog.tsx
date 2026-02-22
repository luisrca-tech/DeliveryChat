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
import { parseDomainFromInput } from "../lib/parseDomainFromInput";
import type { CreateApplicationRequest } from "../types/applications.types";

const domainRegex = /^(\*\.)?[a-z0-9][a-z0-9.-]*$/;

const schema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  domain: z
    .string()
    .min(1, "Domain or URL is required")
    .max(255)
    .transform((val) => parseDomainFromInput(val))
    .refine((val) => val.length > 0, "Enter a valid domain or URL")
    .refine((val) => domainRegex.test(val), {
      message: "Domain must be a valid hostname (e.g. app.example.com)",
    }),
  description: z.string().optional(),
});

export type CreateApplicationFormValues = z.infer<typeof schema>;

export type CreateApplicationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateApplicationRequest) => Promise<void> | void;
  submitting?: boolean;
};

export function CreateApplicationDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting,
}: CreateApplicationDialogProps) {
  const form = useForm<CreateApplicationFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      domain: "",
      description: "",
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (next) {
      form.reset({ name: "", domain: "", description: "" });
    }
    onOpenChange(next);
  };

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      name: values.name.trim(),
      domain: values.domain,
      description: values.description?.trim() || undefined,
    });
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create application</DialogTitle>
          <DialogDescription>
            Add a new application. The domain is used for API key validation and
            must be unique.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="create_app_name">Name</Label>
            <Input
              id="create_app_name"
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
            <Label htmlFor="create_app_domain">Domain or URL</Label>
            <Input
              id="create_app_domain"
              placeholder="e.g. https://app.example.com or app.example.com"
              maxLength={255}
              className="font-mono"
              {...form.register("domain")}
            />
            {form.formState.errors.domain && (
              <p className="text-sm text-destructive">
                {form.formState.errors.domain.message}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="create_app_description">
              Description (optional)
            </Label>
            <Input
              id="create_app_description"
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
              {submitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

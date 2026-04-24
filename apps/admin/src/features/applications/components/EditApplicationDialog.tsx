import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X, Plus } from "lucide-react";
import { DOMAIN_REGEX } from "@repo/types";
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

function validateDomain(value: string): string | null {
  const lower = value.toLowerCase().trim();
  if (!lower) return "Domain cannot be empty";
  if (!DOMAIN_REGEX.test(lower))
    return "Must be a valid hostname (e.g. app.example.com or *.example.com)";
  return null;
}

export function EditApplicationDialog({
  open,
  onOpenChange,
  application,
  onSubmit,
  submitting,
}: EditApplicationDialogProps) {
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>([]);
  const [newOrigin, setNewOrigin] = useState("");
  const [originError, setOriginError] = useState<string | null>(null);
  const [originsInitialized, setOriginsInitialized] = useState(false);

  if (application && !originsInitialized) {
    setAllowedOrigins(application.allowedOrigins ?? []);
    setOriginsInitialized(true);
  }

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

  const handleAddOrigin = useCallback(() => {
    const trimmed = newOrigin.toLowerCase().trim();
    const error = validateDomain(trimmed);
    if (error) {
      setOriginError(error);
      return;
    }
    if (allowedOrigins.includes(trimmed)) {
      setOriginError("This domain is already in the list");
      return;
    }
    setAllowedOrigins((prev) => [...prev, trimmed]);
    setNewOrigin("");
    setOriginError(null);
  }, [newOrigin, allowedOrigins]);

  const handleRemoveOrigin = useCallback((index: number) => {
    setAllowedOrigins((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleOriginKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddOrigin();
      }
    },
    [handleAddOrigin],
  );

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      allowedOrigins,
    });
  });

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setOriginsInitialized(false);
      setNewOrigin("");
      setOriginError(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
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

          <div className="grid gap-2">
            <Label>Allowed Domains</Label>
            <p className="text-xs text-muted-foreground">
              Origins permitted to load the widget. Supports wildcard subdomains
              (e.g. *.example.com).
            </p>

            {allowedOrigins.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {allowedOrigins.map((origin, i) => (
                  <span
                    key={origin}
                    className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-1 font-mono text-xs"
                  >
                    {origin}
                    <button
                      type="button"
                      onClick={() => handleRemoveOrigin(i)}
                      className="ml-1 rounded-sm hover:bg-destructive/20 p-0.5"
                      aria-label={`Remove ${origin}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                id="edit_app_new_origin"
                placeholder="e.g. app.example.com or *.example.com"
                value={newOrigin}
                onChange={(e) => {
                  setNewOrigin(e.target.value);
                  if (originError) setOriginError(null);
                }}
                onKeyDown={handleOriginKeyDown}
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddOrigin}
                aria-label="Add domain"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {originError && (
              <p className="text-sm text-destructive">{originError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
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

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Info, Sparkles } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
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
import { cn } from "@repo/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import { DOMAIN_REGEX } from "@repo/types";
import { parseDomainFromInput } from "../lib/parseDomainFromInput";
import type {
  Application,
  CreateApplicationRequest,
} from "../types/applications.types";

const productionSchema = z.object({
  kind: z.literal("production"),
  name: z.string().min(1, "Name is required").max(255),
  domain: z
    .string()
    .min(1, "Domain or URL is required")
    .max(255)
    .transform((val) => parseDomainFromInput(val))
    .refine((val) => val.length > 0, "Enter a valid domain or URL")
    .refine((val) => DOMAIN_REGEX.test(val), {
      message: "Domain must be a valid hostname (e.g. app.example.com)",
    }),
  port: z.unknown().optional(),
  description: z.string().optional(),
});

const testSchema = z.object({
  kind: z.literal("test"),
  name: z.string().min(1, "Name is required").max(255),
  domain: z.unknown().optional(),
  port: z.coerce
    .number({ invalid_type_error: "Port is required" })
    .int("Port must be an integer")
    .min(1, "Port must be between 1 and 65535")
    .max(65535, "Port must be between 1 and 65535"),
  description: z.string().optional(),
});

const schema = z.discriminatedUnion("kind", [productionSchema, testSchema]);

type FormValues = z.input<typeof schema>;

export type CreateApplicationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateApplicationRequest) => Promise<void> | void;
  submitting?: boolean;
  createdApplication?: Application | null;
};

const defaultValues: FormValues = {
  kind: "production",
  name: "",
  domain: "",
  description: "",
};

export function CreateApplicationDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting,
  createdApplication,
}: CreateApplicationDialogProps) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<"production" | "test">("production");
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  const portValue = form.watch("port");

  useEffect(() => {
    form.setValue("kind", kind);
    if (kind === "test") {
      form.setValue("domain", undefined);
    } else {
      form.setValue("port", undefined);
    }
    form.clearErrors(["domain", "port"]);
  }, [kind, form]);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setKind("production");
      form.reset(defaultValues);
    }
    onOpenChange(next);
  };

  const submit = form.handleSubmit(async (values) => {
    if (values.kind === "test") {
      await onSubmit({
        kind: "test",
        name: values.name.trim(),
        port: values.port,
        description: values.description?.trim() || undefined,
      });
    } else {
      await onSubmit({
        kind: "production",
        name: values.name.trim(),
        domain: values.domain as string,
        description: values.description?.trim() || undefined,
      });
    }
  });

  const handleConfigureNow = () => {
    if (!createdApplication) return;
    navigate({
      to: "/applications/$applicationId/ai-interview",
      params: { applicationId: createdApplication.id },
    });
    onOpenChange(false);
  };

  const portNumber = typeof portValue === "number" ? portValue : Number(portValue);
  const portPreview =
    Number.isFinite(portNumber) && portNumber > 0
      ? `localhost:${portNumber}`
      : "localhost:<port>";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {createdApplication ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Application created
              </DialogTitle>
              <DialogDescription>
                AI needs onboarding. Set up the AI context now so Generate Reply
                and Improve work for this application, or do it later.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Later
              </Button>
              <Button onClick={handleConfigureNow}>Configure AI now</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create application</DialogTitle>
              <DialogDescription>
                Add a new application. Production apps are validated by domain;
                test apps run on localhost and are pinned to a port.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-2">
                <Label>Kind</Label>
                <div
                  role="tablist"
                  aria-label="Application kind"
                  className="inline-flex h-9 items-center rounded-md bg-muted p-1 text-muted-foreground"
                >
                  {(["production", "test"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={kind === k}
                      onClick={() => setKind(k)}
                      className={cn(
                        "inline-flex items-center justify-center rounded-sm px-3 py-1 text-sm font-medium transition-all",
                        kind === k
                          ? "bg-background text-foreground shadow-sm"
                          : "hover:text-foreground",
                      )}
                    >
                      {k === "production" ? "Production" : "Test"}
                    </button>
                  ))}
                </div>
              </div>

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

              {kind === "production" ? (
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
                      {form.formState.errors.domain.message?.toString()}
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid gap-2">
                  <div className="flex items-center gap-1">
                    <Label htmlFor="create_app_port">Port</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label="Port pinning info"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Test apps are pinned to a single localhost port. Two
                          test apps in this tenant cannot share the same port.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Input
                    id="create_app_port"
                    type="number"
                    min={1}
                    max={65535}
                    placeholder="e.g. 3000"
                    className="font-mono"
                    {...form.register("port")}
                  />
                  <p className="text-xs text-muted-foreground font-mono">
                    {portPreview}
                  </p>
                  {form.formState.errors.port && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.port.message?.toString()}
                    </p>
                  )}
                </div>
              )}

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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

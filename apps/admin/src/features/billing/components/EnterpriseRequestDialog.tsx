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
import type { EnterpriseRequestDetails } from "../types/billing.types";

export type EnterpriseRequestDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (details: EnterpriseRequestDetails) => Promise<void> | void;
  submitting?: boolean;
};

export function EnterpriseRequestDialog({
  open,
  onOpenChange,
  onSubmit,
  submitting,
}: EnterpriseRequestDialogProps) {
  const form = useForm<EnterpriseRequestDetails>({
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      teamSize: undefined,
      notes: "",
    },
  });

  const disabled = useMemo(() => !!submitting, [submitting]);

  const handleOpenChange = (next: boolean) => {
    if (next) {
      form.reset({
        fullName: "",
        email: "",
        phone: "",
        teamSize: undefined,
        notes: "",
      });
    }
    onOpenChange(next);
  };

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      ...values,
      teamSize:
        typeof values.teamSize === "number" && Number.isFinite(values.teamSize)
          ? values.teamSize
          : undefined,
    });
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Enterprise</DialogTitle>
          <DialogDescription>
            Tell us a bit about your needs so we can tailor the enterprise plan.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="enterprise_fullName">Full name</Label>
            <Input
              id="enterprise_fullName"
              autoComplete="name"
              placeholder="Jane Doe"
              {...form.register("fullName", { required: true })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="enterprise_email">Work email</Label>
            <Input
              id="enterprise_email"
              type="email"
              autoComplete="email"
              placeholder="jane@company.com"
              {...form.register("email", { required: true })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="enterprise_phone">Phone (optional)</Label>
              <Input
                id="enterprise_phone"
                autoComplete="tel"
                placeholder="+55 11 99999-9999"
                {...form.register("phone")}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="enterprise_teamSize">Team size (optional)</Label>
              <Input
                id="enterprise_teamSize"
                type="number"
                min={1}
                placeholder="50"
                {...form.register("teamSize", { valueAsNumber: true, min: 1 })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="enterprise_notes">Notes (optional)</Label>
            <textarea
              id="enterprise_notes"
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              placeholder="What are you looking for? (SLA, SSO, volume, integrations, compliance, etc.)"
              {...form.register("notes")}
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
              {disabled ? "Sending..." : "Send request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

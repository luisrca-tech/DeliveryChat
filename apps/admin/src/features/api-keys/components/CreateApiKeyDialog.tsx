import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Calendar } from "@repo/ui/components/ui/calendar";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { cn } from "@repo/ui/lib/utils";
import type {
  ApiKeyEnvironment,
  CreateApiKeyRequest,
} from "../types/api-keys.types";

export type CreateApiKeyFormValues = Omit<CreateApiKeyRequest, "expiresAt"> & {
  name?: string;
  environment: ApiKeyEnvironment;
  expiresAt?: Date;
  neverExpire?: boolean;
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
      expiresAt: undefined,
      neverExpire: true,
    },
  });

  const disabled = useMemo(() => !!submitting, [submitting]);
  const neverExpire = form.watch("neverExpire");

  const handleOpenChange = (next: boolean) => {
    if (next) {
      form.reset({
        name: "",
        environment: "live",
        expiresAt: undefined,
        neverExpire: true,
      });
    }
    onOpenChange(next);
  };

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      name: values.name?.trim() || undefined,
      environment: values.environment,
      expiresAt:
        values.neverExpire || !values.expiresAt
          ? undefined
          : values.expiresAt.toISOString(),
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
            <div className="flex items-center gap-2">
              <Checkbox
                id="create_key_neverExpire"
                checked={neverExpire}
                onCheckedChange={(checked) => {
                  form.setValue("neverExpire", !!checked);
                  if (checked) form.setValue("expiresAt", undefined);
                }}
              />
              <Label
                htmlFor="create_key_neverExpire"
                className="cursor-pointer font-normal"
              >
                Never expire
              </Label>
            </div>

            {!neverExpire && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    data-empty={!form.watch("expiresAt")}
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !form.watch("expiresAt") && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.watch("expiresAt")
                      ? format(form.watch("expiresAt") as Date, "PPP")
                      : "Pick expiry date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.watch("expiresAt") as Date | undefined}
                    onSelect={(date) =>
                      form.setValue("expiresAt", date ?? undefined)
                    }
                    disabled={(date) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const compareDate = new Date(date);
                    compareDate.setHours(0, 0, 0, 0);
                    return compareDate < today;
                  }}
                  />
                </PopoverContent>
              </Popover>
            )}
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

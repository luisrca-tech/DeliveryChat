import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
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
import { Calendar } from "@repo/ui/components/ui/calendar";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import { cn } from "@repo/ui/lib/utils";
import type { RegenerateApiKeyRequest } from "../types/api-keys.types";

export type RegenerateApiKeyFormValues = Omit<
  RegenerateApiKeyRequest,
  "expiresAt"
> & {
  name?: string;
  expiresAt?: Date;
  neverExpire?: boolean;
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
      expiresAt: undefined,
      neverExpire: true,
    },
  });

  const disabled = useMemo(() => !!regenerating, [regenerating]);
  const label = keyName || keyPrefix || "this key";
  const neverExpire = form.watch("neverExpire");

  const handleOpenChange = (next: boolean) => {
    if (next) {
      form.reset({
        name: "",
        expiresAt: undefined,
        neverExpire: true,
      });
    }
    onOpenChange(next);
  };

  const submit = form.handleSubmit(async (values) => {
    await onConfirm({
      name: values.name?.trim() || undefined,
      expiresAt:
        values.neverExpire || !values.expiresAt
          ? undefined
          : values.expiresAt.toISOString(),
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
              <div className="flex items-center gap-2">
                <Checkbox
                  id="regen_key_neverExpire"
                  checked={neverExpire}
                  onCheckedChange={(checked) => {
                    form.setValue("neverExpire", !!checked);
                    if (checked) form.setValue("expiresAt", undefined);
                  }}
                />
                <Label
                  htmlFor="regen_key_neverExpire"
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

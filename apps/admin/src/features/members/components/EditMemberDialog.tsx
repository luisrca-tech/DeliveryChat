import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/authClient";
import { membersQueryKeys } from "../hooks/useMembersQuery";
import { MemberFormDialog, type MemberFormValues } from "./MemberFormDialog";

type Props = {
  organizationId: string;
  memberId: string;
  defaultValues: { name: string; email: string; role: "admin" | "operator" };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditMemberDialog({
  organizationId,
  memberId,
  defaultValues,
  open,
  onOpenChange,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async (values: MemberFormValues) => {
    if (values.role === defaultValues.role) {
      onOpenChange(false);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await authClient.organization.updateMemberRole({
        memberId,
        role: values.role,
        organizationId,
      });

      if (result.error) {
        toast.error("Failed to update member", {
          description: result.error.message ?? "Unknown error",
        });
        return;
      }

      toast.success("Member updated", {
        description: `${values.name || values.email} is now ${values.role}`,
      });
      queryClient.invalidateQueries({ queryKey: membersQueryKeys.all() });
      onOpenChange(false);
    } catch (e) {
      toast.error("Failed to update member", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MemberFormDialog
      open={open}
      onOpenChange={onOpenChange}
      onSubmit={handleSubmit}
      title="Edit Member"
      description="Update this member's role in the organization."
      submitLabel="Save Changes"
      defaultValues={defaultValues}
      emailDisabled
      isSubmitting={isSubmitting}
    />
  );
}

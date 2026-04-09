import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/authClient";
import { getApiBaseUrl } from "@/lib/urls";
import { getTenantHeaders } from "@/lib/tenantHeaders";
import { membersQueryKeys } from "../hooks/useMembersQuery";
import { MemberFormDialog, type MemberFormValues } from "./MemberFormDialog";

type Props = {
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function InviteMemberDialog({ organizationId, open, onOpenChange }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const handleSubmit = async (values: MemberFormValues) => {
    setIsSubmitting(true);
    try {
      const result = await authClient.organization.inviteMember({
        email: values.email,
        role: values.role,
        organizationId,
      });

      if (result.error) {
        toast.error("Failed to invite member", {
          description: result.error.message ?? result.error.code ?? "Unknown error",
        });
        return;
      }

      // Save the name on the invitation record if provided
      if (values.name && result.data?.id) {
        await fetch(`${getApiBaseUrl()}/users/invitations/${result.data.id}`, {
          method: "PATCH",
          headers: getTenantHeaders({ json: true }),
          body: JSON.stringify({ name: values.name }),
        }).catch(() => {
          // Non-critical — name is optional
        });
      }

      toast.success("Invitation sent", {
        description: `Invited ${values.name || values.email} as ${values.role}`,
      });
      queryClient.invalidateQueries({ queryKey: membersQueryKeys.all() });
      onOpenChange(false);
    } catch (e) {
      toast.error("Failed to invite member", {
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
      title="Invite Member"
      description="Send an invitation email to add a new member to your organization."
      submitLabel="Send Invite"
      isSubmitting={isSubmitting}
    />
  );
}

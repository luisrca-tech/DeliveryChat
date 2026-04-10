import { useState } from "react";
import { Users, UserPlus, Clock, MoreHorizontal, Pencil, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthSession } from "@/features/auth/hooks/useAuthSession";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { ConfirmDialog } from "@repo/ui/components/ui/confirm-dialog";
import { useMembersQuery, membersQueryKeys } from "../hooks/useMembersQuery";
import { InviteMemberDialog } from "./InviteMemberDialog";
import { EditMemberDialog } from "./EditMemberDialog";
import { authClient } from "@/lib/authClient";
import { getApiBaseUrl } from "@/lib/urls";
import { getTenantHeaders } from "@/lib/tenantHeaders";

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  operator: "Operator",
};

const roleColors: Record<string, string> = {
  super_admin: "bg-red-100 text-red-700",
  admin: "bg-purple-100 text-purple-700",
  operator: "bg-green-100 text-green-700",
};

const statusStyles: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  expired: "bg-red-100 text-red-600",
  rejected: "bg-red-100 text-red-600",
  canceled: "bg-gray-100 text-gray-500",
  accepted: "bg-green-100 text-green-700",
};

type UnifiedRow = {
  id: string;
  memberId?: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
  date: string;
  isYou: boolean;
  type: "member" | "invitation";
};

export function MembersPage() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UnifiedRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data, isLoading } = useMembersQuery();
  const queryClient = useQueryClient();
  const { data: authData } = useAuthSession();
  const currentUserId = authData?.user?.id;
  const organizationId = authData?.currentOrganization?.id;

  // Determine current user's role from the members list
  const currentUserRole = (data?.users ?? []).find(
    (m) => m.id === currentUserId,
  )?.role;
  const isAdminOrAbove =
    currentUserRole === "admin" || currentUserRole === "super_admin";

  const rows: UnifiedRow[] = [];

  for (const m of data?.users ?? []) {
    if (m.isAnonymous) continue;
    rows.push({
      id: m.id,
      memberId: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      status: "active",
      date: m.createdAt,
      isYou: m.id === currentUserId,
      type: "member",
    });
  }

  for (const inv of data?.invitations ?? []) {
    const isExpired =
      inv.status === "pending" && new Date(inv.expiresAt) < new Date();
    rows.push({
      id: `inv-${inv.id}`,
      name: null,
      email: inv.email,
      role: inv.role,
      status: isExpired ? "expired" : inv.status,
      date: inv.createdAt,
      isYou: false,
      type: "invitation",
    });
  }

  const handleResend = async (row: UnifiedRow) => {
    if (!organizationId) return;
    try {
      const result = await authClient.organization.inviteMember({
        email: row.email,
        role: row.role as "admin" | "operator",
        organizationId,
        resend: true,
      });
      if (result.error) {
        toast.error("Failed to resend", {
          description: result.error.message ?? "Unknown error",
        });
        return;
      }
      toast.success("Invitation resent", {
        description: `Resent invitation to ${row.email}`,
      });
    } catch (e) {
      toast.error("Failed to resend", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !organizationId) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.type === "member") {
        const result = await authClient.organization.removeMember({
          memberIdOrEmail: deleteTarget.email,
          organizationId,
        });
        if (result.error) {
          toast.error("Failed to remove member", {
            description: result.error.message ?? "Unknown error",
          });
          return;
        }
        toast.success("Member removed");
      } else if (deleteTarget.type === "invitation" && deleteTarget.status === "pending") {
        const invId = deleteTarget.id.replace("inv-", "");
        const result = await authClient.organization.cancelInvitation({
          invitationId: invId,
          organizationId,
        });
        if (result.error) {
          toast.error("Failed to cancel invitation", {
            description: String(result.error.message ?? result.error.code ?? JSON.stringify(result.error)),
          });
          return;
        }
        toast.success("Invitation canceled");
      } else if (deleteTarget.type === "invitation") {
        // Canceled/expired/rejected — delete the invitation record directly
        const invId = deleteTarget.id.replace("inv-", "");
        const res = await fetch(
          `${getApiBaseUrl()}/users/invitations/${invId}`,
          { method: "DELETE", headers: getTenantHeaders() },
        );
        if (!res.ok) {
          toast.error("Failed to delete invitation");
          return;
        }
        toast.success("Invitation deleted");
      }
      queryClient.invalidateQueries({ queryKey: membersQueryKeys.all() });
    } catch (e) {
      toast.error("Operation failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="max-w-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-bold">Members</h1>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite Member
        </Button>
      </div>
      <p className="text-muted-foreground">
        Manage your organization members and their roles.
      </p>

      {isLoading && (
        <div className="text-center py-8 text-muted-foreground">
          Loading members...
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No members found. Invite someone to get started.
        </div>
      )}

      {rows.length > 0 && (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const roleClass = roleColors[row.role] ?? "bg-gray-100 text-gray-600";
                const sClass = statusStyles[row.status] ?? "bg-gray-100 text-gray-600";
                const canEdit =
                  isAdminOrAbove &&
                  !row.isYou &&
                  row.type === "member" &&
                  row.role !== "super_admin";

                const isPendingInvite = row.type === "invitation" && row.status === "pending";
                const isDismissableInvite =
                  row.type === "invitation" && row.status !== "pending";
                const isRemovableMember =
                  row.type === "member" && !row.isYou && row.role !== "super_admin";

                const canAction =
                  isAdminOrAbove && (canEdit || isPendingInvite || isDismissableInvite || isRemovableMember);

                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.isYou ? (
                        <span>
                          You{" "}
                          <span className="text-xs text-muted-foreground font-normal">
                            ({row.name})
                          </span>
                        </span>
                      ) : (
                        row.name ?? (
                          <span className="text-muted-foreground italic">Invited</span>
                        )
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.email}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${roleClass}`}>
                        {roleLabels[row.role] ?? row.role}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full capitalize ${sClass}`}>
                        {row.status === "pending" && <Clock className="h-3 w-3" />}
                        {row.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(row.date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {canAction && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canEdit && (
                              <DropdownMenuItem onClick={() => setEditTarget(row)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {isPendingInvite && (
                              <DropdownMenuItem
                                onClick={() => handleResend(row)}
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Resend Invite
                              </DropdownMenuItem>
                            )}
                            {isPendingInvite && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(row)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Cancel Invite
                              </DropdownMenuItem>
                            )}
                            {isDismissableInvite && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(row)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            )}
                            {isRemovableMember && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleteTarget(row)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {organizationId && (
        <>
          <InviteMemberDialog
            organizationId={organizationId}
            open={inviteOpen}
            onOpenChange={setInviteOpen}
          />

          {editTarget && (
            <EditMemberDialog
              organizationId={organizationId}
              memberId={editTarget.memberId ?? editTarget.id}
              defaultValues={{
                name: editTarget.name ?? "",
                email: editTarget.email,
                role: editTarget.role as "admin" | "operator",
              }}
              open={!!editTarget}
              onOpenChange={(open) => !open && setEditTarget(null)}
            />
          )}

          <ConfirmDialog
            open={!!deleteTarget}
            onOpenChange={(open) => !open && setDeleteTarget(null)}
            title={
              deleteTarget?.type === "invitation" && deleteTarget?.status === "pending"
                ? "Cancel Invitation"
                : deleteTarget?.type === "invitation"
                  ? "Delete Invitation"
                  : "Remove Member"
            }
            description={
              deleteTarget?.type === "invitation" && deleteTarget?.status === "pending"
                ? `Are you sure you want to cancel the invitation for ${deleteTarget?.email}?`
                : deleteTarget?.type === "invitation"
                  ? `Are you sure you want to delete the invitation record for ${deleteTarget?.email}?`
                  : `Are you sure you want to remove ${deleteTarget?.name ?? deleteTarget?.email} from the organization?`
            }
            onConfirm={handleDelete}
            confirmLabel={
              deleteTarget?.type === "invitation" && deleteTarget?.status === "pending"
                ? "Cancel Invite"
                : deleteTarget?.type === "invitation"
                  ? "Delete"
                  : "Remove"
            }
            variant="destructive"
            isLoading={isDeleting}
          />
        </>
      )}
    </div>
  );
}

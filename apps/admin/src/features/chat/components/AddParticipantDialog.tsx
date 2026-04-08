import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { useAddParticipantMutation } from "../hooks/useConversationMutations";
import { MemberCombobox } from "@/features/members/components/MemberCombobox";
import type { ParticipantRole } from "@repo/types";
import type { OrgMember } from "@/features/members/types/members.types";

type Props = {
  conversationId: string;
  existingParticipantIds?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AddParticipantDialog({
  conversationId,
  existingParticipantIds = [],
  open,
  onOpenChange,
}: Props) {
  const [tab, setTab] = useState<"member" | "visitor">("member");
  const [selectedMember, setSelectedMember] = useState<OrgMember | null>(null);
  const [visitorId, setVisitorId] = useState("");
  const mutation = useAddParticipantMutation();

  const handleSubmit = async () => {
    const userId = tab === "member" ? selectedMember?.id : visitorId.trim();
    const role: ParticipantRole = tab === "member"
      ? (selectedMember?.role === "super_admin" ? "admin" : (selectedMember?.role as ParticipantRole) ?? "operator")
      : "visitor";

    if (!userId) return;

    try {
      await mutation.mutateAsync({
        conversationId,
        body: { userId, role },
      });
      toast.success("Participant added");
      setSelectedMember(null);
      setVisitorId("");
      onOpenChange(false);
    } catch (e) {
      toast.error("Failed to add participant", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  const canSubmit = tab === "member" ? !!selectedMember : !!visitorId.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Participant</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "member" | "visitor")} className="py-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="member">Team Member</TabsTrigger>
            <TabsTrigger value="visitor">Visitor</TabsTrigger>
          </TabsList>

          <TabsContent value="member" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Select Member</Label>
              <MemberCombobox
                value={selectedMember?.id ?? null}
                onSelect={setSelectedMember}
                excludeIds={existingParticipantIds}
                placeholder="Search operators and admins..."
              />
            </div>
          </TabsContent>

          <TabsContent value="visitor" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Visitor ID</Label>
              <Input
                value={visitorId}
                onChange={(e) => setVisitorId(e.target.value)}
                placeholder="Paste the visitor ID"
              />
              <p className="text-xs text-muted-foreground">
                Visitors are identified by their unique ID from the widget
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? "Adding..." : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { useCreateConversationMutation } from "../hooks/useConversationMutations";
import { MemberMultiSelect } from "@/features/members/components/MemberMultiSelect";
import type { OrgMember } from "@/features/members/types/members.types";

type Props = {
  currentUserId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateConversationDialog({ currentUserId, open, onOpenChange }: Props) {
  const [subject, setSubject] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<OrgMember[]>([]);
  const [visitorId, setVisitorId] = useState("");
  const mutation = useCreateConversationMutation();

  const handleSubmit = async () => {
    const participantIds = selectedMembers.map((m) => m.id);

    if (visitorId.trim()) {
      participantIds.push(visitorId.trim());
    }

    if (participantIds.length === 0) {
      toast.error("At least one other participant is required");
      return;
    }

    try {
      await mutation.mutateAsync({
        subject: subject.trim() || undefined,
        participantUserIds: participantIds,
      });
      toast.success("Conversation created");
      setSubject("");
      setSelectedMembers([]);
      setVisitorId("");
      onOpenChange(false);
    } catch (e) {
      toast.error("Failed to create conversation", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Internal Conversation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What is this about?"
            />
          </div>

          <div className="space-y-2">
            <Label>Team Members</Label>
            <MemberMultiSelect
              selected={selectedMembers}
              onChange={setSelectedMembers}
              excludeIds={[currentUserId]}
              placeholder="Search operators and admins..."
            />
            <p className="text-xs text-muted-foreground">
              You will be added automatically
            </p>
          </div>

          <div className="space-y-2">
            <Label>Visitor ID (optional)</Label>
            <Input
              value={visitorId}
              onChange={(e) => setVisitorId(e.target.value)}
              placeholder="Paste a visitor ID to include"
            />
            <p className="text-xs text-muted-foreground">
              Add a visitor by their ID if they need to be part of this conversation
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending || (selectedMembers.length === 0 && !visitorId.trim())}
          >
            {mutation.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

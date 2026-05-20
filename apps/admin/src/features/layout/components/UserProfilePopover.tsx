import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { User, LogOut } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import { useAuthSession } from "@/features/auth/hooks/useAuthSession";
import { authClient } from "@/lib/authClient";

interface UserProfilePopoverProps {
  isSidebarCollapsed: boolean;
}

export function UserProfilePopover({
  isSidebarCollapsed,
}: UserProfilePopoverProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: session } = useAuthSession();

  const user = session?.user;
  const displayName = user?.name || "Account";

  async function handleLogout() {
    await authClient.signOut();
    navigate({ to: "/login" });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={`w-full ${isSidebarCollapsed ? "justify-center" : "justify-start"}`}
          title={displayName}
        >
          <User className={isSidebarCollapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
          {!isSidebarCollapsed && displayName}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" className="w-64 p-4">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-sm">{user?.name || "—"}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Settings,
  MessageSquare,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { BillingAlert } from "@/features/billing/components/BillingAlert";
import { ChatWidgetTest } from "@/features/applications/components/ChatWidgetTest";
import { useApplicationsQuery } from "@/features/applications/hooks/useApplicationsQuery";

export function AppShell(props: { children: ReactNode }) {
  const { children } = props;
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { data: appsData } = useApplicationsQuery();
  const firstAppId = appsData?.applications?.[0]?.id;

  return (
    <div className="min-h-screen bg-background flex">
      <aside
        className={`${
          isSidebarCollapsed ? "w-16" : "w-64"
        } shrink-0 flex flex-col border-r border-border/60 bg-card/50 h-screen sticky top-0 transition-all duration-200`}
      >
        <div
          className={`${
            isSidebarCollapsed ? "px-2" : "px-4"
          } py-4 border-b border-border/60 shrink-0 flex items-center justify-between gap-2`}
        >
          {!isSidebarCollapsed && (
            <div>
              <p className="font-bold tracking-tight">Delivery Chat</p>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={isSidebarCollapsed ? "mx-auto" : ""}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>
        <nav className="p-3 space-y-1 shrink-0">
          <Link to="/" className="block">
            <Button
              variant="ghost"
              className={`w-full ${isSidebarCollapsed ? "justify-center" : "justify-start"}`}
              title="Dashboard"
            >
              <LayoutDashboard className={isSidebarCollapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
              {!isSidebarCollapsed && "Dashboard"}
            </Button>
          </Link>
          <Link to="/conversations" className="block">
            <Button
              variant="ghost"
              className={`w-full ${isSidebarCollapsed ? "justify-center" : "justify-start"}`}
              title="Conversations"
            >
              <MessageSquare className={isSidebarCollapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
              {!isSidebarCollapsed && "Conversations"}
            </Button>
          </Link>
        </nav>
        <div className="mt-auto shrink-0 p-3 border-t border-border/60">
          <Link to="/settings" className="block">
            <Button
              variant="ghost"
              className={`w-full ${isSidebarCollapsed ? "justify-center" : "justify-start"}`}
              title="Settings"
            >
              <Settings className={isSidebarCollapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
              {!isSidebarCollapsed && "Settings"}
            </Button>
          </Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <BillingAlert />
        {firstAppId && <ChatWidgetTest appId={firstAppId} />}
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

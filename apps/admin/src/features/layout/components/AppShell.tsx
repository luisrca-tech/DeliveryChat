import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { BillingAlert } from "@/features/billing/components/BillingAlert";

export function AppShell(props: { children: ReactNode }) {
  const { children } = props;

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-64 shrink-0 flex flex-col border-r border-border/60 bg-card/50 h-screen sticky top-0">
        <div className="px-4 py-4 border-b border-border/60 shrink-0">
          <p className="font-bold tracking-tight">Delivery Chat</p>
          <p className="text-xs text-muted-foreground">Admin</p>
        </div>
        <nav className="p-3 space-y-1 shrink-0">
          <Link to="/" className="block">
            <Button variant="ghost" className="w-full justify-start">
              Dashboard
            </Button>
          </Link>
        </nav>
        <div className="mt-auto shrink-0 p-3 border-t border-border/60">
          <Link to="/settings" className="block">
            <Button variant="ghost" className="w-full justify-start">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <BillingAlert />
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}

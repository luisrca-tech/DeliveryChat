import { Settings, CreditCard, Package, Key, AppWindow, Gauge, Users } from "lucide-react";
import { useBillingStatusQuery } from "@/features/billing/hooks/useBillingStatus";
import { SettingsLinkCard } from "./SettingsLinkCard";

export function SettingsIndexPage() {
  const { data } = useBillingStatusQuery();

  const role = data?.role;
  const isAdmin = role === "admin" || role === "super_admin";

  return (
    <div className="max-w-full space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" />
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>
      <p className="text-muted-foreground">
        Use the cards below or the sidebar to manage billing and organization
        settings.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {isAdmin && (
          <SettingsLinkCard
            to="/onboarding/plans"
            title="Plans"
            description="View and manage your subscription plan."
            icon={<Package className="h-5 w-5" />}
          />
        )}
        {isAdmin && (
          <SettingsLinkCard
            to="/settings/billing"
            title="Billing"
            description="Manage billing, payment methods, and invoices."
            icon={<CreditCard className="h-5 w-5" />}
          />
        )}
        <SettingsLinkCard
          to="/settings/applications"
          title="Applications"
          description="Create and manage your applications."
          icon={<AppWindow className="h-5 w-5" />}
        />
        <SettingsLinkCard
          to="/settings/api-keys"
          title="API Keys"
          description="Create and manage API keys for your applications."
          icon={<Key className="h-5 w-5" />}
        />
        <SettingsLinkCard
          to="/settings/rate-limits"
          title="Rate Limits"
          description="View and configure API rate limits per tenant."
          icon={<Gauge className="h-5 w-5" />}
        />
        {isAdmin && (
          <SettingsLinkCard
            to="/settings/members"
            title="Members"
            description="View and manage organization members and roles."
            icon={<Users className="h-5 w-5" />}
          />
        )}
      </div>
    </div>
  );
}

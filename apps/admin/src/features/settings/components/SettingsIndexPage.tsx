import { Settings, CreditCard, Package, Key, AppWindow } from "lucide-react";
import { SettingsLinkCard } from "./SettingsLinkCard";

export function SettingsIndexPage() {
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
        <SettingsLinkCard
          to="/onboarding/plans"
          title="Plans"
          description="View and manage your subscription plan."
          icon={<Package className="h-5 w-5" />}
        />
        <SettingsLinkCard
          to="/settings/billing"
          title="Billing"
          description="Manage billing, payment methods, and invoices."
          icon={<CreditCard className="h-5 w-5" />}
        />
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
      </div>
    </div>
  );
}

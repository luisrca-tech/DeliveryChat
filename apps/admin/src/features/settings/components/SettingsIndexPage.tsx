import { Settings } from "lucide-react";

export function SettingsIndexPage() {
  return (
    <div className="max-w-4xl space-y-2">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" />
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>
      <p className="text-muted-foreground">
        Use the sidebar to manage billing and organization settings.
      </p>
    </div>
  );
}

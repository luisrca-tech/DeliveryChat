import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Database,
  Pencil,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Switch } from "@repo/ui/components/ui/switch";
import { Button } from "@repo/ui/components/ui/button";
import { Label } from "@repo/ui/components/ui/label";
import { formatRelative } from "@/lib/formatRelative";
import { useBillingStatusQuery } from "@/features/billing/hooks/useBillingStatus";
import { AiInterviewStatusCell } from "@/features/aiInterview/components/AiInterviewStatusCell";
import {
  AI_INTERVIEW_ACTION_LABEL,
  getAiInterviewRoute,
} from "@/features/aiInterview/lib/aiInterviewNavigation";
import { useApplicationQuery } from "../hooks/useApplicationQuery";
import {
  useToggleApplicationAiSettingMutation,
  useUpdateApplicationMutation,
} from "../hooks/useApplicationMutations";
import { EditApplicationDialog } from "./EditApplicationDialog";
import type { UpdateApplicationRequest } from "../types/applications.types";

export type ApplicationDetailsPageProps = {
  applicationId: string;
};

export function ApplicationDetailsPage({
  applicationId,
}: ApplicationDetailsPageProps) {
  const [editOpen, setEditOpen] = useState(false);
  const { data, isLoading } = useApplicationQuery(applicationId);
  const { data: billingStatus } = useBillingStatusQuery();
  const updateMutation = useUpdateApplicationMutation();
  const toggleAiMutation = useToggleApplicationAiSettingMutation(applicationId);

  const application = data?.application;
  const aiAddonActive = billingStatus?.aiAddonActive ?? true;

  const handleEditSubmit = async (body: UpdateApplicationRequest) => {
    try {
      await updateMutation.mutateAsync({ id: applicationId, body });
      setEditOpen(false);
      toast.success("Application updated");
    } catch (e) {
      toast.error("Failed to update application", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
      throw e;
    }
  };

  const handleToggle = (
    field: "aiAutoRespond" | "aiDbEnabled",
    checked: boolean,
  ) => {
    toggleAiMutation.mutate(
      { [field]: checked },
      {
        onError: (e) => {
          toast.error("Failed to update AI setting", {
            description: e instanceof Error ? e.message : "Unknown error",
          });
        },
      },
    );
  };

  if (isLoading || !application) {
    return (
      <div className="max-w-full space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  return (
    <div className="max-w-full space-y-6">
      <Link
        to="/applications"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Applications
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{application.name}</h1>
            <span className="inline-flex items-center rounded-full border border-border/60 bg-muted px-2 py-0.5 text-xs font-medium capitalize">
              {application.kind}
            </span>
            <AiInterviewStatusCell status={application.aiInterviewStatus} />
          </div>
          <p className="text-sm text-muted-foreground">{application.domain}</p>
        </div>
        <Button onClick={() => setEditOpen(true)}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="Name" value={application.name} />
            <DetailRow label="Domain" value={application.domain} mono />
            <DetailRow
              label="Description"
              value={application.description || "—"}
            />
            <DetailRow
              label="Kind"
              value={application.kind === "test" ? "Test" : "Production"}
            />
            {application.kind === "test" && (
              <DetailRow
                label="Port"
                value={application.port != null ? String(application.port) : "—"}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Allowed Domains</CardTitle>
            <CardDescription>
              Origins permitted to load the widget.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {application.allowedOrigins.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {application.allowedOrigins.map((origin) => (
                  <span
                    key={origin}
                    className="inline-flex items-center rounded-md border bg-muted px-2 py-1 font-mono text-xs"
                  >
                    {origin}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No allowed domains configured.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow
              label="Created"
              value={formatRelative(application.createdAt)}
            />
            <DetailRow
              label="Last updated"
              value={formatRelative(application.updatedAt)}
            />
            <DetailRow label="App ID" value={application.id} mono copyable />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">AI</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-base">AI auto-respond</CardTitle>
                <CardDescription>
                  AI answers new visitor conversations automatically.
                </CardDescription>
              </div>
              <Switch
                checked={application.aiAutoRespond ?? false}
                onCheckedChange={(checked) =>
                  handleToggle("aiAutoRespond", checked)
                }
                disabled={toggleAiMutation.isPending}
                aria-label="Toggle AI auto-respond"
              />
            </CardHeader>
            {!aiAddonActive && (
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">
                  Requires the AI Assistant add-on to take effect.
                </p>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-base">AI database tools</CardTitle>
                <CardDescription>
                  Allow SQL-backed data tools for this application.
                </CardDescription>
              </div>
              <Switch
                checked={application.aiDbEnabled ?? false}
                onCheckedChange={(checked) =>
                  handleToggle("aiDbEnabled", checked)
                }
                disabled={toggleAiMutation.isPending}
                aria-label="Toggle AI database tools"
              />
            </CardHeader>
            {!aiAddonActive && (
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">
                  Requires the AI Assistant add-on to take effect.
                </p>
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Configuration</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            to={getAiInterviewRoute(application.aiInterviewStatus)}
            params={{ applicationId: application.id }}
            className="block"
          >
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">
                    {AI_INTERVIEW_ACTION_LABEL[application.aiInterviewStatus]}
                  </CardTitle>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Guided interview and generated AI context summary for this
                  application.
                </CardDescription>
              </CardContent>
            </Card>
          </Link>

          <Link
            to="/applications/$applicationId/data-tools"
            params={{ applicationId: application.id }}
            className="block"
          >
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Data tools</CardTitle>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Connect the AI to your systems and define the read-only
                  capabilities it can use to answer visitors.
                </CardDescription>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      <EditApplicationDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        application={application}
        onSubmit={handleEditSubmit}
        submitting={updateMutation.isPending}
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  copyable,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied to clipboard`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to copy ${label} to clipboard`, error);
      toast.error(`Failed to copy ${label} to clipboard`);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <Label className="text-muted-foreground">{label}</Label>
      <span
        className={`flex min-w-0 items-center gap-1 ${mono ? "font-mono text-xs" : ""}`}
      >
        <span className="truncate">{value}</span>
        {copyable && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleCopy}
            aria-label={`Copy ${label}`}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </span>
    </div>
  );
}

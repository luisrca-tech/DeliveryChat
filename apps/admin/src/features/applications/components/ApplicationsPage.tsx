import { useState, useCallback, useMemo } from "react";
import { AppWindow, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { useApplicationsQuery } from "../hooks/useApplicationsQuery";
import { useApplicationQuery } from "../hooks/useApplicationQuery";
import {
  useCreateApplicationMutation,
  useUpdateApplicationMutation,
  useDeleteApplicationMutation,
} from "../hooks/useApplicationMutations";
import { ApplicationDomainConflictError } from "../lib/applications.client";
import type { Application } from "../types/applications.types";
import { ApplicationListTable } from "./ApplicationListTable";
import { CreateApplicationDialog } from "./CreateApplicationDialog";
import { EditApplicationDialog } from "./EditApplicationDialog";
import { DeleteApplicationDialog } from "./DeleteApplicationDialog";

export function ApplicationsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editApp, setEditApp] = useState<Application | null>(null);
  const [deleteApp, setDeleteApp] = useState<Application | null>(null);

  const { data: appsData, isLoading } = useApplicationsQuery();
  const { data: deleteAppDetail } = useApplicationQuery(deleteApp?.id ?? null);

  const createMutation = useCreateApplicationMutation();
  const updateMutation = useUpdateApplicationMutation();
  const deleteMutation = useDeleteApplicationMutation();

  const applications = useMemo(
    () => appsData?.applications ?? [],
    [appsData?.applications],
  );
  const activeApiKeysCount = deleteAppDetail?.activeApiKeysCount ?? 0;

  const handleCreate = useCallback(
    async (body: { name: string; domain: string; description?: string }) => {
      try {
        await createMutation.mutateAsync(body);
        setCreateOpen(false);
        toast.success("Application created");
      } catch (e) {
        if (e instanceof ApplicationDomainConflictError) {
          toast.error("Domain already exists", {
            description: "Choose a different domain.",
          });
        } else {
          toast.error("Failed to create application", {
            description: e instanceof Error ? e.message : "Unknown error",
          });
        }
        throw e;
      }
    },
    [createMutation],
  );

  const handleUpdate = useCallback(
    async (body: { name?: string; description?: string }) => {
      if (!editApp) return;
      try {
        await updateMutation.mutateAsync({ id: editApp.id, body });
        setEditApp(null);
        toast.success("Application updated");
      } catch (e) {
        toast.error("Failed to update application", {
          description: e instanceof Error ? e.message : "Unknown error",
        });
        throw e;
      }
    },
    [editApp, updateMutation],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteApp) return;
    try {
      await deleteMutation.mutateAsync(deleteApp.id);
      setDeleteApp(null);
      toast.success("Application deleted");
    } catch (e) {
      toast.error("Failed to delete application", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
      throw e;
    }
  }, [deleteApp, deleteMutation]);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <AppWindow className="h-5 w-5 text-primary" />
          <h1 className="text-3xl font-bold">Applications</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Application
        </Button>
      </div>

      <p className="text-muted-foreground">
        Manage your applications. Each application can have its own API keys for
        authentication.
      </p>

      <ApplicationListTable
        applications={applications}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onEdit={setEditApp}
        onDelete={setDeleteApp}
        isLoading={isLoading}
      />

      <CreateApplicationDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        submitting={createMutation.isPending}
      />

      <EditApplicationDialog
        open={!!editApp}
        onOpenChange={(open) => !open && setEditApp(null)}
        application={editApp}
        onSubmit={handleUpdate}
        submitting={updateMutation.isPending}
      />

      <DeleteApplicationDialog
        open={!!deleteApp}
        onOpenChange={(open) => !open && setDeleteApp(null)}
        application={deleteApp}
        activeApiKeysCount={activeApiKeysCount}
        onConfirm={handleDelete}
        deleting={deleteMutation.isPending}
      />
    </div>
  );
}

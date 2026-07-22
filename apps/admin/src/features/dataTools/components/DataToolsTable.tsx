import { useState } from "react";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { ConfirmDialog } from "@repo/ui/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { formatRelative } from "@/lib/formatRelative";
import { useDataToolsQuery } from "../hooks/useDataToolsQuery";
import { useDeleteDataToolMutation } from "../hooks/useDataToolMutations";
import { DataToolDialog } from "./DataToolDialog";
import type { DataSourceKind, DataTool } from "../types/dataTools.types";

export type DataToolsTableProps = {
  applicationId: string;
  sourceKind: DataSourceKind | null;
};

export function DataToolsTable({
  applicationId,
  sourceKind,
}: DataToolsTableProps) {
  const { data: tools, isLoading } = useDataToolsQuery(applicationId);
  const deleteMutation = useDeleteDataToolMutation(applicationId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<DataTool | null>(null);
  const [deletingTool, setDeletingTool] = useState<DataTool | null>(null);

  const openCreate = () => {
    setEditingTool(null);
    setDialogOpen(true);
  };

  const openEdit = (tool: DataTool) => {
    setEditingTool(tool);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingTool) return;
    try {
      await deleteMutation.mutateAsync(deletingTool.id);
      toast.success("Tool deleted");
      setDeletingTool(null);
    } catch (e) {
      toast.error("Failed to delete tool", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Data tools</h2>
          <p className="text-sm text-muted-foreground">
            Named, read-only capabilities the AI can call at runtime.
          </p>
        </div>
        <Button onClick={openCreate} disabled={!sourceKind}>
          <Plus className="mr-2 h-4 w-4" />
          New data tool
        </Button>
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-md bg-muted" />
      ) : !tools || tools.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No tools yet. Add one to give the AI a new capability.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Backing</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last tested</TableHead>
                <TableHead className="w-16 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.map((tool) => (
                <TableRow key={tool.id}>
                  <TableCell className="font-medium">
                    <div className="font-mono text-sm">{tool.name}</div>
                    <div className="max-w-md truncate text-xs text-muted-foreground">
                      {tool.description}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs uppercase">
                    {tool.backingType}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        tool.enabled
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                          : "bg-muted text-muted-foreground border border-border/60"
                      }`}
                    >
                      {tool.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {tool.lastTestedAt
                      ? formatRelative(tool.lastTestedAt)
                      : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Actions for ${tool.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openEdit(tool)}
                          className="cursor-pointer"
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeletingTool(tool)}
                          className="cursor-pointer text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DataToolDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        applicationId={applicationId}
        sourceKind={sourceKind}
        tool={editingTool}
      />

      <ConfirmDialog
        open={!!deletingTool}
        onOpenChange={(open) => !open && setDeletingTool(null)}
        title="Delete this tool?"
        description={`"${deletingTool?.name}" will no longer be available to the AI. This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

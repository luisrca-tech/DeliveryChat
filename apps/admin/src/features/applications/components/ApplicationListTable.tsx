import { useMemo, useState } from "react";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Input } from "@repo/ui/components/ui/input";
import { formatRelative } from "@/lib/formatRelative";
import type { Application } from "../types/applications.types";

export type ApplicationListTableProps = {
  applications: Application[];
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onEdit: (app: Application) => void;
  onDelete: (app: Application) => void;
  isLoading?: boolean;
};

export function ApplicationListTable({
  applications,
  searchQuery,
  onSearchChange,
  onEdit,
  onDelete,
  isLoading,
}: ApplicationListTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyAppId = async (id: string) => {
    await navigator.clipboard.writeText(id);
    toast.success("App ID copied to clipboard");
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return applications;
    const q = searchQuery.toLowerCase().trim();
    return applications.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.domain.toLowerCase().includes(q) ||
        (a.description ?? "").toLowerCase().includes(q),
    );
  }, [applications, searchQuery]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 rounded-md bg-muted animate-pulse" />
        <div className="rounded-md border">
          <div className="divide-y">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                <div className="h-4 w-24 rounded bg-muted animate-pulse" />
                <div className="ml-auto h-8 w-8 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground mb-4">
          No applications yet. Create one to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search by name, domain, or description..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-md"
      />

      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium">
                App ID
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium">
                Domain
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium">
                Description
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium">
                Created
              </th>
              <th className="w-20 shrink-0 px-4 py-3 pr-6 text-right text-sm font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((app) => (
              <tr key={app.id} className="border-b last:border-b-0">
                <td className="px-4 py-3 text-sm font-medium">{app.name}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs truncate max-w-[140px] block">
                      {app.id}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => copyAppId(app.id)}
                      aria-label="Copy app ID"
                    >
                      <Copy
                        className={`h-3.5 w-3.5 ${copiedId === app.id ? "text-green-600" : ""}`}
                      />
                    </Button>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-sm">{app.domain}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate">
                  {app.description || "—"}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {formatRelative(app.createdAt)}
                </td>
                <td className="w-20 shrink-0 px-4 py-3 pr-6 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => copyAppId(app.id)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Copy App ID
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(app)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(app)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length < applications.length && (
        <p className="text-sm text-muted-foreground">
          Showing {filtered.length} of {applications.length} applications
        </p>
      )}
    </div>
  );
}

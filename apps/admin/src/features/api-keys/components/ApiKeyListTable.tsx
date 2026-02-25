import { useState, useMemo } from "react";
import { MoreHorizontal, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { Input } from "@repo/ui/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/ui/radio-group";
import { Label } from "@repo/ui/components/ui/label";
import { formatRelative } from "@/lib/formatRelative";
import type {
  ApiKeyEnvironment,
  ApiKeyListItem,
} from "../types/api-keys.types";

export type ApiKeyListTableProps = {
  keys: ApiKeyListItem[];
  used: number;
  limit: number;
  plan: string;
  environmentFilter: ApiKeyEnvironment | "all";
  onEnvironmentFilterChange: (env: ApiKeyEnvironment | "all") => void;
  onRevoke: (key: ApiKeyListItem) => void;
  onRegenerate: (key: ApiKeyListItem) => void;
  isLoading?: boolean;
  onCreateClick: () => void;
};

export function ApiKeyListTable({
  keys,
  used,
  limit,
  plan,
  environmentFilter,
  onEnvironmentFilterChange,
  onRevoke,
  onRegenerate,
  isLoading,
  onCreateClick,
}: ApiKeyListTableProps) {
  const [searchInput, setSearchInput] = useState("");

  const filteredKeys = useMemo(() => {
    let result = keys;
    if (searchInput.trim()) {
      const q = searchInput.toLowerCase().trim();
      result = result.filter((k) => (k.name ?? "").toLowerCase().includes(q));
    }
    if (environmentFilter !== "all") {
      result = result.filter((k) => k.environment === environmentFilter);
    }
    return result;
  }, [keys, searchInput, environmentFilter]);

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
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (keys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground mb-4">No API keys yet</p>
        <Button onClick={onCreateClick}>Create key</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Filter by name..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="max-w-xs"
        />
        <RadioGroup
          value={environmentFilter}
          onValueChange={(v) =>
            onEnvironmentFilterChange(v as ApiKeyEnvironment | "all")
          }
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="all" id="env-all" />
            <Label htmlFor="env-all" className="cursor-pointer">
              All
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="live" id="env-live" />
            <Label htmlFor="env-live" className="cursor-pointer">
              Production (live)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="test" id="env-test" />
            <Label htmlFor="env-test" className="cursor-pointer">
              Test
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
              <th className="px-4 py-3 text-left text-sm font-medium">
                Prefix
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium">
                Created
              </th>
              <th className="px-4 py-3 text-right text-sm font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredKeys.map((key) => {
              const isRevoked = !!key.revokedAt;
              return (
                <tr
                  key={key.id}
                  className={`border-b last:border-b-0 ${
                    isRevoked ? "opacity-60" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={
                        isRevoked ? "line-through text-muted-foreground" : ""
                      }
                    >
                      {key.name || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">
                    {key.keyPrefix}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatRelative(key.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!isRevoked && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onRegenerate(key)}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Regenerate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onRevoke(key)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Revoke
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {isRevoked && (
                      <span className="text-xs text-muted-foreground">
                        Revoked
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {used} of {limit} key{limit !== 1 ? "s" : ""} (Plan: {plan})
      </p>
    </div>
  );
}

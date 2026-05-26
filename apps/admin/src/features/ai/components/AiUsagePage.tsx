import { useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Input } from "@repo/ui/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { useAiUsageLogsQuery } from "../hooks/useAiUsageLogsQuery";
import { useMembersQuery } from "@/features/members/hooks/useMembersQuery";
import type { AiUsageFilters } from "../types/aiUsage.types";

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  success: { label: "Success", className: "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950" },
  provider_error: { label: "Provider Error", className: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950" },
  timeout: { label: "Timeout", className: "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950" },
  empty: { label: "Empty", className: "text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950" },
  content_filtered: { label: "Filtered", className: "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950" },
  aborted: { label: "Aborted", className: "text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-950" },
};

const ACTION_LABELS: Record<string, string> = {
  generate: "Generate Reply",
  improve: "Improve Message",
};

function StatusPill({ status }: { status: string }) {
  const config = STATUS_LABELS[status] ?? { label: status, className: "text-gray-600 bg-gray-50" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AiUsagePage() {
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<AiUsageFilters>({});

  const { data, isLoading } = useAiUsageLogsQuery({
    ...filters,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const { data: membersData } = useMembersQuery();
  const members = membersData?.users ?? [];

  const total = data?.total ?? 0;
  const logs = data?.logs ?? [];
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function updateFilter<K extends keyof AiUsageFilters>(
    key: K,
    value: AiUsageFilters[K],
  ) {
    setPage(0);
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (!value || value === "all") delete next[key];
      return next;
    });
  }

  return (
    <div className="max-w-full space-y-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h1 className="text-3xl font-bold">AI Usage</h1>
      </div>
      <p className="text-muted-foreground">
        View AI assistant usage across your organization. No message content is
        stored or displayed.
      </p>

      <UsageSummaryCards total={total} logs={logs} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Usage Log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select
              value={filters.action ?? "all"}
              onValueChange={(v) => updateFilter("action", v)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="generate">Generate Reply</SelectItem>
                <SelectItem value="improve">Improve Message</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.status ?? "all"}
              onValueChange={(v) => updateFilter("status", v)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="provider_error">Provider Error</SelectItem>
                <SelectItem value="timeout">Timeout</SelectItem>
                <SelectItem value="empty">Empty</SelectItem>
                <SelectItem value="content_filtered">Filtered</SelectItem>
                <SelectItem value="aborted">Aborted</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.userId ?? "all"}
              onValueChange={(v) => updateFilter("userId", v)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Operator" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Operators</SelectItem>
                {members
                  .filter((m) => !m.isAnonymous)
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Input
              type="date"
              className="w-[160px]"
              value={filters.dateFrom ?? ""}
              onChange={(e) => updateFilter("dateFrom", e.target.value)}
              placeholder="From"
            />
            <Input
              type="date"
              className="w-[160px]"
              value={filters.dateTo ?? ""}
              onChange={(e) => updateFilter("dateTo", e.target.value)}
              placeholder="To"
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              Loading...
            </div>
          ) : logs.length === 0 ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              No usage logs found.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatTimestamp(log.createdAt)}
                    </TableCell>
                    <TableCell>{log.operatorName ?? "Unknown"}</TableCell>
                    <TableCell>{ACTION_LABELS[log.action] ?? log.action}</TableCell>
                    <TableCell>
                      <StatusPill status={log.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.model}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {log.inputTokens != null && log.outputTokens != null
                        ? `${log.inputTokens} / ${log.outputTokens}`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {log.latencyMs != null ? `${log.latencyMs}ms` : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}–
                {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UsageSummaryCards({
  total,
  logs,
}: {
  total: number;
  logs: { status: string; latencyMs: number | null }[];
}) {
  const successCount = logs.filter((l) => l.status === "success").length;
  const logsWithLatency = logs.filter((l) => l.latencyMs != null);
  const avgLatency =
    logsWithLatency.length > 0
      ? Math.round(
          logsWithLatency.reduce((sum, l) => sum + l.latencyMs!, 0) / logsWithLatency.length,
        )
      : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">{total}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Success Rate (page)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">
            {logs.length > 0
              ? `${Math.round((successCount / logs.length) * 100)}%`
              : "-"}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Avg Latency (page)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tabular-nums">
            {avgLatency > 0 ? `${avgLatency}ms` : "-"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { BarChart3, CalendarIcon, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useQueryState, parseAsInteger } from "nuqs";
import { Button } from "@repo/ui/components/ui/button";
import { Calendar } from "@repo/ui/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
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
import { useState } from "react";

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

function formatDateLabel(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AiUsagePage() {
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(0));
  const [action, setAction] = useQueryState("action");
  const [status, setStatus] = useQueryState("status");
  const [userId, setUserId] = useQueryState("userId");
  const [dateFrom, setDateFrom] = useQueryState("dateFrom");
  const [dateTo, setDateTo] = useQueryState("dateTo");

  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);

  const hasActiveFilters = !!(action || status || userId || dateFrom || dateTo);

  function resetFilters() {
    void setPage(0);
    void setAction(null);
    void setStatus(null);
    void setUserId(null);
    void setDateFrom(null);
    void setDateTo(null);
  }

  const filters = {
    ...(action ? { action } : {}),
    ...(status ? { status } : {}),
    ...(userId ? { userId } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  };

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

  function updateFilter(key: string, value: string | null) {
    void setPage(0);
    const cleanValue = !value || value === "all" ? null : value;
    switch (key) {
      case "action": void setAction(cleanValue); break;
      case "status": void setStatus(cleanValue); break;
      case "userId": void setUserId(cleanValue); break;
      case "dateFrom": void setDateFrom(cleanValue); break;
      case "dateTo": void setDateTo(cleanValue); break;
    }
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
              value={action ?? "all"}
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
              value={status ?? "all"}
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
              value={userId ?? "all"}
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

            <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[160px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? formatDateLabel(dateFrom) : <span className="text-muted-foreground">From</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom ? new Date(dateFrom + "T00:00:00") : undefined}
                  onSelect={(day) => {
                    if (day) {
                      const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                      updateFilter("dateFrom", iso);
                    } else {
                      updateFilter("dateFrom", null);
                    }
                    setDateFromOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>

            <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[160px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? formatDateLabel(dateTo) : <span className="text-muted-foreground">To</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo ? new Date(dateTo + "T00:00:00") : undefined}
                  onSelect={(day) => {
                    if (day) {
                      const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                      updateFilter("dateTo", iso);
                    } else {
                      updateFilter("dateTo", null);
                    }
                    setDateToOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Filters
              </Button>
            )}
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
                  onClick={() => void setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => void setPage(page + 1)}
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

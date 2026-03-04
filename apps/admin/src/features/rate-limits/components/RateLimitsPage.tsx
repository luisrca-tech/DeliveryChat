import { Gauge, History } from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { getRateLimits, updateRateLimits } from "../lib/rateLimits.client";
import { useRateLimitsForm } from "../hooks/useRateLimitsForm";
import { RateLimitsResponse } from "../types/rateLimits.types";

export function RateLimitsPage() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery({
    queryKey: ["rate-limits"],
    queryFn: getRateLimits,
  });

  const updateMutation = useMutation({
    mutationFn: updateRateLimits,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate-limits"] });
      toast.success("Rate limits updated");
    },
    onError: (e) => {
      toast.error("Failed to update rate limits", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    },
  });

  const form = useRateLimitsForm({
    initialValues: {
      requestsPerSecond: data.overrides?.requestsPerSecond ?? null,
      requestsPerMinute: data.overrides?.requestsPerMinute ?? null,
      requestsPerHour: data.overrides?.requestsPerHour ?? null,
    },
    onSubmit: (values) => {
      updateMutation.mutate({
        requestsPerSecond: values.requestsPerSecond ?? null,
        requestsPerMinute: values.requestsPerMinute ?? null,
        requestsPerHour: values.requestsPerHour ?? null,
      });
    },
  });

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString();
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <Gauge className="h-5 w-5 text-primary" />
        <h1 className="text-3xl font-bold">Rate Limits</h1>
      </div>

      <Card className="border-border/50 shadow-soft">
        <CardHeader>
          <CardTitle>Current limits</CardTitle>
          <CardDescription>
            Your organization&apos;s API request limits per second, minute, and
            hour. Based on plan: {data.plan}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Per second</p>
              <p className="text-xl font-semibold">{data.limits.perSecond}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Per minute</p>
              <p className="text-xl font-semibold">{data.limits.perMinute}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Per hour</p>
              <p className="text-xl font-semibold">{data.limits.perHour}</p>
            </div>
          </div>

          {data.canConfigure && (
            <form
              onSubmit={form.handleSubmit}
              className="space-y-4 rounded-lg border p-4"
            >
              <h3 className="font-medium">Custom limits (ENTERPRISE)</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="perSecond">Per second</Label>
                  <Input
                    id="perSecond"
                    type="number"
                    min={1}
                    value={form.values.requestsPerSecond ?? ""}
                    placeholder={`${data.limits.perSecond}`}
                    onChange={(e) =>
                      form.setFieldValue(
                        "requestsPerSecond",
                        e.target.value ? parseInt(e.target.value, 10) : null,
                      )
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="perMinute">Per minute</Label>
                  <Input
                    id="perMinute"
                    type="number"
                    min={1}
                    value={form.values.requestsPerMinute ?? ""}
                    placeholder={`${data.limits.perMinute}`}
                    onChange={(e) =>
                      form.setFieldValue(
                        "requestsPerMinute",
                        e.target.value ? parseInt(e.target.value, 10) : null,
                      )
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="perHour">Per hour</Label>
                  <Input
                    id="perHour"
                    type="number"
                    min={1}
                    value={form.values.requestsPerHour ?? ""}
                    placeholder={`${data.limits.perHour}`}
                    onChange={(e) =>
                      form.setFieldValue(
                        "requestsPerHour",
                        e.target.value ? parseInt(e.target.value, 10) : null,
                      )
                    }
                  />
                </div>
              </div>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save limits"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-soft">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Alert history
          </CardTitle>
          <CardDescription>
            Recent rate limit exceeded or alert events
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentEvents.length === 0 ? (
            <p className="text-muted-foreground">
              No rate limit events recorded yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>Limit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentEvents.map(
                  (e: RateLimitsResponse["recentEvents"][number]) => (
                    <TableRow key={e.id}>
                      <TableCell>{formatDate(e.createdAt)}</TableCell>
                      <TableCell>{e.eventType}</TableCell>
                      <TableCell>{e.window}</TableCell>
                      <TableCell>{e.currentCount}</TableCell>
                      <TableCell>{e.limitValue}</TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

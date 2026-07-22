import { useState } from "react";
import { Database } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { useDataSourceQuery } from "../hooks/useDataSourceQuery";
import { ConnectionDialog } from "./ConnectionDialog";

export type ConnectionCardProps = {
  applicationId: string;
};

function KindBadge({ kind }: { kind: "http" | "sql" }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/60 bg-muted px-2 py-0.5 text-xs font-medium uppercase">
      {kind}
    </span>
  );
}

export function ConnectionCard({ applicationId }: ConnectionCardProps) {
  const { data: source, isLoading } = useDataSourceQuery(applicationId);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (!source) {
    return (
      <>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Database className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">Connect a data source</p>
              <p className="text-sm text-muted-foreground">
                Add an HTTP API or SQL connection before creating data tools.
              </p>
            </div>
            <Button onClick={() => setDialogOpen(true)}>
              Connect a data source
            </Button>
          </CardContent>
        </Card>

        <ConnectionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          applicationId={applicationId}
        />
      </>
    );
  }

  const identifier =
    source.kind === "http" ? hostFromUrl(source.baseUrl) : "SQL database";
  const credentialsStatus =
    source.kind === "http"
      ? source.hasHeaders
        ? "credentials saved"
        : "no headers saved"
      : source.hasConnectionString
        ? "credentials saved"
        : "no connection string saved";

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">Connection</CardTitle>
            <KindBadge kind={source.kind} />
          </div>
          <Button variant="outline" onClick={() => setDialogOpen(true)}>
            Edit connection
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span className="font-mono">{identifier}</span>
          <span>{credentialsStatus}</span>
        </CardContent>
      </Card>

      <ConnectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        applicationId={applicationId}
      />
    </>
  );
}

function hostFromUrl(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

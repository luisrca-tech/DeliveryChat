import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

export interface SettingsLinkCardProps {
  to: string;
  title: string;
  description?: string;
  icon?: ReactNode;
}

export function SettingsLinkCard({
  to,
  title,
  description,
  icon,
}: SettingsLinkCardProps) {
  return (
    <Link
      to={to}
      className="block outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
    >
      <Card className="transition-colors hover:bg-muted/50 hover:border-primary/30 cursor-pointer h-full">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            {icon && (
              <div className="text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</div>
            )}
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
        </CardHeader>
      </Card>
    </Link>
  );
}

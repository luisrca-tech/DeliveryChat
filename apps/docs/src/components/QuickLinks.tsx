import Link from "next/link";
import React from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { cn } from "@repo/ui/lib/utils";

interface QuickLink {
  title: string;
  href: string;
  description?: string;
  icon?: string;
}

interface QuickLinksProps {
  links: QuickLink[];
  columns?: 1 | 2 | 3;
}

export function QuickLinks({ links, columns = 2 }: QuickLinksProps) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  };

  return (
    <div className={cn("grid", gridCols[columns], "gap-4 my-6")}>
      {links.map((link, index) => (
        <Link key={index} href={link.href} className="group block">
          <Card className="h-full transition-all hover:shadow-md hover:border-primary">
            <CardHeader className="p-4">
              <div className="flex items-start gap-3">
                {link.icon && (
                  <span className="text-2xl shrink-0">{link.icon}</span>
                )}
                <div className="flex-1">
                  <CardTitle className="group-hover:text-primary transition-colors">
                    {link.title}
                  </CardTitle>
                  {link.description && (
                    <CardDescription className="mt-1">
                      {link.description}
                    </CardDescription>
                  )}
                </div>
                <span className="text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                  →
                </span>
              </div>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}

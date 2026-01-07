import React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { cn } from "@repo/ui/lib/utils";

interface ExampleCardProps {
  title: string;
  scenario: React.ReactNode;
  solution: React.ReactNode;
  code?: string;
  codeLanguage?: string;
}

export function ExampleCard({
  title,
  scenario,
  solution,
  code,
  codeLanguage,
}: ExampleCardProps) {
  return (
    <Card className="my-6">
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h5 className="font-medium mb-2 text-foreground">Scenario:</h5>
          <div className="text-muted-foreground prose prose-sm max-w-none">
            {scenario}
          </div>
        </div>
        <div>
          <h5 className="font-medium mb-2 text-foreground">Solution:</h5>
          <div className="text-muted-foreground prose prose-sm max-w-none">
            {solution}
          </div>
        </div>
        {code && (
          <div className="mt-4">
            <pre className="p-4 bg-muted rounded-lg overflow-x-auto border">
              <code
                className={cn(
                  "text-sm",
                  codeLanguage && `language-${codeLanguage}`
                )}
              >
                {code}
              </code>
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

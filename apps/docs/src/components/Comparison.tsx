import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

interface ComparisonItem {
  title: string;
  description?: string;
  features?: string[];
  content?: React.ReactNode;
}

interface ComparisonProps {
  left: ComparisonItem;
  right: ComparisonItem;
  title?: string;
}

export function Comparison({ left, right, title }: ComparisonProps) {
  return (
    <div className="my-8">
      {title && <h3 className="text-xl font-semibold mb-6">{title}</h3>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{left.title}</CardTitle>
            {left.description && (
              <CardDescription>{left.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {left.features && (
              <ul className="space-y-2 mb-4">
                {left.features.map((feature, index) => (
                  <li
                    key={index}
                    className="flex items-start text-muted-foreground"
                  >
                    <span className="text-primary mr-2">•</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            )}
            {left.content && (
              <div className="mt-4 text-muted-foreground prose prose-sm max-w-none">
                {left.content}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{right.title}</CardTitle>
            {right.description && (
              <CardDescription>{right.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {right.features && (
              <ul className="space-y-2 mb-4">
                {right.features.map((feature, index) => (
                  <li
                    key={index}
                    className="flex items-start text-muted-foreground"
                  >
                    <span className="text-primary mr-2">•</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            )}
            {right.content && (
              <div className="mt-4 text-muted-foreground prose prose-sm max-w-none">
                {right.content}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

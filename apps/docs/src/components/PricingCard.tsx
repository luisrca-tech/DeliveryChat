import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { cn } from "@repo/ui/lib/utils";

interface PricingCardProps {
  title: string;
  price: string;
  description: string;
  features: string[];
  bestFor: string;
  popular?: boolean;
}

export function PricingCard({
  title,
  price,
  description,
  features,
  bestFor,
  popular = false,
}: PricingCardProps) {
  return (
    <Card
      className={cn(
        "relative hover:shadow-lg transition-shadow",
        popular && "border-2 border-blue-500 dark:border-blue-400",
      )}
    >
      {popular && (
        <div className="absolute top-4 right-4 bg-primary text-primary-foreground border-2 border-primary-foreground/20 text-xs font-bold px-2 py-1 rounded">
          POPULAR
        </div>
      )}
      <CardHeader className="p-6 pb-4 flex flex-col">
        <CardTitle className="text-xl mb-2 ">{title}</CardTitle>
        <div className="text-2xl font-bold text-primary ">{price}</div>
      </CardHeader>
      <CardContent className="pt-0">
        <CardDescription className="mb-6">{description}</CardDescription>
        <ul className="space-y-4 mb-6">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start">
              <span className="text-primary mr-2">✓</span>
              <span className="text-foreground">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="border-t pt-4 mt-0">
        <p className="text-sm text-muted-foreground">
          <strong>Best for:</strong> {bestFor}
        </p>
      </CardFooter>
    </Card>
  );
}

export function PricingGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">{children}</div>
  );
}

"use client";

import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/ui/components/ui/accordion";

interface FAQItem {
  question: string;
  answer: React.ReactNode;
}

interface FAQProps {
  items: FAQItem[];
  title?: string;
}

export function FAQ({ items, title = "Frequently Asked Questions" }: FAQProps) {
  return (
    <div className="my-8">
      <h3 className="text-xl font-semibold mb-6">{title}</h3>
      <Accordion type="single" collapsible className="space-y-4">
        {items.map((item, index) => (
          <AccordionItem
            key={index}
            value={`item-${index}`}
            className="border rounded-lg px-6 border-b"
          >
            <AccordionTrigger className="text-left hover:no-underline py-4 cursor-pointer">
              {item.question}
            </AccordionTrigger>
            <AccordionContent>
              <div className="text-muted-foreground prose prose-sm max-w-none pb-4">
                {item.answer}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

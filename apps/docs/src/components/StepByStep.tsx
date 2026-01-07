import React from "react";

interface Step {
  title?: string;
  content: React.ReactNode;
}

interface StepByStepProps {
  steps: Step[];
  title?: string;
}

export function StepByStep({ steps, title }: StepByStepProps) {
  return (
    <div className="my-8">
      {title && (
        <h3 className="text-xl font-semibold mb-6 text-gray-900 dark:text-gray-100">
          {title}
        </h3>
      )}
      <div className="space-y-6">
        {steps.map((step, index) => (
          <div key={index} className="flex gap-4">
            <div className="shrink-0">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white font-bold text-sm">
                {index + 1}
              </div>
            </div>
            <div className="flex-1 pt-1">
              {step.title && (
                <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">
                  {step.title}
                </h4>
              )}
              <div className="text-gray-700 dark:text-gray-300 prose prose-sm max-w-none">
                {step.content}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

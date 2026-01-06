import React from "react";

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
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-6 my-6">
      <h4 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
        {title}
      </h4>
      <div className="space-y-4">
        <div>
          <h5 className="font-medium mb-2 text-gray-800 dark:text-gray-200">
            Scenario:
          </h5>
          <div className="text-gray-700 dark:text-gray-300 prose prose-sm max-w-none">
            {scenario}
          </div>
        </div>
        <div>
          <h5 className="font-medium mb-2 text-gray-800 dark:text-gray-200">
            Solution:
          </h5>
          <div className="text-gray-700 dark:text-gray-300 prose prose-sm max-w-none">
            {solution}
          </div>
        </div>
        {code && (
          <div className="mt-4">
            <pre className="p-4 bg-gray-50 dark:bg-gray-950 rounded-lg overflow-x-auto border border-gray-200 dark:border-gray-800">
              <code
                className={`text-sm ${codeLanguage ? `language-${codeLanguage}` : ""}`}
              >
                {code}
              </code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

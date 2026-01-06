import React from "react";

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
      {title && (
        <h3 className="text-xl font-semibold mb-6 text-gray-900 dark:text-gray-100">
          {title}
        </h3>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <h4 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
            {left.title}
          </h4>
          {left.description && (
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {left.description}
            </p>
          )}
          {left.features && (
            <ul className="space-y-2">
              {left.features.map((feature, index) => (
                <li
                  key={index}
                  className="flex items-start text-gray-700 dark:text-gray-300"
                >
                  <span className="text-blue-500 mr-2">•</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          )}
          {left.content && (
            <div className="mt-4 text-gray-700 dark:text-gray-300 prose prose-sm max-w-none">
              {left.content}
            </div>
          )}
        </div>
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-6">
          <h4 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
            {right.title}
          </h4>
          {right.description && (
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {right.description}
            </p>
          )}
          {right.features && (
            <ul className="space-y-2">
              {right.features.map((feature, index) => (
                <li
                  key={index}
                  className="flex items-start text-gray-700 dark:text-gray-300"
                >
                  <span className="text-blue-500 mr-2">•</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          )}
          {right.content && (
            <div className="mt-4 text-gray-700 dark:text-gray-300 prose prose-sm max-w-none">
              {right.content}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

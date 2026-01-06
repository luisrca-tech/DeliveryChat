import React from "react";

interface Feature {
  name: string;
  description?: string;
}

interface FeatureListProps {
  title?: string;
  features: Feature[];
  icon?: string;
  columns?: 1 | 2;
}

export function FeatureList({
  title,
  features,
  icon = "✓",
  columns = 1,
}: FeatureListProps) {
  const gridCols = columns === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1";

  return (
    <div className="my-6">
      {title && (
        <h4 className="font-semibold mb-4 text-gray-900 dark:text-gray-100">
          {title}:
        </h4>
      )}
      <ul className={`grid ${gridCols} gap-3`}>
        {features.map((feature, index) => (
          <li key={index} className="flex items-start">
            <span className="text-green-500 mr-2 shrink-0">{icon}</span>
            <div>
              <span className="text-gray-700 dark:text-gray-300 font-medium">
                {feature.name}
              </span>
              {feature.description && (
                <span className="text-gray-600 dark:text-gray-400 ml-2">
                  - {feature.description}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

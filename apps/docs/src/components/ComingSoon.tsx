import React from "react";

interface ComingSoonProps {
  title?: string;
  description?: React.ReactNode;
  features?: string[];
  cta?: {
    text: string;
    href: string;
  };
}

export function ComingSoon({
  title = "Coming Soon",
  description,
  features,
  cta,
}: ComingSoonProps) {
  return (
    <div className="my-8 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg p-8 bg-blue-50 dark:bg-blue-950/20">
      <div className="text-center">
        <div className="text-4xl mb-4">🚧</div>
        <h3 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        {description && (
          <div className="text-gray-700 dark:text-gray-300 mb-6 prose prose-sm max-w-none">
            {description}
          </div>
        )}
        {features && (
          <div className="text-left max-w-md mx-auto mb-6">
            <p className="font-medium mb-3 text-gray-900 dark:text-gray-100">
              We&apos;re currently building:
            </p>
            <ul className="space-y-2">
              {features.map((feature, index) => (
                <li
                  key={index}
                  className="flex items-start text-gray-700 dark:text-gray-300"
                >
                  <span className="text-blue-500 mr-2">•</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {cta && (
          <a
            href={cta.href}
            className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            {cta.text}
          </a>
        )}
      </div>
    </div>
  );
}

import React from "react";

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
    <div
      className={`border rounded-lg p-6 hover:shadow-lg transition-shadow ${
        popular
          ? "border-2 border-blue-500 dark:border-blue-400 relative"
          : "border-gray-200 dark:border-gray-800"
      }`}
    >
      {popular && (
        <div className="absolute top-4 right-4 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded">
          POPULAR
        </div>
      )}
      <div className="mb-4">
        <h3 className="text-2xl font-bold mb-2">{title}</h3>
        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
          {price}
        </div>
      </div>
      <p className="text-gray-600 dark:text-gray-400 mb-6">{description}</p>
      <ul className="space-y-4 mb-6">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start">
            <span className="text-green-500 mr-2">✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <strong>Best for:</strong> {bestFor}
        </p>
      </div>
    </div>
  );
}

export function PricingGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">{children}</div>
  );
}

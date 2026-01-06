import Link from "next/link";
import React from "react";

interface QuickLink {
  title: string;
  href: string;
  description?: string;
  icon?: string;
}

interface QuickLinksProps {
  links: QuickLink[];
  columns?: 1 | 2 | 3;
}

export function QuickLinks({ links, columns = 2 }: QuickLinksProps) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  };

  return (
    <div className={`grid ${gridCols[columns]} gap-4 my-6`}>
      {links.map((link, index) => (
        <Link
          key={index}
          href={link.href}
          className="group block p-4 border border-gray-200 dark:border-gray-800 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-md transition-all"
        >
          <div className="flex items-start gap-3">
            {link.icon && (
              <span className="text-2xl shrink-0">{link.icon}</span>
            )}
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {link.title}
              </h3>
              {link.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {link.description}
                </p>
              )}
            </div>
            <span className="text-gray-400 group-hover:text-blue-500 transition-colors">
              →
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

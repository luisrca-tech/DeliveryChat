import React from "react";

interface CalloutProps {
  type?: "note" | "warning" | "tip" | "info";
  title?: string;
  children: React.ReactNode;
}

export function Callout({ type = "note", title, children }: CalloutProps) {
  const styles = {
    note: {
      border: "border-blue-200 dark:border-blue-800",
      bg: "bg-blue-50 dark:bg-blue-950/30",
      icon: "💡",
      defaultTitle: "Note",
    },
    warning: {
      border: "border-yellow-200 dark:border-yellow-800",
      bg: "bg-yellow-50 dark:bg-yellow-950/30",
      icon: "⚠️",
      defaultTitle: "Warning",
    },
    tip: {
      border: "border-green-200 dark:border-green-800",
      bg: "bg-green-50 dark:bg-green-950/30",
      icon: "💡",
      defaultTitle: "Tip",
    },
    info: {
      border: "border-gray-200 dark:border-gray-800",
      bg: "bg-gray-50 dark:bg-gray-950/30",
      icon: "ℹ️",
      defaultTitle: "Info",
    },
  };

  const style = styles[type];

  return (
    <div
      className={`border-l-4 ${style.border} ${style.bg} p-4 my-6 rounded-r-lg`}
    >
      <div className="flex items-start">
        <span className="text-xl mr-3 shrink-0">{style.icon}</span>
        <div className="flex-1">
          {title && (
            <h4 className="font-semibold mb-2 text-gray-900 dark:text-gray-100">
              {title}
            </h4>
          )}
          <div className="text-gray-700 dark:text-gray-300 prose prose-sm max-w-none">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

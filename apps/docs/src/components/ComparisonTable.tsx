import React from "react";

interface ComparisonTableProps {
  headers: string[];
  rows: {
    feature: string;
    values: (string | React.ReactNode)[];
  }[];
  highlightColumn?: number;
}

export function ComparisonTable({
  headers,
  rows,
  highlightColumn,
}: ComparisonTableProps) {
  return (
    <div className="my-8 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-300 dark:border-gray-700">
            <th className="text-left p-4 font-semibold text-gray-900 dark:text-gray-100">
              Feature
            </th>
            {headers.map((header, index) => (
              <th
                key={index}
                className={`text-center p-4 font-semibold text-gray-900 dark:text-gray-100 ${
                  highlightColumn === index
                    ? "bg-blue-50 dark:bg-blue-950/30"
                    : ""
                }`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
            >
              <td className="p-4 font-medium text-gray-900 dark:text-gray-100">
                {row.feature}
              </td>
              {row.values.map((value, colIndex) => (
                <td
                  key={colIndex}
                  className={`text-center p-4 text-gray-700 dark:text-gray-300 ${
                    highlightColumn === colIndex
                      ? "bg-blue-50 dark:bg-blue-950/30"
                      : ""
                  }`}
                >
                  {typeof value === "string" ? value : value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

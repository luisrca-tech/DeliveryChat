import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export const Route = createFileRoute("/")({ component: App });

function App() {
  const [usersData, setUsersData] = useState<unknown>(null);
  const [companiesData, setCompaniesData] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  // TODO: remove this once we have a real API
  useEffect(() => {
    // Test RPC calls
    const testRPC = async () => {
      try {
        // Test users endpoint - access via nested path structure
        // @ts-expect-error - Hono RPC types for nested routes
        const usersRes = await api.api.users.$get({
          query: { limit: 5, offset: 0 },
        });
        if (usersRes.ok) {
          const usersJson = await usersRes.json();
          setUsersData(usersJson);
        }

        // Test companies endpoint
        // @ts-expect-error - Hono RPC types for nested routes
        const companiesRes = await api.api.companies.$get({
          query: { limit: 5, offset: 0 },
        });
        if (companiesRes.ok) {
          const companiesJson = await companiesRes.json();
          setCompaniesData(companiesJson);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    };

    testRPC();
  }, []);

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-900 via-slate-800 to-slate-900">
      <section className="py-16 px-6 max-w-7xl mx-auto">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">
            RPC Integration Test
          </h2>
          {error && (
            <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg">
              <p className="text-red-300">Error: {error}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Users</h3>
              <pre className="bg-slate-900 p-4 rounded-lg overflow-auto text-sm text-gray-300">
                {usersData ? JSON.stringify(usersData, null, 2) : "Loading..."}
              </pre>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Companies
              </h3>
              <pre className="bg-slate-900 p-4 rounded-lg overflow-auto text-sm text-gray-300">
                {companiesData
                  ? JSON.stringify(companiesData, null, 2)
                  : "Loading..."}
              </pre>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

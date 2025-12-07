import { createFileRoute } from "@tanstack/react-router";
import { api } from "../lib/api";

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      console.log("[App] Loading data via TanStack Router loader...");

      // Load users
      const usersRes = await api.users.$get({
        query: { limit: "5", offset: "0" },
      });

      if (!usersRes.ok) {
        const errorText = await usersRes.text();
        throw new Error(`Users API error: ${usersRes.status} - ${errorText}`);
      }

      const usersData = await usersRes.json();

      // Load companies
      const companiesRes = await api.companies.$get({
        query: { limit: "5", offset: "0" },
      });

      if (!companiesRes.ok) {
        const errorText = await companiesRes.text();
        throw new Error(
          `Companies API error: ${companiesRes.status} - ${errorText}`
        );
      }

      const companiesData = await companiesRes.json();

      return {
        users: usersData,
        companies: companiesData,
      };
    } catch (error) {
      console.error("[App] Loader Error:", error);
      throw error;
    }
  },
  component: App,
});

function App() {
  const { users, companies } = Route.useLoaderData();

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-900 via-slate-800 to-slate-900">
      <section className="py-16 px-6 max-w-7xl mx-auto">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
          <h2 className="text-2xl font-semibold text-white mb-4">
            RPC Integration Test
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Users</h3>
              <pre className="bg-slate-900 p-4 rounded-lg overflow-auto text-sm text-gray-300">
                {JSON.stringify(users, null, 2)}
              </pre>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Companies
              </h3>
              <pre className="bg-slate-900 p-4 rounded-lg overflow-auto text-sm text-gray-300">
                {JSON.stringify(companies, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

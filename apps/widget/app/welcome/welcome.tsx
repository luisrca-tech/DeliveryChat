export function Welcome() {
  return (
    <main className="min-h-screen bg-linear-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <header className="text-center mb-12">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Delivery Chat Widget
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Embeddable vanilla JS chat widget with Shadow DOM and customizable theming
          </p>
        </header>

        <section className="space-y-6 mb-12">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
              How to use
            </h2>
            <ol className="list-decimal list-inside space-y-2 text-slate-600 dark:text-slate-300 text-sm">
              <li>Click the chat button in the bottom-right corner to open the widget</li>
              <li>Type a message and press Send to test the UI</li>
              <li>For custom settings, run the API (port 8000) and seed the database</li>
              <li>Build the embed: <code className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">bun run build:embed</code></li>
            </ol>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
              Embed on your site
            </h2>
            <pre className="text-xs bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto">
{`<script src="https://your-cdn.com/widget.js"></script>
<script>
  DeliveryChat.init({
    appId: "your-app-uuid",
    position: "bottom-right",
  });
</script>`}
            </pre>
          </div>

          <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 p-4">
            <p className="text-sm text-sky-800 dark:text-sky-200">
              <strong>Live preview:</strong> The chat widget is loaded on this page. Look for the button in the bottom-right corner.
            </p>
          </div>
        </section>

        <footer className="text-center text-sm text-slate-500 dark:text-slate-400">
          <p>Vanilla JS • Shadow DOM • Zero framework dependencies</p>
        </footer>
      </div>
    </main>
  );
}

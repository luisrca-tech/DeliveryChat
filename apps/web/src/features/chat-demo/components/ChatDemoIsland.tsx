import { MessageCircle } from "lucide-react";

interface ChatDemoIslandProps {
  apiUrl: string;
  apiKey: string;
  appId: string;
}

export function ChatDemoIsland({ apiUrl, apiKey, appId }: ChatDemoIslandProps) {
  const isReady = Boolean(apiUrl && apiKey && appId);

  return (
    <div className="w-full h-full flex items-center justify-center bg-linear-to-br from-primary/10 to-primary-glow/10">
      <div className="flex flex-col items-center gap-4 text-muted-foreground">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
            <MessageCircle className="w-8 h-8 text-primary" />
          </div>
          {isReady && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary animate-glow" />
          )}
        </div>
        <p className="text-sm font-medium">Chat Demo</p>
        <p className="text-xs opacity-60">Live support coming soon</p>
      </div>
    </div>
  );
}

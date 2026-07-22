import { useEffect, useState } from "react";
import type { ChatClient } from "../chat-client";
import type { DisclosureSettings } from "../lib/aiDisclosure";

type WidgetSettingsState = {
  /** Server-derived AI entitlement (plan + add-on + per-application toggles). */
  aiEnabled: boolean;
  settings: DisclosureSettings;
};

/**
 * Fetches the application's public widget settings once. Shared by every AI
 * affordance in the demo (the disclosure line, the handoff button) so they read
 * one source and can never disagree about whether AI is on.
 *
 * A failure leaves `aiEnabled` false: the demo then shows no AI affordances at
 * all, rather than offering behaviour the backend may reject.
 */
export function useWidgetSettings(client: ChatClient): WidgetSettingsState {
  const [state, setState] = useState<WidgetSettingsState>({
    aiEnabled: false,
    settings: {},
  });

  useEffect(() => {
    let cancelled = false;
    client
      .getSettings()
      .then(({ settings }) => {
        if (cancelled) return;
        setState({
          aiEnabled: settings?.ai?.enabled === true,
          settings: settings ?? {},
        });
      })
      .catch(() => {
        if (!cancelled) setState({ aiEnabled: false, settings: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return state;
}

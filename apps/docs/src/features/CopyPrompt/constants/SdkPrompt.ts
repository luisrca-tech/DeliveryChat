export const SDK_PROMPT = `You are integrating the DeliveryChat JavaScript SDK into a web application.

## Package

\`\`\`bash
npm install @deliverychat/sdk@^1.0.0
\`\`\`

## Initialization

\`\`\`typescript
import { init, getSdkApi, destroy } from "@deliverychat/sdk";

init({
  appId: process.env.NEXT_PUBLIC_DELIVERYCHAT_APP_ID, // or VITE_DELIVERYCHAT_APP_ID, etc.
  apiBaseUrl: process.env.NEXT_PUBLIC_DELIVERYCHAT_API_URL, // e.g. "https://api.deliverychat.online"
});

const chat = getSdkApi();
\`\`\`

### apiBaseUrl contract

- Must be the origin only (protocol + host + optional port).
- NEVER append \`/api/v1\` — the SDK handles path construction internally.
- Examples: \`"https://api.deliverychat.online"\`, \`"http://localhost:8000"\`

### Environment variable naming by framework

| Framework | Prefix |
|-----------|--------|
| Next.js | \`NEXT_PUBLIC_\` |
| Vite / React Router | \`VITE_\` |
| Create React App | \`REACT_APP_\` |
| Nuxt | \`NUXT_PUBLIC_\` |
| Astro (client) | \`PUBLIC_\` |

## Client-only lifecycle

The SDK must only be initialized in the browser. Never call \`init()\` during SSR.

### React (useEffect)

\`\`\`typescript
import { init, destroy } from "@deliverychat/sdk";
import { useEffect } from "react";

function App() {
  useEffect(() => {
    init({ appId: "YOUR_APP_ID", apiBaseUrl: "https://api.deliverychat.online" });
    return () => { destroy(); };
  }, []);

  return <div>...</div>;
}
\`\`\`

### Vue (onMounted / onUnmounted)

\`\`\`typescript
import { init, destroy } from "@deliverychat/sdk";
import { onMounted, onUnmounted } from "vue";

onMounted(() => {
  init({ appId: "YOUR_APP_ID", apiBaseUrl: "https://api.deliverychat.online" });
});
onUnmounted(() => { destroy(); });
\`\`\`

### Vanilla JS (DOMContentLoaded)

\`\`\`typescript
import { init } from "@deliverychat/sdk";

document.addEventListener("DOMContentLoaded", () => {
  init({ appId: "YOUR_APP_ID", apiBaseUrl: "https://api.deliverychat.online" });
});
\`\`\`

## Public API

### Exports from \`@deliverychat/sdk\`

- \`init(options)\` — Initialize the SDK and render the widget
- \`destroy()\` — Tear down the widget and release resources
- \`getSdkApi()\` — Get the API instance for programmatic control

### Methods on the API instance (\`getSdkApi()\`)

- \`open()\` — Open the chat window
- \`close()\` — Close the chat window
- \`toggle()\` — Toggle open/close
- \`hideWidget()\` — Hide the launcher button
- \`showWidget()\` — Show the launcher button
- \`sendMessage(text)\` — Send a message programmatically
- \`identify(userData)\` — Associate visitor with known user data
- \`on(event, callback)\` — Subscribe to an event
- \`off(event, callback)\` — Unsubscribe from an event
- \`getConversation()\` — Get current conversation state

### Events

- \`ready\` — Widget loaded and connected
- \`open\` — Chat window opened
- \`close\` — Chat window closed
- \`message:received\` — New message from operator
- \`message:sent\` — Message sent by visitor
- \`conversation:started\` — New conversation created
- \`conversation:resolved\` — Conversation marked as solved
- \`unread:changed\` — Unread count updated (payload: \`{ count }\`)

## Anti-patterns

Do NOT use any of these — they do not exist:
- \`connect()\`, \`disconnect()\`, \`configure()\`, \`setup()\`, \`start()\`
- \`DeliveryChat.render()\`, \`DeliveryChat.mount()\`
- Any method not listed above

## Out of scope (separate docs)

- Headless mode (custom UI without the default widget): see /v1/sdk/headless
- \`identify()\` with HMAC verification: see /v1/sdk/identity
- Event payload types: see /v1/sdk/events

## Success criteria

Integration is complete when:
1. The chat widget is visible on the page
2. A visitor can send a message
3. The message appears in the conversation thread
`;

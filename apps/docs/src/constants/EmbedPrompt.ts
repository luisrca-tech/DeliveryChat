export const EMBED_PROMPT = `You are integrating the DeliveryChat widget via CDN script tag on a website.

## Quick Start

Add this snippet to your HTML (before \`</body>\` or in \`<head>\` with async):

\`\`\`html
<script>
  (function(w,d,s,o){
    w.DeliveryChat=w.DeliveryChat||function(){(w.DeliveryChat.queue=w.DeliveryChat.queue||[]).push(arguments)};
    var js=d.createElement(s);js.async=1;js.src='https://api.deliverychat.online/widget.js';
    d.head.appendChild(js);
  })(window,document,'script');

  DeliveryChat('init', { appId: 'YOUR_APP_ID' });
</script>
\`\`\`

Replace \`YOUR_APP_ID\` with your application UUID from the dashboard.

## How the queue-stub works

The snippet creates a lightweight \`DeliveryChat\` function that queues all calls. When the real script loads, it replays the queue in order. This means:
- You can call \`DeliveryChat('init', ...)\` immediately — no race condition.
- Event listeners registered via \`DeliveryChat('on', ...)\` before load are preserved.
- The script loads asynchronously and never blocks page rendering.

## apiBaseUrl

- NOT required for CDN embed — the widget auto-detects the API origin from the script \`src\` attribute.
- Only pass \`apiBaseUrl\` if self-hosting the widget bundle on a different domain than the API:
  \`\`\`javascript
  DeliveryChat('init', { appId: 'YOUR_APP_ID', apiBaseUrl: 'https://your-api.example.com' });
  \`\`\`
- If provided, it must be origin-only (no \`/api/v1\` suffix).

## Public API

### Global methods (\`window.DeliveryChat\`)

After the script loads, \`DeliveryChat\` becomes an object with these methods:

- \`DeliveryChat.init(options)\` — Initialize the widget
- \`DeliveryChat.destroy()\` — Remove the widget and clean up
- \`DeliveryChat.open()\` — Open the chat window
- \`DeliveryChat.close()\` — Close the chat window
- \`DeliveryChat.toggle()\` — Toggle open/close
- \`DeliveryChat.hideWidget()\` — Hide the launcher button
- \`DeliveryChat.showWidget()\` — Show the launcher button
- \`DeliveryChat.sendMessage(text)\` — Send a message
- \`DeliveryChat.identify(userData)\` — Identify the visitor
- \`DeliveryChat.on(event, callback)\` — Subscribe to events
- \`DeliveryChat.off(event, callback)\` — Unsubscribe from events
- \`DeliveryChat.getConversation()\` — Get conversation state

### Queue commands (before script loads)

Before the script finishes loading, use the function-call syntax:

\`\`\`javascript
DeliveryChat('init', { appId: 'YOUR_APP_ID' });
DeliveryChat('on', 'ready', function() { console.log('Widget ready'); });
DeliveryChat('sendMessage', 'Hello!');
DeliveryChat('identify', { name: 'Jane', email: 'jane@example.com' });
\`\`\`

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

Do NOT use these — they do not exist:
- \`DeliveryChat.connect()\`, \`DeliveryChat.configure()\`, \`DeliveryChat.setup()\`
- \`DeliveryChat.render()\`, \`DeliveryChat.mount()\`
- Loading the script without the queue stub (causes race conditions)

## Success criteria

Integration is complete when:
1. The chat widget is visible on the page
2. A visitor can send a message
3. The message appears in the conversation thread
`;

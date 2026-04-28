# ScrollArea Viewport Ref

## Problem

MessageList needed to track scroll position to decide whether to auto-scroll on new messages. The Radix ScrollArea component doesn't expose the scrollable viewport element directly, so the code used `querySelector("[data-radix-scroll-area-viewport]")` to find it — coupling the component to Radix's internal attribute naming.

## Solution

Added an optional `viewportRef` prop to the shared `ScrollArea` component in `@repo/ui`. The ref is forwarded directly to `ScrollAreaPrimitive.Viewport`, giving consumers typed, stable access to the scroll container.

### ScrollArea API

```tsx
<ScrollArea viewportRef={viewportRef} className="flex-1">
  {children}
</ScrollArea>
```

`viewportRef` accepts any `React.Ref<HTMLDivElement>`. Existing consumers that don't pass it are unaffected.

### MessageList Usage

```tsx
const viewportRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const viewport = viewportRef.current;
  if (!viewport) return;

  const handleScroll = () => {
    const { scrollTop, scrollHeight, clientHeight } = viewport;
    isNearBottomRef.current =
      scrollHeight - scrollTop - clientHeight < NEAR_BOTTOM_THRESHOLD;
  };

  viewport.addEventListener("scroll", handleScroll, { passive: true });
  return () => viewport.removeEventListener("scroll", handleScroll);
}, []);
```

## What Changed

- `packages/ui/src/components/ui/scroll-area.tsx` — added `viewportRef` prop to `ScrollArea`, forwarded to Radix Viewport
- `apps/admin/src/features/chat/components/MessageList.tsx` — replaced `querySelector` with `viewportRef`
- Zero remaining `[data-radix-scroll-area-viewport]` selectors in the codebase

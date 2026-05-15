# SDK Version Deprecation

## 0.1.0 Deprecation

The `0.1.0` release was a placeholder published to reserve the `@deliverychat/sdk` package name on npm. It contained no functional code.

After publishing `1.0.0`, the placeholder must be deprecated so users see a clear redirect:

```bash
npm deprecate @deliverychat/sdk@0.1.0 "Use 1.0.0 or later"
```

Verify with:

```bash
npm info @deliverychat/sdk
```

The `0.1.0` entry should show a deprecation notice.

## When to Run

This command must be run **after** `1.0.0` is published to npm. It requires npm authentication with publish permissions for the `@deliverychat` scope.

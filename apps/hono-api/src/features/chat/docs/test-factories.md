# Test Factories

## Overview

Shared test factories in `routes/__tests__/factories.ts` eliminate duplicated mock boilerplate across conversation route test files.

## Exports

### `TEST_IDS`

Constant object with deterministic IDs used across all conversation route tests:

- `VISITOR_ID`, `VISITOR_USER_ID`, `MEMBER_USER_ID`
- `ORG_ID`, `APP_ID`, `CONV_ID`, `MSG_ID`

### `createMemberAuthContext(role?)`

Returns a member auth context object. Default role: `"admin"`.

### `createVisitorAuthContext()`

Returns a visitor auth context object with application and API key.

## Usage

```typescript
import { TEST_IDS, createMemberAuthContext, createVisitorAuthContext } from "./factories.js";

const { MEMBER_USER_ID, ORG_ID, CONV_ID } = TEST_IDS;

// In tests:
mockUnifiedAuthContext = createMemberAuthContext("operator");
mockUnifiedAuthContext = createVisitorAuthContext();
```

## What stays in each test file

`vi.mock()` calls are hoisted by Vitest and must remain at the module level of each test file. The factories only extract data construction, not mock setup.

# Email Module Architecture

## Structure

- **client.ts** – Shared Resend client, `renderEmail`, and `sendEmail`. Internal use only.
- **auth.ts** – Auth-related emails: OTP verification, reset password, email verified welcome, password changed, new sign-in alert.
- **trial.ts** – Trial lifecycle: trial started, trial ending soon.
- **billing.ts** – Plan and billing: enterprise request, plan upgraded, payment failed, subscription canceled, invoice receipt.
- **index.ts** – Barrel file re-exporting all public APIs.

## Usage

Import from the barrel:

```ts
import {
  sendVerificationOTPEmail,
  sendTrialEndingSoonEmail,
  sendInvoiceReceiptEmail,
} from "../lib/email/index.js";
```

Or import from specific modules when only one category is needed:

```ts
import { sendTrialEndingSoonEmail } from "../lib/email/trial.js";
```

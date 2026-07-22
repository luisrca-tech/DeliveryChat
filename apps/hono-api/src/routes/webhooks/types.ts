import type { db } from "../../db/index.js";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EmailTask = () => Promise<void>;

/**
 * A side effect that must run only after the DB transaction commits, mirroring
 * the `emailTasks` pattern. Used for Stripe API calls (e.g. removing the AI
 * add-on subscription item on a downgrade) so we never hold external calls
 * inside the transaction and never act on a rolled-back state.
 */
export type DeferredTask = () => Promise<void>;

export interface HandlerContext {
  tx: Transaction;
  emailTasks: EmailTask[];
  deferredTasks: DeferredTask[];
}

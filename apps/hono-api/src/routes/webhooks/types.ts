import type { db } from "../../db/index.js";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EmailTask = () => Promise<void>;

export interface HandlerContext {
  tx: Transaction;
  emailTasks: EmailTask[];
}

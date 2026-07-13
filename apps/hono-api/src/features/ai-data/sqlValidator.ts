export type SqlValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Word-boundary matched write / DDL keywords that must never appear in a stored
 * DataTool query. Defense-in-depth: the DB role should already be SELECT-only,
 * but we reject at save time too.
 */
const FORBIDDEN_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "create",
  "grant",
  "truncate",
  "copy",
  "execute",
  "do",
  "into",
];

/**
 * Save-time lint / first-line filter for SQL DataTool queries. Reused by the
 * CRUD layer and re-run by the SQL executor as cheap defense-in-depth.
 *
 * This is a keyword blocklist, NOT a read-only guarantee: constructs like CTEs
 * or side-effectful functions can pass it. The read-only GUARANTEE lives in the
 * executor (`sqlExecutor.ts`), which runs every query inside a
 * `BEGIN TRANSACTION READ ONLY` block so Postgres rejects writes at runtime.
 *
 * As a lint pass it rejects the obvious cases early:
 *  - comments are stripped first (to defeat comment-smuggled statements),
 *  - only one statement (no `;` except a single trailing one),
 *  - must start with `SELECT`,
 *  - no write/DDL keywords (matched on word boundaries, so column names like
 *    `created_at` or `updated_at` are safe).
 */
export function validateSqlQuery(query: string): SqlValidationResult {
  if (typeof query !== "string" || query.trim().length === 0) {
    return { ok: false, error: "Query must be a non-empty string" };
  }

  const stripped = stripComments(query).trim();
  if (stripped.length === 0) {
    return { ok: false, error: "Query is empty after removing comments" };
  }

  // Allow a single trailing semicolon; reject any interior one (multi-statement).
  const withoutTrailingSemicolon = stripped.replace(/;\s*$/, "");
  if (withoutTrailingSemicolon.includes(";")) {
    return { ok: false, error: "Only a single statement is allowed" };
  }

  if (!/^select\b/i.test(withoutTrailingSemicolon)) {
    return { ok: false, error: "Query must start with SELECT" };
  }

  for (const keyword of FORBIDDEN_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword}\\b`, "i");
    if (pattern.test(withoutTrailingSemicolon)) {
      return {
        ok: false,
        error: `Query must not contain the keyword "${keyword}"`,
      };
    }
  }

  return { ok: true };
}

function stripComments(query: string): string {
  // Remove block comments /* ... */ then line comments -- ... to end of line.
  return query.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Whether the query already declares a LIMIT (ignoring comments). */
export function hasLimitClause(query: string): boolean {
  return /\blimit\b/i.test(stripComments(query));
}

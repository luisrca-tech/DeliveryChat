/** AI interview + context pages use the editorial paper shell (no AppShell padding). */
export function isEditorialInterviewRoute(pathname: string): boolean {
  return /\/applications\/[^/]+\/ai-(interview|context)(?:\/|$)/.test(
    pathname,
  );
}

export const ADMIN_APP_NAME = "Delivery Chat Admin";

export const DEFAULT_ADMIN_DESCRIPTION =
  "Delivery Chat admin dashboard for operators and administrators.";

export function createAdminPageHead(pageTitle: string, description: string) {
  return () => ({
    meta: [
      { title: `${pageTitle} · ${ADMIN_APP_NAME}` },
      { name: "description", content: description },
    ],
  });
}

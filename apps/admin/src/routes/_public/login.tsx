import { createFileRoute, useSearch } from "@tanstack/react-router";
import "@repo/ui/styles.css";
import { createAdminPageHead } from "@/lib/adminMeta";
import { LoginForm } from "@/features/login";
import { loginSearchSchema } from "@/schemas/auth";
import type { LoginSearchParams } from "@/types/auth";

export const Route = createFileRoute("/_public/login")({
  head: createAdminPageHead(
    "Sign in",
    "Sign in to your Delivery Chat admin workspace.",
  ),
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => {
    return loginSearchSchema.parse(search);
  },
});

function LoginPage() {
  const search = useSearch({ from: "/_public/login" }) as LoginSearchParams;
  const redirectPath = search.redirect || "/";

  return <LoginForm redirectPath={redirectPath} />;
}

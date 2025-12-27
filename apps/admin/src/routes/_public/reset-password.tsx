import { createFileRoute, useSearch } from "@tanstack/react-router";
import "@repo/ui/styles.css";
import { ResetPasswordForm } from "@/features/reset-password";
import { resetPasswordSearchSchema } from "@/schemas/auth";
import type { ResetPasswordSearchParams } from "@/types/auth";

export const Route = createFileRoute("/_public/reset-password")({
  component: ResetPasswordPage,
  validateSearch: (search: Record<string, unknown>) => {
    return resetPasswordSearchSchema.parse(search);
  },
});

function ResetPasswordPage() {
  const search = useSearch({
    from: "/_public/reset-password",
  }) as ResetPasswordSearchParams;

  return <ResetPasswordForm token={search.token || ""} />;
}

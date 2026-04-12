import { createFileRoute } from "@tanstack/react-router";
import "@repo/ui/styles.css";
import { ForgotPasswordForm } from "@/features/forgot-password";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute("/_public/forgot-password")({
  head: createAdminPageHead(
    "Forgot password",
    "Request a link to reset your Delivery Chat admin password.",
  ),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}

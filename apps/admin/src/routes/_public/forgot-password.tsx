import { createFileRoute } from "@tanstack/react-router";
import "@repo/ui/styles.css";
import { ForgotPasswordForm } from "@/features/forgot-password";

export const Route = createFileRoute("/_public/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { authClient } from "@/lib/authClient";
import { getSubdomainUrl } from "@/lib/urls";
import { forgotPasswordSchema } from "@/schemas/auth";
import type { ForgotPasswordFormData } from "@/types/auth";

export function useForgotPassword() {
  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    try {
      const result = await authClient.requestPasswordReset({
        email: data.email,
        redirectTo: getSubdomainUrl("/reset-password"),
      });

      if (!result.data) {
        throw new Error(result.error?.message || "Failed to send reset email");
      }

      toast.success("Reset link sent!", {
        description: "Check your email for password reset instructions.",
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      const message =
        error instanceof Error
          ? error.message
          : "An error occurred. Please try again.";

      form.setError("email", { type: "server", message });

      toast.error("Failed to send reset email", {
        description: message,
      });
    }
  };

  return {
    ...form,
    onSubmit: form.handleSubmit(onSubmit),
  };
}

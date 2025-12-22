import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/authClient";
import { resetPasswordSchema } from "@/schemas/auth";
import type { ResetPasswordFormData } from "@/types/auth";

interface UseResetPasswordOptions {
  token: string;
}

export function useResetPassword({ token }: UseResetPasswordOptions) {
  const navigate = useNavigate();
  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    try {
      const result = await authClient.resetPassword({
        token,
        newPassword: data.password,
      });

      if (!result.data) {
        throw new Error(result.error?.message || "Failed to reset password");
      }

      toast.success("Password reset successfully!", {
        description: "You can now sign in with your new password.",
      });

      setTimeout(() => {
        navigate({
          to: "/login",
          search: {
            error: undefined,
            message: undefined,
            redirect: undefined,
          },
        });
      }, 2000);
    } catch (error) {
      console.error("Reset password error:", error);
      const message =
        error instanceof Error
          ? error.message
          : "This link may be invalid or expired. Please request a new one.";

      form.setError("password", { type: "server", message });

      toast.error("Failed to reset password", {
        description: message,
      });
    }
  };

  return {
    ...form,
    onSubmit: form.handleSubmit(onSubmit),
  };
}

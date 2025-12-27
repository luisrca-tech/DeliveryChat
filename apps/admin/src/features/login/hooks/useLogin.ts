import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { authClient } from "@/lib/authClient";
import { loginSchema } from "@/schemas/auth";
import type { LoginFormData } from "@/types/auth";
import { handleLoginSuccess } from "../lib/success";
import { handleLoginError } from "../lib/errorHandling";

interface UseLoginOptions {
  redirectPath?: string;
}

export function useLogin({ redirectPath = "/" }: UseLoginOptions = {}) {
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      const result = await authClient.signIn.email({
        email: data.email,
        password: data.password,
      });

      if (!result.data) {
        throw new Error(result.error?.message || "Failed to sign in");
      }

      handleLoginSuccess(redirectPath);
    } catch (error) {
      handleLoginError(error, data.email, form.setError);
    }
  };

  return {
    ...form,
    onSubmit: form.handleSubmit(onSubmit),
  };
}

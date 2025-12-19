import { authClient } from "./authClient";
import type { RegistrationFormData } from "@repo/types";

export interface RegistrationResult {
  success: boolean;
  error?: string;
}

export async function registerUser(
  data: RegistrationFormData
): Promise<RegistrationResult> {
  try {
    const signUpResult = await authClient.signUp.email({
      email: data.email,
      password: data.password,
      name: data.fullName,
    });

    if (!signUpResult.data) {
      return {
        success: false,
        error: signUpResult.error?.message || "Failed to create account",
      };
    }

    const orgResult = await authClient.organization.create({
      name: data.companyName,
      slug: data.subdomain,
    });

    if (!orgResult.data) {
      return {
        success: false,
        error: orgResult.error?.message || "Failed to create organization",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Registration error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "An error occurred while creating your account. Please try again.",
    };
  }
}

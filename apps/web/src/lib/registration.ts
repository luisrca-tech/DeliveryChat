import type { RegistrationFormData } from "@repo/types";
import { getApiUrl } from "./urls.js";

export interface RegistrationResult {
  success: boolean;
  status?: "OTP_SENT" | "PENDING_VERIFICATION_EXISTS";
  error?: string;
}

export async function registerUser(
  data: RegistrationFormData,
): Promise<RegistrationResult> {
  try {
    const apiUrl = getApiUrl();
    const response = await fetch(`${apiUrl}/api/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        email: data.email,
        password: data.password,
        name: data.fullName,
        companyName: data.companyName,
        subdomain: data.subdomain,
      }),
    });

    let result;
    try {
      result = await response.json();
    } catch (jsonError) {
      return {
        success: false,
        error: `Registration failed: ${response.status} ${response.statusText}`,
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: result.message || result.error || "Registration failed",
      };
    }

    return {
      success: true,
      status: result.status as "OTP_SENT" | "PENDING_VERIFICATION_EXISTS",
    };
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

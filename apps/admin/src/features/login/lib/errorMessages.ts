import type { LoginErrorType } from "../types/loginError.type";

export function getErrorMessage(errorType: LoginErrorType): string {
  const errorMessages: Record<LoginErrorType, string> = {
    EMAIL_NOT_VERIFIED:
      "Email not verified. Please check your email for the verification code.",
    EXPIRED: "Signup expired. Please register again.",
    GENERIC: "Invalid email or password. Please try again.",
  };

  return errorMessages[errorType];
}

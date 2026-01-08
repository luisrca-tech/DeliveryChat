import { toast } from "sonner";
import type { LoginErrorType } from "../types/loginError.type";
import { getErrorMessage } from "./errorMessages";
import { handleEmailNotVerifiedError } from "./emailNotVerified";

export function categorizeLoginError(error: Error): LoginErrorType {
  const errorMessage = error.message.toLowerCase();

  if (
    errorMessage.includes("email not verified") ||
    errorMessage.includes("verification")
  ) {
    return "EMAIL_NOT_VERIFIED";
  }

  if (
    errorMessage.includes("expired") ||
    errorMessage.includes("signup expired")
  ) {
    return "EXPIRED";
  }

  return "GENERIC";
}

export function handleLoginError(
  error: unknown,
  setError: (
    field: "email",
    error: { type: "server"; message: string },
  ) => void,
): void {
  console.error("Login error:", error);

  if (!(error instanceof Error)) {
    const message = getErrorMessage("GENERIC");
    toast.error("Sign In Failed", { description: message });
    setError("email", { type: "server", message });
    return;
  }

  const errorType = categorizeLoginError(error);
  const message = getErrorMessage(errorType);

  switch (errorType) {
    case "EMAIL_NOT_VERIFIED":
      handleEmailNotVerifiedError();
      break;
    case "EXPIRED":
      toast.error("Signup Expired", { description: message });
      break;
    default:
      toast.error("Sign In Failed", { description: message });
  }

  setError("email", { type: "server", message });
}

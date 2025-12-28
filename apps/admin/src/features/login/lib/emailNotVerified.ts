import { toast } from "sonner";
import { getErrorMessage } from "./errorMessages";

export function handleEmailNotVerifiedError(): void {
  const message = getErrorMessage("EMAIL_NOT_VERIFIED");
  toast.error("Email Not Verified", {
    description: message,
  });
}

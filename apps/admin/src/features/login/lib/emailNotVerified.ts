import { toast } from "sonner";
import { getWebAppUrl } from "@/lib/urls";
import { getErrorMessage } from "./errorMessages";

export function handleEmailNotVerifiedError(email: string): void {
  const message = getErrorMessage("EMAIL_NOT_VERIFIED");
  toast.error("Email Not Verified", {
    description: message,
    action: {
      label: "Go to Verification",
      onClick: () => {
        const webAppUrl = getWebAppUrl();
        const params = new URLSearchParams({ email });
        window.location.href = `${webAppUrl}/verify-email?${params.toString()}`;
      },
    },
  });
}

import { toast } from "sonner";
import { getSubdomainUrl } from "@/lib/urls";

export function handleLoginSuccess(redirectPath: string): void {
  toast.success("Signed in successfully!");
  window.location.href = getSubdomainUrl(redirectPath);
}

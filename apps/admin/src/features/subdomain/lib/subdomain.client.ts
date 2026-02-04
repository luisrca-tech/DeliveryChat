import { getApiBaseUrl } from "@/lib/urls";

export async function checkTenantExists(subdomain: string): Promise<boolean> {
  try {
    const apiBase = getApiBaseUrl();
    const response = await fetch(
      `${apiBase}/tenants/check?subdomain=${encodeURIComponent(subdomain)}`,
      {
        method: "GET",
        credentials: "include",
      },
    );

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data?.exists === true;
  } catch (error) {
    console.error("[Subdomain Check] Error checking tenant:", error);
    return false;
  }
}

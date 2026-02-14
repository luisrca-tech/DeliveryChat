import { getApiBaseUrl } from "@/lib/urls";
import { getSubdomain } from "@/lib/subdomain";
import { getBearerToken } from "@/lib/bearerToken";

export async function checkTenantExists(subdomain: string): Promise<boolean> {
  try {
    const apiBase = getApiBaseUrl();
    const response = await fetch(
      `${apiBase}/tenants/check?subdomain=${encodeURIComponent(subdomain)}`,
      {
        method: "GET",
        headers: (() => {
          const tenant = getSubdomain();
          const token = getBearerToken();
          const headers: Record<string, string> = {};
          if (tenant) headers["X-Tenant-Slug"] = tenant;
          if (token) headers["Authorization"] = `Bearer ${token}`;
          return Object.keys(headers).length ? headers : undefined;
        })(),
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

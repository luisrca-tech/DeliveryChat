import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/authClient";
import { getSubdomain } from "@/lib/subdomain";

export const authSessionQueryKey = ["auth", "session"] as const;

type AuthSessionData = {
  session: { id: string; userId: string };
  user: { id: string; name?: string; email?: string };
  currentOrganization: { id: string; slug?: string; name: string };
} | null;

async function fetchAuthSession(): Promise<AuthSessionData> {
  const sessionResult = await authClient.getSession();

  if (!sessionResult?.data?.session) {
    return null;
  }

  const { session, user } = sessionResult.data;
  const subdomain = getSubdomain();

  const orgsResult = await authClient.organization.list();
  const organizations = orgsResult.data || [];

  const currentOrg = organizations.find(
    (org: { slug?: string; id: string }) =>
      org.slug === subdomain || org.id === subdomain,
  );

  if (!currentOrg) {
    return null;
  }

  await authClient.organization.setActive({
    organizationId: currentOrg.id,
  });

  return {
    session,
    user,
    currentOrganization: currentOrg,
  };
}

export function useAuthSession() {
  return useQuery({
    queryKey: authSessionQueryKey,
    queryFn: fetchAuthSession,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

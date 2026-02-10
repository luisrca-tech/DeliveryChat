export type EnterprisePlanRequestEmailProps = Readonly<{
  organizationName: string;
  adminEmail: string;
  memberCount: number;
  enterpriseDetails?: {
    fullName: string;
    email: string;
    phone?: string;
    teamSize?: number;
    notes?: string;
  } | null;
}>;


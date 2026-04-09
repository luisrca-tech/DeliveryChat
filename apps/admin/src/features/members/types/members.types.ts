export type OrgMember = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  status: string;
  isAnonymous: boolean;
  role: "super_admin" | "admin" | "operator";
  createdAt: string;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: "super_admin" | "admin" | "operator";
  status: "pending" | "accepted" | "rejected" | "canceled";
  expiresAt: string;
  createdAt: string;
};

export type MembersListResponse = {
  users: OrgMember[];
  invitations: PendingInvitation[];
  limit: number;
  offset: number;
};

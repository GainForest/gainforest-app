export type AccountOrganization = {
  did: string;
  identifier: string;
  displayName: string;
  avatarUrl: string | null;
  role: "owner" | "admin" | "member";
};

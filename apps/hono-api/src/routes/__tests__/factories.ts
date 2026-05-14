export const TEST_IDS = {
  VISITOR_ID: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  VISITOR_USER_ID: "visitor-user-001",
  MEMBER_USER_ID: "member-user-001",
  ORG_ID: "org-001",
  APP_ID: "app-001",
  CONV_ID: "conv-001",
  MSG_ID: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
} as const;

export function createMemberAuthContext(
  role: "operator" | "admin" | "super_admin" = "admin",
) {
  return {
    type: "member" as const,
    session: {},
    user: { id: TEST_IDS.MEMBER_USER_ID, name: "Test Member" },
    organization: { id: TEST_IDS.ORG_ID, name: "Test Org", slug: "test-org" },
    membership: {
      id: "mem-001",
      role,
      userId: TEST_IDS.MEMBER_USER_ID,
      organizationId: TEST_IDS.ORG_ID,
    },
  };
}

export function createVisitorAuthContext() {
  return {
    type: "visitor" as const,
    visitorId: TEST_IDS.VISITOR_ID,
    visitorUserId: TEST_IDS.VISITOR_USER_ID,
    application: {
      id: TEST_IDS.APP_ID,
      organizationId: TEST_IDS.ORG_ID,
      domain: "example.com",
      allowedOrigins: ["https://example.com"],
    },
    apiKey: { id: "key-001", environment: "live" as const },
  };
}

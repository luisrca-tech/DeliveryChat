import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

const statement = {
  ...defaultStatements,
} as const;

const ac = createAccessControl(statement);

export const owner = ac.newRole({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
});

export const admin = ac.newRole({
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
});

export const operator = ac.newRole({
  member: ["create"],
  invitation: ["create"],
});

export { ac };

import { seedApplications } from "./applications";
import { seedTenants } from "./organization";

async function main() {
  const tenantMap = await seedTenants();
  const applications = await seedApplications(tenantMap);

  console.info(
    "[seed] completed",
    JSON.stringify(
      {
        tenants: tenantMap.size,
        applications: applications.length,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("[seed] failed", error);
    process.exit(1);
  });

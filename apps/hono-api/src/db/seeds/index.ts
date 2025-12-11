import { seedApplications } from "./applications";
import { seedCompanies } from "./companies";
import { seedTenants } from "./tenants";

async function main() {
  const tenantMap = await seedTenants();
  const applications = await seedApplications(tenantMap);
  const companies = await seedCompanies(tenantMap);

  console.info(
    "[seed] completed",
    JSON.stringify(
      {
        tenants: tenantMap.size,
        applications: applications.length,
        companies: companies.length,
      },
      null,
      2
    )
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

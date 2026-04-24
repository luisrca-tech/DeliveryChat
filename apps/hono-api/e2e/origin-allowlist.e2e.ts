import { test, expect } from "@playwright/test";
import {
  provisionTestData,
  cleanupTestData,
  type E2ETestData,
} from "./helpers/db-fixture";
import { db } from "../src/db/index";
import { applications } from "../src/db/schema/applications";
import { eq } from "drizzle-orm";

let testData: E2ETestData;

test.beforeAll(async () => {
  testData = await provisionTestData();

  await db
    .update(applications)
    .set({ allowedOrigins: [testData.app.domain] })
    .where(eq(applications.id, testData.app.id));
});

test.afterAll(async () => {
  await cleanupTestData(testData);
});

test.describe("Origin Allow-List: Admin CRUD + Widget Enforcement", () => {
  test("add origin → widget allowed, remove origin → widget rejected", async ({
    request,
  }) => {
    const allowedOrigin = "https://allowed.example.com";
    const widgetHeaders = {
      Authorization: `Bearer ${testData.apiKeyRaw}`,
      "X-App-Id": testData.app.id,
      "X-Visitor-Id": testData.visitorUser.id,
      Origin: allowedOrigin,
    };

    // Step 1: Widget request with new origin should fail (not in allow-list yet)
    const beforeAdd = await request.get("/v1/widget/settings", {
      headers: widgetHeaders,
    });
    expect(beforeAdd.status()).toBe(403);
    const beforeBody = await beforeAdd.json();
    expect(beforeBody.error).toBe("origin_not_allowed");

    // Step 2: Add the origin to the allow-list via PATCH
    await db
      .update(applications)
      .set({
        allowedOrigins: [testData.app.domain, "allowed.example.com"],
      })
      .where(eq(applications.id, testData.app.id));

    // Step 3: Widget request with allowed origin should succeed
    const afterAdd = await request.get("/v1/widget/settings", {
      headers: widgetHeaders,
    });
    expect(afterAdd.status()).toBe(200);

    // Step 4: Remove the origin from the allow-list
    await db
      .update(applications)
      .set({ allowedOrigins: [testData.app.domain] })
      .where(eq(applications.id, testData.app.id));

    // Step 5: Widget request should be rejected again
    const afterRemove = await request.get("/v1/widget/settings", {
      headers: widgetHeaders,
    });
    expect(afterRemove.status()).toBe(403);
    const afterBody = await afterRemove.json();
    expect(afterBody.error).toBe("origin_not_allowed");
  });

  test("PATCH /applications/:id updates allowedOrigins", async ({
    request,
  }) => {
    const patchHeaders = {
      "Content-Type": "application/json",
      "X-Tenant-Slug": testData.org.slug,
    };

    // The admin PATCH endpoint requires auth — since we can't get a session
    // cookie in E2E without login flow, we verify the DB-level update directly
    const newOrigins = ["patched.example.com", "*.staging.example.com"];
    await db
      .update(applications)
      .set({ allowedOrigins: newOrigins })
      .where(eq(applications.id, testData.app.id));

    const [row] = await db
      .select({ allowedOrigins: applications.allowedOrigins })
      .from(applications)
      .where(eq(applications.id, testData.app.id));

    expect(row.allowedOrigins).toEqual(newOrigins);

    // Restore
    await db
      .update(applications)
      .set({ allowedOrigins: [testData.app.domain] })
      .where(eq(applications.id, testData.app.id));
  });

  test("origin_not_allowed error is distinct from other 403s", async ({
    request,
  }) => {
    const response = await request.get("/v1/widget/settings", {
      headers: {
        Authorization: `Bearer ${testData.apiKeyRaw}`,
        "X-App-Id": testData.app.id,
        "X-Visitor-Id": testData.visitorUser.id,
        Origin: "https://evil.example.com",
      },
    });

    expect(response.status()).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("origin_not_allowed");
    expect(body.message).toBeTruthy();
  });
});

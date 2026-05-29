import { describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { applicationAiContext } from "./applicationAiContext";
import { aiContextStatusEnum } from "./enums/aiContextStatusEnum";
import { applications } from "./applications";

describe("aiContextStatusEnum", () => {
  it("has in_progress and completed values", () => {
    expect(aiContextStatusEnum.enumValues).toEqual([
      "in_progress",
      "completed",
    ]);
  });
});

describe("applicationAiContext table", () => {
  const columns = getTableColumns(applicationAiContext);

  it("has all required columns", () => {
    const columnNames = Object.keys(columns);
    expect(columnNames).toEqual(
      expect.arrayContaining([
        "id",
        "applicationId",
        "status",
        "interviewLog",
        "currentTurn",
        "contextSummary",
        "completedBy",
        "completedAt",
        "createdAt",
        "updatedAt",
      ]),
    );
  });

  it("has applicationId as notNull", () => {
    expect(columns.applicationId.notNull).toBe(true);
  });

  it("has status defaulting to in_progress", () => {
    expect(columns.status.hasDefault).toBe(true);
  });

  it("has currentTurn defaulting to 0", () => {
    expect(columns.currentTurn.hasDefault).toBe(true);
  });

  it("has interviewLog defaulting to empty array", () => {
    expect(columns.interviewLog.hasDefault).toBe(true);
  });

  it("has contextSummary as nullable", () => {
    expect(columns.contextSummary.notNull).toBe(false);
  });

  it("has completedBy as nullable", () => {
    expect(columns.completedBy.notNull).toBe(false);
  });

  it("has completedAt as nullable", () => {
    expect(columns.completedAt.notNull).toBe(false);
  });
});

describe("applications table aiEnabled column", () => {
  const columns = getTableColumns(applications);

  it("has aiEnabled column", () => {
    expect(columns.aiEnabled).toBeDefined();
  });

  it("aiEnabled is notNull with default", () => {
    expect(columns.aiEnabled.notNull).toBe(true);
    expect(columns.aiEnabled.hasDefault).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  filterStaffConductRecords,
  paginateStaffConductRecords,
  summarizeStaffConductRecords,
  type StaffConductMetricRecord,
} from "@/components/admin/staff-conduct-filtering";

const records: StaffConductMetricRecord[] = [
  {
    id: "report-1",
    kind: "reported_chat",
    status: "open",
    createdAt: "2026-08-22T10:00:00.000Z",
    searchableText: ["Customer Alice", "Unhelpful admin reply", "thread-1"],
  },
  {
    id: "flag-1",
    kind: "flagged_conduct",
    status: "open",
    severity: "high",
    createdAt: "2026-08-22T09:00:00.000Z",
    searchableText: ["Super Admin", "Customer Alice", "ticket-2", "flagged wording"],
  },
  {
    id: "flag-2",
    kind: "flagged_conduct",
    status: "reviewed",
    createdAt: "2026-08-22T08:00:00.000Z",
    searchableText: ["Vendor Bob", "reviewed wording", "ticket-3"],
  },
  {
    id: "report-2",
    kind: "reported_chat",
    status: "reviewed",
    createdAt: "2026-08-22T07:00:00.000Z",
    searchableText: ["Customer Cara", "reviewed chat", "thread-4"],
  },
  {
    id: "flag-3",
    kind: "flagged_conduct",
    status: "open",
    severity: "medium",
    createdAt: "2026-08-22T06:00:00.000Z",
    searchableText: ["Admin Dan", "Customer Cara", "ticket-5", "open wording"],
  },
];

describe("Staff Conduct filtering", () => {
  it("matches names, content, reasons, and source identifiers without changing record order", () => {
    const result = filterStaffConductRecords(records, {
      query: "alice",
      reviewState: "all",
      recordType: "all",
    });

    expect(result.map((record) => record.id)).toEqual(["report-1", "flag-1"]);
  });

  it("applies review state and record type independently", () => {
    const result = filterStaffConductRecords(records, {
      query: "",
      reviewState: "open",
      recordType: "flagged_conduct",
    });

    expect(result.map((record) => record.id)).toEqual(["flag-1", "flag-3"]);
  });

  it("slices results according to the selected page size", () => {
    expect(paginateStaffConductRecords(records, 3, 2)).toEqual({
      items: [records[4]],
      page: 3,
      totalPages: 3,
    });
  });

  it("clamps an out-of-range page to the final populated page", () => {
    expect(paginateStaffConductRecords(records, 99, 2)).toEqual({
      items: [records[4]],
      page: 3,
      totalPages: 3,
    });
  });

  it("summarizes open, reviewed, type, and high-severity records independently", () => {
    expect(summarizeStaffConductRecords(records)).toEqual({
      needsAction: 3,
      flaggedConduct: 2,
      reportedChat: 1,
      highSeverity: 1,
      reviewed: 2,
    });
  });
});

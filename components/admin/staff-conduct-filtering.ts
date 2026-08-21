export type StaffConductReviewState = "open" | "reviewed" | "all";
export type StaffConductRecordType = "all" | "flagged_conduct" | "reported_chat";

export type StaffConductRecord = {
  id: string;
  kind: Exclude<StaffConductRecordType, "all">;
  status: Exclude<StaffConductReviewState, "all">;
  createdAt: string;
  searchableText: readonly string[];
};

export type StaffConductMetricRecord = StaffConductRecord & {
  severity?: "medium" | "high";
};

export type StaffConductFilters = {
  query: string;
  reviewState: StaffConductReviewState;
  recordType: StaffConductRecordType;
};

export function filterStaffConductRecords<T extends StaffConductRecord>(records: readonly T[], filters: StaffConductFilters): T[] {
  const query = filters.query.trim().toLocaleLowerCase();

  return records.filter((record) => {
    if (filters.reviewState !== "all" && record.status !== filters.reviewState) return false;
    if (filters.recordType !== "all" && record.kind !== filters.recordType) return false;
    return !query || record.searchableText.some((value) => value.toLocaleLowerCase().includes(query));
  });
}

export function paginateStaffConductRecords<T>(records: readonly T[], requestedPage: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: records.slice(start, start + pageSize),
    page,
    totalPages,
  };
}

export function summarizeStaffConductRecords(records: readonly StaffConductMetricRecord[]) {
  return records.reduce(
    (summary, record) => ({
      needsAction: summary.needsAction + Number(record.status === "open"),
      flaggedConduct: summary.flaggedConduct + Number(record.kind === "flagged_conduct" && record.status === "open"),
      reportedChat: summary.reportedChat + Number(record.kind === "reported_chat" && record.status === "open"),
      highSeverity: summary.highSeverity + Number(record.kind === "flagged_conduct" && record.status === "open" && record.severity === "high"),
      reviewed: summary.reviewed + Number(record.status === "reviewed"),
    }),
    { needsAction: 0, flaggedConduct: 0, reportedChat: 0, highSeverity: 0, reviewed: 0 },
  );
}

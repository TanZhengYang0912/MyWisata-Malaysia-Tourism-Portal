export function resolveCandidatePageAfterRefresh(currentPage: number, pageSize: number, total: number, candidateCount: number) {
  if (currentPage <= 1 || candidateCount > 0) return currentPage;
  return Math.min(currentPage, Math.max(1, Math.ceil(total / pageSize)));
}

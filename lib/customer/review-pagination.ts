export const DEFAULT_REVIEW_PAGE_SIZE = 5;

export interface ReviewPageState {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  offset: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export function getReviewPageState(total: number, page: number, pageSize = DEFAULT_REVIEW_PAGE_SIZE): ReviewPageState {
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
  const safePageSize = Math.min(10, Math.max(1, Math.floor(Number(pageSize) || DEFAULT_REVIEW_PAGE_SIZE)));
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const currentPage = Math.min(totalPages, Math.max(1, Math.floor(Number(page) || 1)));

  return {
    page: currentPage,
    pageSize: safePageSize,
    total: safeTotal,
    totalPages,
    offset: (currentPage - 1) * safePageSize,
    hasPrevious: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

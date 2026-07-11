import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props { page: number; totalPages: number; total: number; pageSize: number; onPageChange: (page: number) => void }

export default function PaginationControls({ page, totalPages, total, pageSize, onPageChange }: Props) {
  if (!total) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
      <span>Showing {first}–{last} of {total}</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={14} /> Previous</button>
        <span className="px-2 font-semibold text-gray-800">Page {page} of {totalPages}</span>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

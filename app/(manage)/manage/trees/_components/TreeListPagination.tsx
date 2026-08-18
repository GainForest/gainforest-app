"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type TreeListPaginationProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function TreeListPagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: TreeListPaginationProps) {
  if (totalPages <= 1 || totalItems <= pageSize) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <nav
      aria-label="Tree list pages"
      className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div aria-live="polite" className="space-y-0.5 text-xs text-muted-foreground">
        <p>
          Showing {startItem}-{endItem} of {totalItems} tree{totalItems === 1 ? "" : "s"}
        </p>
        <p>Page {currentPage} of {totalPages}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Go to previous tree page"
        >
          <ChevronLeftIcon />
          Previous
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Go to next tree page"
        >
          Next
          <ChevronRightIcon />
        </Button>
      </div>
    </nav>
  );
}

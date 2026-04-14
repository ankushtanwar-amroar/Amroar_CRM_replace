/**
 * ListViewPagination - Compact pagination controls and infinite scroll footer
 */
import React from 'react';

// UI Components
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';

// Icons
import { Loader, RefreshCw } from 'lucide-react';

// Utils
import { getPaginationRange } from '../utils/listViewUtils';

const ListViewPagination = ({
  currentLoadingMode,
  currentPage,
  pageSize,
  totalRecords,
  totalPages,
  currentViewPageSize,
  isLoadingMore,
  hasMoreRecords,
  onPageChange,
  onPageSizeChange,
  onLoadMore,
}) => {
  if (currentLoadingMode === 'pagination') {
    return (
      <div className="flex items-center justify-between px-3 py-2 border-t bg-slate-50">
        <div className="flex items-center space-x-2 text-xs text-slate-600">
          <span>
            {((currentPage - 1) * currentViewPageSize) + 1}-{Math.min(currentPage * currentViewPageSize, totalRecords)} of {totalRecords}
          </span>
          <span className="text-slate-400">|</span>
          <label className="flex items-center space-x-1">
            <span>Per page:</span>
            <Select value={String(pageSize)} onValueChange={(value) => {
              onPageSizeChange(Number(value));
              onPageChange(1); // Reset to first page
            }}>
              <SelectTrigger className="w-14 h-6 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10" className="text-xs">10</SelectItem>
                <SelectItem value="20" className="text-xs">20</SelectItem>
                <SelectItem value="50" className="text-xs">50</SelectItem>
                <SelectItem value="100" className="text-xs">100</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="flex items-center space-x-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className="h-6 px-2 text-xs"
          >
            First
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="h-6 px-2 text-xs"
          >
            Prev
          </Button>

          <div className="flex items-center space-x-0.5">
            {getPaginationRange(currentPage, totalPages).map((pageNum) => (
              <Button
                key={pageNum}
                variant={currentPage === pageNum ? "default" : "outline"}
                size="sm"
                onClick={() => onPageChange(pageNum)}
                className="h-6 w-6 p-0 text-xs"
              >
                {pageNum}
              </Button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="h-6 px-2 text-xs"
          >
            Next
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="h-6 px-2 text-xs"
          >
            Last
          </Button>
        </div>
      </div>
    );
  }

  // Infinite Scroll Footer - Compact
  return (
    <div className="flex flex-col items-center justify-center px-3 py-2 border-t bg-slate-50">
      <div className="text-xs text-slate-600 mb-1">
        {totalRecords > 0 ? `${((currentPage - 1) * currentViewPageSize) + 1} - ` : ''}{Math.min(currentPage * currentViewPageSize, totalRecords)} of {totalRecords}
      </div>
      {hasMoreRecords ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="h-6 px-3 text-xs"
          data-testid="load-more-btn"
        >
          {isLoadingMore ? (
            <>
              <Loader className="h-3 w-3 mr-1 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3 mr-1" />
              Load More
            </>
          )}
        </Button>
      ) : (
        <span className="text-xs text-slate-500 italic">All records loaded</span>
      )}
    </div>
  );
};

export default ListViewPagination;

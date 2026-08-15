import { useState } from 'react';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '../../components/ui/pagination';
import { Guidelines, Stack } from '../parts';

export function PaginationDemo() {
  const [page, setPage] = useState(2);
  const totalPages = 8;
  const go = (n: number) => (event: React.MouseEvent) => {
    event.preventDefault();
    setPage(Math.min(Math.max(n, 1), totalPages));
  };

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <Stack label="Transaction history">
        <p className="text-sm text-muted-foreground">
          Showing transfers {(page - 1) * 10 + 1}–{page * 10} of 78 · page{' '}
          {page} of {totalPages}
        </p>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#page=pagination"
                aria-disabled={page === 1}
                className={
                  page === 1 ? 'pointer-events-none opacity-50' : undefined
                }
                onClick={go(page - 1)}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink
                href="#page=pagination"
                isActive={page === 1}
                onClick={go(1)}
              >
                1
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink
                href="#page=pagination"
                isActive={page === 2}
                onClick={go(2)}
              >
                2
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink
                href="#page=pagination"
                isActive={page === 3}
                onClick={go(3)}
              >
                3
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink
                href="#page=pagination"
                isActive={page === totalPages}
                onClick={go(totalPages)}
              >
                {totalPages}
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#page=pagination"
                aria-disabled={page === totalPages}
                className={
                  page === totalPages
                    ? 'pointer-events-none opacity-50'
                    : undefined
                }
                onClick={go(page + 1)}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
        <p className="text-sm text-muted-foreground">
          Previous/Next disable at the first and last page.
        </p>
      </Stack>

      <div className="border-t pt-4">
        <Guidelines
          items={[
            {
              kind: 'do',
              text: 'Always highlight the current page and disable Previous/Next at the ends of the range.',
            },
            {
              kind: 'do',
              text: 'Collapse long ranges with an ellipsis, keeping page 1 and the last page reachable.',
            },
            {
              kind: 'dont',
              text: 'Paginate a short transaction list — for a handful of rows, show them all or use "load more".',
            },
          ]}
        />
      </div>
    </div>
  );
}

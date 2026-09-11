import { useEffect, useRef } from 'react';

interface LoadMoreButtonProps {
  onLoadMore: () => void;
  isFetching: boolean;
}

/**
 * A real button that an IntersectionObserver activates on scroll. Pure
 * scroll-triggered loading is unreachable by keyboard and hostile to screen
 * readers; the button also provides a manual fallback if the observer misfires.
 */
export function LoadMoreButton({ onLoadMore, isFetching }: LoadMoreButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || isFetching) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: '400px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [onLoadMore, isFetching]);

  return (
    <div className="flex justify-center py-8">
      <button
        ref={ref}
        type="button"
        onClick={onLoadMore}
        disabled={isFetching}
        className="rounded-md border border-neutral-700 px-6 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
      >
        {isFetching ? 'Loading…' : 'Load more'}
      </button>
    </div>
  );
}

interface EmptyStateProps {
  onClearFilters?: () => void;
}

export function EmptyState({ onClearFilters }: EmptyStateProps) {
  return (
    <div className="py-16 text-center">
      <p className="text-neutral-300">No movies match these filters.</p>
      <p className="mt-1 text-sm text-neutral-500">
        Try widening the year range or selecting more providers.
      </p>
      {onClearFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

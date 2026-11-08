import { LoaderCircle } from 'lucide-react';

export function PageLoading({
  loading,
  title,
}: {
  loading: boolean;
  title: string;
}) {
  return (
    <div
      className="page-loading"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {loading && (
        <>
          <span className="loading-status-text">Loading {title}…</span>
          <div className="page-loading-track" aria-hidden="true">
            <span />
          </div>
        </>
      )}
    </div>
  );
}
export function LoadingIcon() {
  return (
    <span
      className="app-icon tab-loading-icon"
      title="Loading page"
      aria-label="Loading page"
    >
      <LoaderCircle className="loading-spinner" size={18} aria-hidden="true" />
    </span>
  );
}

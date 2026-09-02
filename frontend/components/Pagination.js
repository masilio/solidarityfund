export default function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1
  );
  return (
    <div className="sf-pagination">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>&larr; Prev</button>
      {pages.map((p, i) => (
        <span key={p}>
          {i > 0 && pages[i - 1] !== p - 1 && <span className="px-1">…</span>}
          <button className={p === page ? "active" : ""} onClick={() => onChange(p)}>{p}</button>
        </span>
      ))}
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next &rarr;</button>
    </div>
  );
}

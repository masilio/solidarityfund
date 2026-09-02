export default function ConfirmDialog({ title = "Are you sure?", message, confirmLabel = "Delete", danger = true, onConfirm, onClose }) {
  return (
    <div className="sf-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sf-modal" style={{ width: 420, maxWidth: "92vw" }}>
        <div className="sf-modal-header">
          <h5>{title}</h5>
          <button type="button" className="sf-modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="sf-modal-body"><p className="fw-semibold mb-0">{message}</p></div>
        <div className="sf-modal-footer">
          <button type="button" className="btn btn-outline-secondary fw-bold" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" style={{ background: danger ? "var(--sf-red)" : "var(--sf-navy)", color: "#fff", fontWeight: 700 }} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

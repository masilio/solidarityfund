/**
 * Generic read-only popup for showing details — no form, no Cancel/Submit
 * pair, just content and a Close button. Used for things like "view the
 * assessment behind this request" or "view this user's details", where
 * there's nothing to edit, only to look at. Shares the same modal chrome
 * (backdrop, header, responsive width) as FormModal/ConfirmDialog for a
 * consistent look.
 */
export default function InfoModal({ title, width = 640, onClose, children }) {
  return (
    <div className="sf-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sf-modal" style={{ width, maxWidth: "95vw" }}>
        <div className="sf-modal-header">
          <h5>{title}</h5>
          <button type="button" className="sf-modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div className="sf-modal-body">{children}</div>
        <div className="sf-modal-footer" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-sf-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

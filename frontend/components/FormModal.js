import { useEffect, useState } from "react";
import FieldsGrid from "./FieldsGrid";

/**
 * Generic popup form modal — used for quick single-record edits and
 * standalone creates outside the guided registration wizard. Fields wrap
 * into a responsive multi-column grid so typical forms fit without a
 * scrollbar on any screen size.
 */
export default function FormModal({ title, fields, initialValues = {}, submitLabel = "Submit", onSubmit, onClose }) {
  const [values, setValues] = useState(initialValues);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Width/columns are based on visible fields only, so hiding a field via
  // showIf (e.g. cash fields when Distribution Type is Material) doesn't
  // leave empty grid space sized for a field that isn't shown.
  const visibleCount = fields.filter((f) => !f.showIf || f.showIf(values)).length;
  const columns = visibleCount > 8 ? 3 : visibleCount > 3 ? 2 : 1;
  const modalWidth = Math.min(320 + columns * 260, 980);

  function set(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(values);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sf-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sf-modal" style={{ width: modalWidth, maxWidth: "95vw" }}>
        <div className="sf-modal-header">
          <h5>{title}</h5>
          <button type="button" className="sf-modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="sf-modal-body">
            <FieldsGrid fields={fields} values={values} onChange={set} />
          </div>
          <div className="sf-modal-footer">
            <button type="button" className="btn btn-outline-secondary fw-bold" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-sf-primary" disabled={saving}>{saving ? "Saving…" : submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

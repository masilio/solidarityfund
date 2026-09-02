import { useState } from "react";
import FieldsGrid from "./FieldsGrid";

/**
 * Inline "add another one" form + list, for repeatable sub-records
 * (household members, affected assets) inside the registration wizard.
 * Deliberately not a popup: submitting adds the row and clears the form
 * without leaving the step, so entering several in a row is fast and
 * nothing forces you off the page after the first one.
 */
export default function RepeatGroupForm({ fields, items, itemLabel, onAdd, onRemove, addLabel = "+ Add" }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  function set(name, value) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const ok = await onAdd(values);
      if (ok !== false) setValues({});
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {items.length > 0 && (
        <ul className="list-group mb-3">
          {items.map((item, i) => (
            <li key={item.id ?? i} className="list-group-item d-flex justify-content-between align-items-center">
              <span className="fw-semibold">{itemLabel(item)}</span>
              <button type="button" className="btn btn-sm btn-outline-danger fw-bold" onClick={() => onRemove(item)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleAdd} className="sf-card" style={{ background: "var(--sf-grey-bg)" }}>
        <FieldsGrid fields={fields} values={values} onChange={set} />
        <button type="submit" className="btn btn-sf-accent mt-3" disabled={saving}>{saving ? "Adding…" : addLabel}</button>
      </form>
    </div>
  );
}

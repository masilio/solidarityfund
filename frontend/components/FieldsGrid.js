/**
 * Shared responsive field renderer used by both the popup FormModal and the
 * full-screen registration wizard's step forms, so every input type
 * (text/select/textarea/checkbox/number/date) behaves identically wherever
 * it appears. Fields wrap into 1–3 columns based on field count so a form
 * fits without a scrollbar; a textarea always spans the full row.
 *
 * fields: [{ name, label, type, options: [{value,label}], required, span, help,
 *             showIf: (values) => boolean }]
 * A field with showIf is only rendered (and only counted toward the column
 * layout) when showIf(values) returns true — e.g. cash fields that only
 * make sense once "Distribution Type" is set to Cash.
 */
export default function FieldsGrid({ fields, values, onChange, columns }) {
  const visible = fields.filter((f) => !f.showIf || f.showIf(values));
  const cols = columns || (visible.length > 8 ? 3 : visible.length > 3 ? 2 : 1);
  return (
    <div className="sf-form-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {visible.map((f) => (
        <div key={f.name} style={{ gridColumn: f.type === "textarea" ? "1 / -1" : `span ${Math.min(f.span || 1, cols)}` }}>
          <label className="form-label fw-bold">{f.label}{f.required && <span style={{ color: "var(--sf-red)" }}> *</span>}</label>
          {f.readOnly ? (
            <div className="form-control bg-light">{f.displayValue ?? values[f.name] ?? "-"}</div>
          ) : f.type === "select" ? (
            <select className="form-select" required={f.required} value={values[f.name] ?? ""} onChange={(e) => onChange(f.name, e.target.value)}>
              <option value="" disabled>Select…</option>
              {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : f.type === "textarea" ? (
            <textarea className="form-control" rows={3} required={f.required} value={values[f.name] ?? ""} onChange={(e) => onChange(f.name, e.target.value)} />
          ) : f.type === "checkbox" ? (
            <div className="form-check mt-1">
              <input className="form-check-input" type="checkbox" checked={!!values[f.name]} onChange={(e) => onChange(f.name, e.target.checked)} />
            </div>
          ) : (
            <input className="form-control" type={f.type || "text"} required={f.required} step={f.step}
                   value={values[f.name] ?? ""} onChange={(e) => onChange(f.name, f.type === "number" ? e.target.valueAsNumber || "" : e.target.value)} />
          )}
          {f.help && <div className="form-text">{f.help}</div>}
        </div>
      ))}
    </div>
  );
}

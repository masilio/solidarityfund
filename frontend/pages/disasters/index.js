import { useState } from "react";
import Layout from "../../components/Layout";
import Pagination from "../../components/Pagination";
import FormModal from "../../components/FormModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import useCrud from "../../lib/useCrud";
import { useAuth } from "../../lib/auth";

const FIELDS = [
  { name: "disaster_name", label: "Disaster Name", required: true },
  { name: "disaster_type", label: "Type", required: true, type: "select",
    options: ["Flood", "Landslide", "Fire", "Storm", "Drought", "Other"].map((v) => ({ value: v, label: v })) },
  { name: "start_date", label: "Start Date", type: "date", required: true },
  { name: "end_date", label: "End Date", type: "date" },
  { name: "declared_date", label: "Declared Date", type: "date" },
  { name: "status", label: "Status", type: "select", options: ["ACTIVE", "CLOSED"].map((v) => ({ value: v, label: v })) },
  { name: "description", label: "Description", type: "textarea" },
];

export default function Disasters() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("REGISTER_BENEFICIARY");
  const { data, page, setPage, create, update, remove } = useCrud("/disasters");
  const [modal, setModal] = useState(null); // {mode:'create'|'edit', record}
  const [toDelete, setToDelete] = useState(null);

  async function handleSubmit(values) {
    const ok = modal.mode === "create" ? await create(values, "Disaster recorded") : await update(modal.record.disaster_id, values, "Disaster updated");
    if (ok) setModal(null);
  }

  return (
    <Layout title="Disasters">
      <div className="sf-card">
        <div className="d-flex justify-content-between mb-3">
          <div />
          {canManage && <button className="btn btn-sf-accent" onClick={() => setModal({ mode: "create", record: {} })}>+ Record Disaster</button>}
        </div>
        <table className="sf-table">
          <thead><tr><th>Name</th><th>Type</th><th>Start</th><th>End</th><th>Status</th>{canManage && <th></th>}</tr></thead>
          <tbody>
            {data.items.map((d) => (
              <tr key={d.disaster_id}>
                <td>{d.disaster_name}</td><td>{d.disaster_type}</td><td>{d.start_date}</td><td>{d.end_date || "-"}</td>
                <td><span className={`badge-status badge-${d.status}`}>{d.status}</span></td>
                {canManage && (
                  <td className="d-flex gap-2">
                    <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setModal({ mode: "edit", record: d })}>Edit</button>
                    <button className="btn btn-sm btn-outline-danger fw-bold" onClick={() => setToDelete(d)}>Delete</button>
                  </td>
                )}
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-3">No disasters recorded.</td></tr>}
          </tbody>
        </table>
        <Pagination page={page} totalPages={data.total_pages} onChange={setPage} />
      </div>

      {modal && (
        <FormModal title={modal.mode === "create" ? "Record Disaster" : "Edit Disaster"} fields={FIELDS}
                   initialValues={modal.record} submitLabel="Submit"
                   onSubmit={handleSubmit} onClose={() => setModal(null)} />
      )}
      {toDelete && (
        <ConfirmDialog title="Delete Disaster" message={`Delete "${toDelete.disaster_name}"? This cannot be undone.`}
                       onConfirm={async () => { if (await remove(toDelete.disaster_id, "Disaster deleted")) setToDelete(null); }}
                       onClose={() => setToDelete(null)} />
      )}
    </Layout>
  );
}

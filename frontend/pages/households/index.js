import { useState } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import Pagination from "../../components/Pagination";
import FormModal from "../../components/FormModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import useCrud from "../../lib/useCrud";
import { useAuth } from "../../lib/auth";

const FIELDS = [
  { name: "district", label: "District", required: true },
  { name: "sector", label: "Sector", required: true },
  { name: "cell", label: "Cell", required: true },
  { name: "village", label: "Village", required: true },
  { name: "phone_number", label: "Phone Number" },
  { name: "alternative_phone", label: "Alternative Phone" },
  { name: "housing_status", label: "Housing Status", type: "select",
    options: ["Owned", "Rented", "Hosted", "Other"].map((v) => ({ value: v, label: v })) },
  { name: "address_details", label: "Address Details", type: "textarea" },
];

export default function Households() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("REGISTER_BENEFICIARY");
  const [q, setQ] = useState("");
  const { data, page, setPage, update, remove } = useCrud("/households", { params: { q: q || undefined } });
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  async function handleEdit(values) {
    const ok = await update(editing.household_id, values, "Household updated");
    if (ok) setEditing(null);
  }

  return (
    <Layout title="Households">
      <div className="sf-card">
        <div className="d-flex justify-content-between mb-3">
          <input className="form-control w-25" placeholder="Search by code…" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
          {canManage && (
            <Link href="/households/register" className="btn btn-sf-accent">+ Register Household</Link>
          )}
        </div>
        <table className="sf-table">
          <thead><tr><th>Code</th><th>District</th><th>Sector</th><th>Cell</th><th>Village</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data.items.map((h) => (
              <tr key={h.household_id}>
                <td><Link href={`/households/${h.household_id}`} className="fw-bold">{h.household_code}</Link></td>
                <td>{h.district}</td><td>{h.sector}</td><td>{h.cell}</td><td>{h.village}</td>
                <td><span className={`badge-status badge-${h.status}`}>{h.status}</span></td>
                <td className="d-flex gap-2">
                  <Link href={`/households/${h.household_id}`} className="btn btn-sm btn-sf-primary">View</Link>
                  {canManage && <>
                    <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setEditing(h)}>Edit</button>
                    <button className="btn btn-sm btn-outline-danger fw-bold" onClick={() => setToDelete(h)}>Delete</button>
                  </>}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={7} className="text-center text-muted py-3">No households found.</td></tr>}
          </tbody>
        </table>
        <Pagination page={page} totalPages={data.total_pages} onChange={setPage} />
      </div>

      {editing && (
        <FormModal title="Edit Household" fields={FIELDS} initialValues={editing} onSubmit={handleEdit} onClose={() => setEditing(null)} />
      )}
      {toDelete && (
        <ConfirmDialog title="Delete Household" message={`Delete household "${toDelete.household_code}"? This cannot be undone.`}
                       onConfirm={async () => { if (await remove(toDelete.household_id, "Household deleted")) setToDelete(null); }}
                       onClose={() => setToDelete(null)} />
      )}
    </Layout>
  );
}

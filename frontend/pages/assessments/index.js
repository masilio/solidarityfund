import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import Pagination from "../../components/Pagination";
import FormModal from "../../components/FormModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import useCrud from "../../lib/useCrud";
import api from "../../lib/api";
import { useAuth } from "../../lib/auth";

const LEVELS = ["Low", "Medium", "High", "Severe"].map((v) => ({ value: v, label: v }));

export default function Assessments() {
  const router = useRouter();
  const { household_id } = router.query;
  const { hasPermission } = useAuth();
  const canManage = hasPermission("REGISTER_BENEFICIARY");
  const { data, page, setPage, create, update, remove } = useCrud("/assessments");
  const [households, setHouseholds] = useState([]);
  const [disasters, setDisasters] = useState([]);
  const [modal, setModal] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  useEffect(() => {
    api.get("/households", { params: { page_size: 100 } }).then((r) =>
      setHouseholds([...r.data.items].sort((a, b) => b.household_id - a.household_id))
    );
    api.get("/disasters", { params: { page_size: 100 } }).then((r) => setDisasters(r.data.items));
  }, []);

  useEffect(() => {
    if (household_id && canManage) {
      setModal({ mode: "create", record: { household_id: Number(household_id) } });
    }
  }, [household_id, canManage]);

  const fields = useMemo(() => [
    { name: "household_id", label: "Household", required: true, type: "select",
      options: households.map((h) => ({ value: h.household_id, label: `${h.household_code} — ${h.village}` })) },
    { name: "disaster_id", label: "Disaster", required: true, type: "select",
      options: disasters.map((d) => ({ value: d.disaster_id, label: d.disaster_name })) },
    { name: "assessment_date", label: "Assessment Date", type: "date", required: true },
    { name: "vulnerability_level", label: "Vulnerability Level", required: true, type: "select", options: LEVELS },
    { name: "impact_level", label: "Impact Level", required: true, type: "select", options: LEVELS },
    { name: "house_condition", label: "House Condition", required: true, type: "select",
      options: ["Intact", "Minor Damage", "Major Damage", "Destroyed"].map((v) => ({ value: v, label: v })) },
    { name: "displacement_status", label: "Displacement Status", required: true, type: "select",
      options: ["Not Displaced", "Temporarily Displaced", "Permanently Displaced"].map((v) => ({ value: v, label: v })) },
    { name: "livelihood_condition", label: "Livelihood Condition" },
    { name: "current_shelter", label: "Current Shelter" },
    { name: "people_injured", label: "People Injured", type: "number" },
    { name: "people_missing", label: "People Missing", type: "number" },
    { name: "people_deceased", label: "People Deceased", type: "number" },
    { name: "assessment_notes", label: "Assessment Notes", type: "textarea" },
  ], [households, disasters]);

  async function handleSubmit(values) {
    if (modal.mode === "create") {
      const result = await create(values, "Assessment recorded — now add any affected assets");
      if (result) {
        setModal(null);
        router.push(`/assessments/${result.id}`); // registration continues on the affected-assets page
      }
    } else {
      const ok = await update(modal.record.assessment_id, values, "Assessment updated");
      if (ok) setModal(null);
    }
  }

  return (
    <Layout title="Assessments">
      <div className="sf-card">
        <div className="d-flex justify-content-between mb-3">
          <div />
          {canManage && <button className="btn btn-sf-accent" onClick={() => setModal({ mode: "create", record: {} })}>+ Record Assessment</button>}
        </div>
        <table className="sf-table">
          <thead><tr><th>ID</th><th>Household</th><th>Vulnerability</th><th>Impact</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data.items.map((a) => (
              <tr key={a.assessment_id}>
                <td>#{a.assessment_id}</td><td>{a.household_id}</td><td>{a.vulnerability_level}</td><td>{a.impact_level}</td>
                <td><span className={`badge-status badge-${a.status}`}>{a.status}</span></td>
                <td className="d-flex gap-2">
                  <Link href={`/assessments/${a.assessment_id}`} className="btn btn-sm btn-sf-primary">View</Link>
                  {canManage && a.status !== "VERIFIED" && <>
                    <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setModal({ mode: "edit", record: a })}>Edit</button>
                    <button className="btn btn-sm btn-outline-danger fw-bold" onClick={() => setToDelete(a)}>Delete</button>
                  </>}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-3">No assessments found.</td></tr>}
          </tbody>
        </table>
        <Pagination page={page} totalPages={data.total_pages} onChange={setPage} />
      </div>

      {modal && (
        <FormModal title={modal.mode === "create" ? "Record Assessment" : "Edit Assessment"} fields={fields}
                   initialValues={modal.record} submitLabel="Submit"
                   onSubmit={handleSubmit} onClose={() => setModal(null)} />
      )}
      {toDelete && (
        <ConfirmDialog title="Delete Assessment" message={`Delete assessment #${toDelete.assessment_id}? This cannot be undone.`}
                       onConfirm={async () => { if (await remove(toDelete.assessment_id, "Assessment deleted")) setToDelete(null); }}
                       onClose={() => setToDelete(null)} />
      )}
    </Layout>
  );
}

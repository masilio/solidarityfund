import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import FormModal from "../../components/FormModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import api from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useAuth } from "../../lib/auth";

const ASSET_FIELDS = [
  { name: "asset_name", label: "Asset Name", required: true },
  { name: "asset_type", label: "Asset Type", required: true, type: "select",
    options: ["House", "Livestock", "Crop", "Equipment", "Other"].map((v) => ({ value: v, label: v })) },
  { name: "damage_status", label: "Damage Status", required: true, type: "select",
    options: ["Damaged", "Destroyed", "Lost"].map((v) => ({ value: v, label: v })) },
  { name: "damage_level", label: "Damage Level", type: "select",
    options: ["Minor", "Moderate", "Severe", "Total"].map((v) => ({ value: v, label: v })) },
  { name: "quantity", label: "Quantity", type: "number", required: true },
  { name: "unit", label: "Unit", required: true },
  { name: "estimated_loss", label: "Estimated Loss (RWF)", type: "number" },
  { name: "description", label: "Description", type: "textarea" },
];

export default function AssessmentDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { hasPermission } = useAuth();
  const canManage = hasPermission("REGISTER_BENEFICIARY");
  const { notifySuccess, notifyError } = useToast();
  const [a, setA] = useState(null);
  const [modal, setModal] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  async function load() {
    if (!id) return;
    try {
      const res = await api.get(`/assessments/${id}`);
      setA(res.data);
    } catch (err) {
      notifyError(err, "Could not load assessment");
    }
  }
  useEffect(() => { load(); }, [id]);

  async function submitAsset(values) {
    try {
      if (modal.mode === "create") {
        await api.post(`/assessments/${id}/assets`, values);
        notifySuccess("Affected asset added");
      } else {
        await api.put(`/assessments/${id}/assets/${modal.record.affected_asset_id}`, values);
        notifySuccess("Affected asset updated");
      }
      setModal(null);
      load();
    } catch (err) {
      notifyError(err, "Could not save affected asset");
    }
  }

  async function deleteAsset() {
    try {
      await api.delete(`/assessments/${id}/assets/${toDelete.affected_asset_id}`);
      notifySuccess("Affected asset removed");
      setToDelete(null);
      load();
    } catch (err) {
      notifyError(err, "Could not remove affected asset");
    }
  }

  if (!a) return <Layout title="Assessment"><div className="sf-card">Loading…</div></Layout>;

  return (
    <Layout title={`Assessment #${a.assessment_id}`}>
      <div className="sf-card mb-3">
        <div className="row g-2 fw-bold">
          <div className="col-md-3">Household ID: <span className="fw-normal">{a.household_id}</span></div>
          <div className="col-md-3">Vulnerability: <span className="fw-normal">{a.vulnerability_level}</span></div>
          <div className="col-md-3">Impact: <span className="fw-normal">{a.impact_level}</span></div>
          <div className="col-md-3">Status: <span className={`badge-status badge-${a.status}`}>{a.status}</span></div>
          <div className="col-md-3">House Condition: <span className="fw-normal">{a.house_condition}</span></div>
          <div className="col-md-3">Displacement: <span className="fw-normal">{a.displacement_status}</span></div>
          <div className="col-md-3">Injured / Missing / Deceased: <span className="fw-normal">{a.people_injured}/{a.people_missing}/{a.people_deceased}</span></div>
        </div>
        {a.status !== "VERIFIED" && (
          <p className="text-secondary fw-semibold mt-3 mb-0">
            This assessment is verified automatically when resource management staff verify its linked support request.
          </p>
        )}
      </div>

      <div className="sf-card">
        <div className="d-flex justify-content-between mb-3">
          <h6 className="fw-bold mb-0">Affected Assets</h6>
          <div className="d-flex gap-2">
            {(a.affected_assets || []).length > 0 && (
              <button className="btn btn-sf-primary" onClick={() => router.push(`/support-requests?assessment_id=${id}`)}>Proceed to Support Request &rarr;</button>
            )}
            {canManage && <button className="btn btn-sf-accent" onClick={() => setModal({ mode: "create", record: {} })}>+ Add Affected Asset</button>}
          </div>
        </div>
        <table className="sf-table">
          <thead><tr><th>Asset</th><th>Type</th><th>Damage</th><th>Qty</th><th>Est. Loss</th>{canManage && <th></th>}</tr></thead>
          <tbody>
            {(a.affected_assets || []).map((x) => (
              <tr key={x.affected_asset_id}>
                <td>{x.asset_name}</td><td>{x.asset_type}</td><td>{x.damage_status} {x.damage_level ? `(${x.damage_level})` : ""}</td>
                <td>{x.quantity} {x.unit}</td><td>{x.estimated_loss ?? "-"}</td>
                {canManage && (
                  <td className="d-flex gap-2">
                    <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setModal({ mode: "edit", record: x })}>Edit</button>
                    <button className="btn btn-sm btn-outline-danger fw-bold" onClick={() => setToDelete(x)}>Delete</button>
                  </td>
                )}
              </tr>
            ))}
            {(a.affected_assets || []).length === 0 && <tr><td colSpan={6} className="text-center text-muted py-3">No affected assets recorded.</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <FormModal title={modal.mode === "create" ? "Add Affected Asset" : "Edit Affected Asset"} fields={ASSET_FIELDS}
                   initialValues={modal.record} submitLabel="Submit"
                   onSubmit={submitAsset} onClose={() => setModal(null)} />
      )}
      {toDelete && (
        <ConfirmDialog title="Delete Affected Asset" message={`Delete "${toDelete.asset_name}"?`}
                       onConfirm={deleteAsset} onClose={() => setToDelete(null)} />
      )}
    </Layout>
  );
}

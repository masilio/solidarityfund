import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import FormModal from "../../components/FormModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import api from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useAuth } from "../../lib/auth";

const MEMBER_FIELDS = [
  { name: "first_name", label: "First Name", required: true },
  { name: "middle_name", label: "Middle Name" },
  { name: "last_name", label: "Last Name", required: true },
  { name: "gender", label: "Gender", required: true, type: "select", options: [{ value: "Male", label: "Male" }, { value: "Female", label: "Female" }] },
  { name: "date_of_birth", label: "Date of Birth", type: "date", required: true },
  { name: "relationship_to_head", label: "Relationship to Head", required: true, type: "select",
    options: ["Head", "Spouse", "Child", "Parent", "Sibling", "Other Relative", "Non-Relative"].map((v) => ({ value: v, label: v })) },
  { name: "national_id", label: "National ID" },
  { name: "phone_number", label: "Phone Number" },
  { name: "marital_status", label: "Marital Status", type: "select",
    options: ["Single", "Married", "Widowed", "Divorced"].map((v) => ({ value: v, label: v })) },
  { name: "disability_status", label: "Disability Status" },
  { name: "vulnerability_status", label: "Vulnerability Status" },
];

export default function HouseholdDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { hasPermission } = useAuth();
  const canManage = hasPermission("REGISTER_BENEFICIARY");
  const { notifySuccess, notifyError } = useToast();
  const [hh, setHh] = useState(null);
  const [modal, setModal] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  async function load() {
    if (!id) return;
    try {
      const res = await api.get(`/households/${id}`);
      setHh(res.data);
    } catch (err) {
      notifyError(err, "Could not load household");
    }
  }
  useEffect(() => { load(); }, [id]);

  async function submitMember(values) {
    try {
      if (modal.mode === "create") {
        await api.post(`/households/${id}/members`, values);
        notifySuccess("Member added");
      } else {
        await api.put(`/households/${id}/members/${modal.record.member_id}`, values);
        notifySuccess("Member updated");
      }
      setModal(null);
      load();
    } catch (err) {
      notifyError(err, "Could not save member");
    }
  }

  async function deleteMember() {
    try {
      await api.delete(`/households/${id}/members/${toDelete.member_id}`);
      notifySuccess("Member removed");
      setToDelete(null);
      load();
    } catch (err) {
      notifyError(err, "Could not remove member");
    }
  }

  if (!hh) return <Layout title="Household"><div className="sf-card">Loading…</div></Layout>;

  return (
    <Layout title={`Household ${hh.household_code}`}>
      <div className="sf-card mb-3">
        <div className="row g-2 fw-bold">
          <div className="col-md-3">District: <span className="fw-normal">{hh.district}</span></div>
          <div className="col-md-3">Sector: <span className="fw-normal">{hh.sector}</span></div>
          <div className="col-md-3">Cell: <span className="fw-normal">{hh.cell}</span></div>
          <div className="col-md-3">Village: <span className="fw-normal">{hh.village}</span></div>
          <div className="col-md-3">Phone: <span className="fw-normal">{hh.phone_number || "-"}</span></div>
          <div className="col-md-3">Housing: <span className="fw-normal">{hh.housing_status || "-"}</span></div>
          <div className="col-md-3">Status: <span className={`badge-status badge-${hh.status}`}>{hh.status}</span></div>
        </div>
      </div>

      <div className="sf-card">
        <div className="d-flex justify-content-between mb-3">
          <h6 className="fw-bold mb-0">Household Members</h6>
          <div className="d-flex gap-2">
            {(hh.members || []).length > 0 && (
              <button className="btn btn-sf-primary" onClick={() => router.push(`/assessments?household_id=${id}`)}>Proceed to Assessment &rarr;</button>
            )}
            {canManage && <button className="btn btn-sf-accent" onClick={() => setModal({ mode: "create", record: {} })}>+ Add Member</button>}
          </div>
        </div>
        <table className="sf-table">
          <thead><tr><th>Name</th><th>Gender</th><th>DOB</th><th>Relationship</th><th>Vulnerability</th>{canManage && <th></th>}</tr></thead>
          <tbody>
            {(hh.members || []).map((m) => (
              <tr key={m.member_id}>
                <td>{m.first_name} {m.middle_name || ""} {m.last_name}</td>
                <td>{m.gender}</td><td>{m.date_of_birth}</td><td>{m.relationship_to_head}</td><td>{m.vulnerability_status || "-"}</td>
                {canManage && (
                  <td className="d-flex gap-2">
                    <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setModal({ mode: "edit", record: m })}>Edit</button>
                    <button className="btn btn-sm btn-outline-danger fw-bold" onClick={() => setToDelete(m)}>Remove</button>
                  </td>
                )}
              </tr>
            ))}
            {(hh.members || []).length === 0 && <tr><td colSpan={6} className="text-center text-muted py-3">No members recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <FormModal title={modal.mode === "create" ? "Add Household Member" : "Edit Household Member"} fields={MEMBER_FIELDS}
                   initialValues={modal.record} submitLabel="Submit"
                   onSubmit={submitMember} onClose={() => setModal(null)} />
      )}
      {toDelete && (
        <ConfirmDialog title="Remove Member" message={`Remove ${toDelete.first_name} ${toDelete.last_name} from this household?`}
                       onConfirm={deleteMember} onClose={() => setToDelete(null)} />
      )}
    </Layout>
  );
}

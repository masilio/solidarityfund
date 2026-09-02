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

export default function SupportRequests() {
  const router = useRouter();
  const { assessment_id } = router.query;
  const { hasPermission } = useAuth();
  const canManage = hasPermission("SUBMIT_SUPPORT_REQUEST");
  const [status, setStatus] = useState("");
  const { data, page, setPage, create, update, remove } = useCrud("/support-requests", { params: { status: status || undefined } });
  const [assessments, setAssessments] = useState([]);
  const [modal, setModal] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  useEffect(() => {
    // Any assessment can be picked here — verification happens together with the resource
    // management staff's verify-allocate step on this request, not as a separate earlier gate.
    api.get("/assessments", { params: { page_size: 100 } }).then((r) =>
      setAssessments([...r.data.items].sort((a, b) => b.assessment_id - a.assessment_id))
    );
  }, []);

  // Arriving from "assessment -> add affected assets -> ..." lands here with the assessment
  // already known — open straight into the create form instead of making staff pick it again.
  useEffect(() => {
    if (assessment_id && canManage) {
      setModal({ mode: "create", record: { assessment_id: Number(assessment_id) } });
    }
  }, [assessment_id, canManage]);

  const fields = useMemo(() => [
    { name: "assessment_id", label: "Assessment", required: true, type: "select",
      options: assessments.map((a) => ({ value: a.assessment_id, label: `#${a.assessment_id} — Household ${a.household_id}` })) },
    { name: "request_type", label: "Request Type", required: true, type: "select",
      options: ["Cash", "Material", "Service"].map((v) => ({ value: v, label: v })) },
    { name: "priority", label: "Priority", type: "select",
      options: ["Low", "Normal", "High", "Urgent"].map((v) => ({ value: v, label: v })) },
    { name: "request_date", label: "Request Date", type: "date", required: true },
    { name: "justification", label: "Justification (describe amount/items needed and why)", type: "textarea", required: true },
  ], [assessments]);

  async function handleSubmit(values) {
    if (modal.mode === "create") {
      const result = await create(values, "Support request submitted");
      if (result) {
        setModal(null);
        router.push(`/support-requests/${result.id}`); // continue adding requested items on the detail page
      }
    } else {
      const ok = await update(modal.record.request_id, values, "Support request updated");
      if (ok) setModal(null);
    }
  }

  return (
    <Layout title="Support Requests">
      <div className="sf-card">
        <div className="d-flex justify-content-between mb-3">
          <select className="form-select w-auto" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">All statuses</option>
            {["PENDING", "SUBMITTED_FOR_APPROVAL", "APPROVED", "REJECTED", "DISBURSED"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {canManage && <button className="btn btn-sf-accent" onClick={() => setModal({ mode: "create", record: {} })}>+ New Request</button>}
        </div>
        <table className="sf-table">
          <thead><tr><th>ID</th><th>Type</th><th>Priority</th><th>Request Date</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r.request_id}>
                <td>#{r.request_id}</td><td>{r.request_type}</td><td>{r.priority}</td><td>{r.request_date}</td>
                <td><span className={`badge-status badge-${r.status}`}>{r.status}</span></td>
                <td className="d-flex gap-2">
                  <Link href={`/support-requests/${r.request_id}`} className="btn btn-sm btn-sf-primary">View</Link>
                  {canManage && r.status === "PENDING" && <>
                    <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setModal({ mode: "edit", record: r })}>Edit</button>
                    <button className="btn btn-sm btn-outline-danger fw-bold" onClick={() => setToDelete(r)}>Delete</button>
                  </>}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-3">No requests found.</td></tr>}
          </tbody>
        </table>
        <Pagination page={page} totalPages={data.total_pages} onChange={setPage} />
      </div>

      {modal && (
        <FormModal title={modal.mode === "create" ? "New Support Request" : "Edit Support Request"} fields={fields}
                   initialValues={modal.record} submitLabel="Submit"
                   onSubmit={handleSubmit} onClose={() => setModal(null)} />
      )}
      {toDelete && (
        <ConfirmDialog title="Delete Support Request" message={`Delete request #${toDelete.request_id}? This cannot be undone.`}
                       onConfirm={async () => { if (await remove(toDelete.request_id, "Support request deleted")) setToDelete(null); }}
                       onClose={() => setToDelete(null)} />
      )}
    </Layout>
  );
}

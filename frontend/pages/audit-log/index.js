import { useState } from "react";
import Layout from "../../components/Layout";
import Pagination from "../../components/Pagination";
import InfoModal from "../../components/InfoModal";
import useCrud from "../../lib/useCrud";
import api from "../../lib/api";
import { useToast } from "../../lib/toast";

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "VERIFY", "APPROVE", "REJECTED", "SENT_BACK", "LOGIN", "LOCK", "UNLOCK", "EXPORT"];

export default function AuditLog() {
  const { notifyError } = useToast();
  const [action, setAction] = useState("");
  const [tableName, setTableName] = useState("");
  const { data, page, setPage } = useCrud("/audit-log", { params: { action: action || undefined, table_name: tableName || undefined } });
  const [selectedUser, setSelectedUser] = useState(null);

  async function viewUser(userId) {
    try {
      const res = await api.get(`/users/${userId}`);
      setSelectedUser(res.data);
    } catch (err) {
      notifyError(err, "Could not load user details");
    }
  }

  return (
    <Layout title="Audit Log">
      <div className="sf-card">
        <p className="text-secondary fw-semibold">Read-only trail of every mutating action across the system, for accountability and audit purposes.</p>
        <div className="d-flex gap-2 mb-3">
          <select className="form-select w-auto" value={action} onChange={(e) => { setPage(1); setAction(e.target.value); }}>
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input className="form-control w-auto" placeholder="Filter by table name…" value={tableName} onChange={(e) => { setPage(1); setTableName(e.target.value); }} />
        </div>
        <table className="sf-table">
          <thead><tr><th>ID</th><th>User ID</th><th>Action</th><th>Table</th><th>Record ID</th><th>Description</th><th>When</th></tr></thead>
          <tbody>
            {data.items.map((l) => (
              <tr key={l.audit_log_id}>
                <td>#{l.audit_log_id}</td>
                <td>
                  {l.user_id ? (
                    <button className="btn btn-sm btn-link p-0 fw-bold text-decoration-underline" onClick={() => viewUser(l.user_id)}>{l.user_id}</button>
                  ) : "-"}
                </td>
                <td><span className={`badge-status badge-${l.action === "DELETE" || l.action === "REJECTED" ? "REJECTED" : "CONFIRMED"}`}>{l.action}</span></td>
                <td>{l.table_name}</td><td>{l.record_id ?? "-"}</td><td>{l.description || "-"}</td>
                <td>{new Date(l.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={7} className="text-center text-muted py-3">No audit entries match these filters.</td></tr>}
          </tbody>
        </table>
        <Pagination page={page} totalPages={data.total_pages} onChange={setPage} />
      </div>

      {selectedUser && (
        <InfoModal title="User Details" width={520} onClose={() => setSelectedUser(null)}>
          <div className="row g-2 fw-bold">
            <div className="col-md-6">Name: <span className="fw-normal">{selectedUser.first_name} {selectedUser.last_name}</span></div>
            <div className="col-md-6">Status: <span className={`badge-status badge-${selectedUser.status}`}>{selectedUser.status}</span></div>
            <div className="col-md-6">Email: <span className="fw-normal">{selectedUser.email}</span></div>
            <div className="col-md-6">Phone: <span className="fw-normal">{selectedUser.phone_number || "-"}</span></div>
            <div className="col-12">Roles: <span className="fw-normal">{(selectedUser.roles || []).join(", ") || "-"}</span></div>
            <div className="col-md-6">Last Login: <span className="fw-normal">{selectedUser.last_login_at ? new Date(selectedUser.last_login_at).toLocaleString() : "-"}</span></div>
            <div className="col-md-6">Account Created: <span className="fw-normal">{selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleString() : "-"}</span></div>
          </div>
        </InfoModal>
      )}
    </Layout>
  );
}

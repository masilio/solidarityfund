import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import api from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useAuth } from "../../lib/auth";

export default function Profile() {
  const { logout } = useAuth();
  const { notifyError } = useToast();
  const [me, setMe] = useState(null);

  useEffect(() => {
    api.get("/auth/me").then((r) => setMe(r.data)).catch((err) => notifyError(err, "Could not load your profile"));
  }, []);

  if (!me) return <Layout title="My Profile"><div className="sf-card">Loading…</div></Layout>;

  const permissionList = me.permissions === "ALL" ? ["All permissions (Administrator)"] : me.permissions;

  return (
    <Layout title="My Profile">
      <div className="sf-card mb-3">
        <div className="row g-2 fw-bold">
          <div className="col-md-4">Name: <span className="fw-normal">{me.first_name} {me.last_name}</span></div>
          <div className="col-md-4">Email: <span className="fw-normal">{me.email}</span></div>
          <div className="col-md-4">Phone: <span className="fw-normal">{me.phone_number || "-"}</span></div>
          <div className="col-md-4">Status: <span className={`badge-status badge-${me.status}`}>{me.status}</span></div>
          <div className="col-md-4">Last Login: <span className="fw-normal">{me.last_login_at ? new Date(me.last_login_at).toLocaleString() : "-"}</span></div>
          <div className="col-md-4">Member Since: <span className="fw-normal">{me.created_at ? new Date(me.created_at).toLocaleDateString() : "-"}</span></div>
        </div>
      </div>

      <div className="sf-card mb-3">
        <h6 className="fw-bold mb-2">Roles</h6>
        <div className="d-flex gap-2 flex-wrap">
          {me.roles.map((r) => <span key={r} className="badge-status badge-CONFIRMED">{r}</span>)}
        </div>
      </div>

      <div className="sf-card mb-3">
        <h6 className="fw-bold mb-2">Permissions</h6>
        <p className="text-secondary fw-semibold mb-2">
          What you're allowed to do in the system — set by your role by default, and individually
          adjustable by an administrator.
        </p>
        <ul className="mb-0">
          {permissionList.map((p) => <li key={p} className="fw-semibold">{p}</li>)}
        </ul>
      </div>

      <button className="btn btn-outline-danger fw-bold" onClick={logout}>Log Out</button>
    </Layout>
  );
}

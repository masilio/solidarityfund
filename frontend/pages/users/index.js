import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import FormModal from "../../components/FormModal";
import useCrud from "../../lib/useCrud";
import api from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useAuth } from "../../lib/auth";

const CREATE_FIELDS = [
  { name: "first_name", label: "First Name", required: true },
  { name: "last_name", label: "Last Name", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "phone_number", label: "Phone Number" },
  { name: "password", label: "Temporary Password", type: "password", required: true },
];

const EDIT_FIELDS = [
  { name: "first_name", label: "First Name", required: true },
  { name: "last_name", label: "Last Name", required: true },
  { name: "phone_number", label: "Phone Number" },
  { name: "password", label: "New Password (leave blank to keep current)", type: "password" },
];

export default function Users() {
  const { hasPermission } = useAuth();
  const canManageUsers = hasPermission("MANAGE_USERS");
  const canAssignRoles = hasPermission("ASSIGN_ROLES");
  const canAssignPermissions = hasPermission("ASSIGN_PERMISSIONS");
  const { data, create, update, action, load } = useCrud("/users");
  const { notifySuccess, notifyError } = useToast();
  const [roles, setRoles] = useState([]);
  const [permissionCatalog, setPermissionCatalog] = useState([]);
  const [modal, setModal] = useState(null);
  const [rolesModal, setRolesModal] = useState(null);
  const [permissionsModal, setPermissionsModal] = useState(null);

  useEffect(() => { if (canAssignRoles) api.get("/users/roles").then((r) => setRoles(r.data)); }, [canAssignRoles]);
  useEffect(() => { if (canAssignPermissions) api.get("/users/permissions").then((r) => setPermissionCatalog(r.data)); }, [canAssignPermissions]);

  const rolesFields = useMemo(() => roles.map((r) => ({ name: `role_${r.role_id}`, label: r.role_name, type: "checkbox" })), [roles]);
  const permissionFields = useMemo(() => permissionCatalog.map((p) => ({ name: `perm_${p.code}`, label: p.description || p.code, type: "checkbox" })), [permissionCatalog]);

  async function submitCreate(values) {
    const ok = await create(values, "User created");
    if (ok) setModal(null);
  }

  async function submitEdit(values) {
    const payload = { ...values };
    if (!payload.password) delete payload.password;
    const ok = await update(modal.record.user_id, payload, "User updated");
    if (ok) setModal(null);
  }

  async function toggleLock(u) {
    await action("post", `/users/${u.user_id}/${u.status === "LOCKED" ? "unlock" : "lock"}`, undefined, u.status === "LOCKED" ? "User unlocked" : "User locked");
  }

  async function submitRoles(values) {
    const role_ids = roles.filter((r) => values[`role_${r.role_id}`]).map((r) => r.role_id);
    try {
      await api.put(`/users/${rolesModal.user_id}/roles`, { role_ids });
      notifySuccess("Roles updated");
      setRolesModal(null);
      load();
    } catch (err) {
      notifyError(err, "Could not update roles");
    }
  }

  async function submitPermissions(values) {
    const permission_codes = permissionCatalog.filter((p) => values[`perm_${p.code}`]).map((p) => p.code);
    try {
      await api.put(`/users/${permissionsModal.user_id}/permissions`, { permission_codes });
      notifySuccess("Permissions updated");
      setPermissionsModal(null);
      load();
    } catch (err) {
      notifyError(err, "Could not update permissions");
    }
  }

  return (
    <Layout title="Users, Roles & Permissions">
      <div className="sf-card mb-3">
        <div className="d-flex justify-content-between mb-3">
          <h6 className="fw-bold mb-0">All Users</h6>
          {canManageUsers && <button className="btn btn-sf-accent" onClick={() => setModal({ mode: "create", record: {} })}>+ New User</button>}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="sf-table">
            <thead><tr><th>Name</th><th>Email</th><th>Roles</th><th>Permission Overrides</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.user_id}>
                  <td>{u.first_name} {u.last_name}</td><td>{u.email}</td><td>{(u.roles || []).join(", ") || "-"}</td>
                  <td>{u.permissions === "ALL" ? "All (Administrator)" : `${(u.permissions || []).length} permission(s)`}</td>
                  <td><span className={`badge-status badge-${u.status}`}>{u.status}</span></td>
                  <td className="d-flex gap-2 flex-wrap">
                    {canManageUsers && <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setModal({ mode: "edit", record: u })}>Edit</button>}
                    {canAssignRoles && <button className="btn btn-sm btn-sf-primary" onClick={() => setRolesModal(u)}>Roles</button>}
                    {canAssignPermissions && <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setPermissionsModal(u)}>Permissions</button>}
                    {canManageUsers && <button className="btn btn-sm btn-outline-danger fw-bold" onClick={() => toggleLock(u)}>{u.status === "LOCKED" ? "Unlock" : "Lock"}</button>}
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-3">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <FormModal title={modal.mode === "create" ? "New User" : "Edit User"} fields={modal.mode === "create" ? CREATE_FIELDS : EDIT_FIELDS}
                   initialValues={modal.record} submitLabel="Submit"
                   onSubmit={modal.mode === "create" ? submitCreate : submitEdit} onClose={() => setModal(null)} />
      )}
      {rolesModal && (
        <FormModal title={`Roles for ${rolesModal.first_name} ${rolesModal.last_name}`} fields={rolesFields}
                   initialValues={Object.fromEntries(roles.map((r) => [`role_${r.role_id}`, (rolesModal.roles || []).includes(r.role_name)]))}
                   submitLabel="Submit" onSubmit={submitRoles} onClose={() => setRolesModal(null)} />
      )}
      {permissionsModal && (
        <FormModal title={`Permissions for ${permissionsModal.first_name} ${permissionsModal.last_name}`} fields={permissionFields}
                   initialValues={Object.fromEntries(permissionCatalog.map((p) => [`perm_${p.code}`,
                     permissionsModal.permissions === "ALL" || (permissionsModal.permissions || []).includes(p.code)]))}
                   submitLabel="Submit" onSubmit={submitPermissions} onClose={() => setPermissionsModal(null)} />
      )}
    </Layout>
  );
}

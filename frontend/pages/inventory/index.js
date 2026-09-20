import { useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import Pagination from "../../components/Pagination";
import FormModal from "../../components/FormModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import useCrud from "../../lib/useCrud";
import api from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useAuth } from "../../lib/auth";

const CATEGORY_FIELDS = [
  { name: "category_name", label: "Category Name", required: true },
  { name: "description", label: "Description", type: "textarea" },
];

function CategoriesTab() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("MANAGE_INVENTORY");
  const { notifySuccess, notifyError } = useToast();
  const [categories, setCategories] = useState([]);
  const [modal, setModal] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  function load() { api.get("/inventory/categories").then((r) => setCategories(r.data)); }
  useEffect(load, []);

  async function submit(values) {
    try {
      if (modal.mode === "create") { await api.post("/inventory/categories", values); notifySuccess("Category created"); }
      else { await api.put(`/inventory/categories/${modal.record.category_id}`, values); notifySuccess("Category updated"); }
      setModal(null); load();
    } catch (err) { notifyError(err, "Could not save category"); }
  }

  async function del() {
    try {
      await api.delete(`/inventory/categories/${toDelete.category_id}`);
      notifySuccess("Category deleted"); setToDelete(null); load();
    } catch (err) { notifyError(err, "Could not delete category"); }
  }

  return (
    <>
      <div className="d-flex justify-content-between mb-3">
        <div />
        {canManage && <button className="btn btn-sf-accent" onClick={() => setModal({ mode: "create", record: {} })}>+ New Category</button>}
      </div>
      <table className="sf-table">
        <thead><tr><th>Name</th><th>Description</th><th>Status</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.category_id}>
              <td>{c.category_name}</td><td>{c.description || "-"}</td>
              <td><span className={`badge-status badge-${c.status}`}>{c.status}</span></td>
              {canManage && (
                <td className="d-flex gap-2">
                  <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setModal({ mode: "edit", record: c })}>Edit</button>
                  <button className="btn btn-sm btn-outline-danger fw-bold" onClick={() => setToDelete(c)}>Delete</button>
                </td>
              )}
            </tr>
          ))}
          {categories.length === 0 && <tr><td colSpan={4} className="text-center text-muted py-3">No categories yet.</td></tr>}
        </tbody>
      </table>
      {modal && (
        <FormModal title={modal.mode === "create" ? "New Item Category" : "Edit Item Category"} fields={CATEGORY_FIELDS}
                   initialValues={modal.record} submitLabel="Submit"
                   onSubmit={submit} onClose={() => setModal(null)} />
      )}
      {toDelete && <ConfirmDialog title="Delete Category" message={`Delete "${toDelete.category_name}"?`} onConfirm={del} onClose={() => setToDelete(null)} />}
    </>
  );
}

function ItemsTab() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("MANAGE_INVENTORY");
  const { data, page, setPage, create, update, remove } = useCrud("/inventory/items");
  const [categories, setCategories] = useState([]);
  const [modal, setModal] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  useEffect(() => { api.get("/inventory/categories").then((r) => setCategories(r.data)); }, []);

  const fields = useMemo(() => [
    { name: "item_name", label: "Item Name", required: true },
    { name: "category_id", label: "Category", required: true, type: "select",
      options: categories.map((c) => ({ value: c.category_id, label: c.category_name })) },
    { name: "unit_of_measure", label: "Unit of Measure", required: true },
    { name: "reorder_level", label: "Reorder Level", type: "number" },
    { name: "description", label: "Description", type: "textarea" },
  ], [categories]);

  async function submit(values) {
    const ok = modal.mode === "create" ? await create(values, "Item created") : await update(modal.record.item_id, values, "Item updated");
    if (ok) setModal(null);
  }

  return (
    <>
      <div className="d-flex justify-content-between mb-3">
        <div />
        {canManage && <button className="btn btn-sf-accent" onClick={() => setModal({ mode: "create", record: {} })}>+ New Item</button>}
      </div>
      <table className="sf-table">
        <thead><tr><th>Name</th><th>Unit</th><th>Status</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {data.items.map((it) => (
            <tr key={it.item_id}>
              <td>{it.item_name}</td><td>{it.unit_of_measure}</td>
              <td><span className={`badge-status badge-${it.status}`}>{it.status}</span></td>
              {canManage && (
                <td className="d-flex gap-2">
                  <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setModal({ mode: "edit", record: it })}>Edit</button>
                  <button className="btn btn-sm btn-outline-danger fw-bold" onClick={() => setToDelete(it)}>Delete</button>
                </td>
              )}
            </tr>
          ))}
          {data.items.length === 0 && <tr><td colSpan={4} className="text-center text-muted py-3">No items yet.</td></tr>}
        </tbody>
      </table>
      <Pagination page={page} totalPages={data.total_pages} onChange={setPage} />
      {modal && (
        <FormModal title={modal.mode === "create" ? "New Item" : "Edit Item"} fields={fields}
                   initialValues={modal.record} submitLabel="Submit"
                   onSubmit={submit} onClose={() => setModal(null)} />
      )}
      {toDelete && (
        <ConfirmDialog title="Delete Item" message={`Delete "${toDelete.item_name}"? This is blocked if it still has stock or history.`}
                       onConfirm={async () => { if (await remove(toDelete.item_id, "Item deleted")) setToDelete(null); }}
                       onClose={() => setToDelete(null)} />
      )}
    </>
  );
}

function StockTab() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("MANAGE_INVENTORY");
  const { notifySuccess, notifyError } = useToast();
  const { data, page, setPage, load } = useCrud("/inventory/stock");
  const [modal, setModal] = useState(null);

  async function submit(values) {
    try {
      await api.put(`/inventory/stock/${modal.item_id}/reorder-level`, { reorder_level: Number(values.reorder_level) });
      notifySuccess("Reorder level updated");
      setModal(null); load();
    } catch (err) { notifyError(err, "Could not update reorder level"); }
  }

  return (
    <>
      <table className="sf-table">
        <thead><tr><th>Item ID</th><th>Available</th><th>Reorder Level</th><th>Last Updated</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {data.items.map((s) => (
            <tr key={s.inventory_id}>
              <td>{s.item_id}</td><td>{s.quantity_available}</td><td>{s.reorder_level}</td>
              <td>{new Date(s.updated_at).toLocaleString()}</td>
              {canManage && <td><button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setModal({ item_id: s.item_id, reorder_level: s.reorder_level })}>Adjust Reorder Level</button></td>}
            </tr>
          ))}
          {data.items.length === 0 && <tr><td colSpan={5} className="text-center text-muted py-3">No stock records yet.</td></tr>}
        </tbody>
      </table>
      <Pagination page={page} totalPages={data.total_pages} onChange={setPage} />
      {modal && (
        <FormModal title={`Adjust Reorder Level — Item #${modal.item_id}`} fields={[{ name: "reorder_level", label: "Reorder Level", type: "number", required: true }]}
                   initialValues={modal} submitLabel="Submit" onSubmit={submit} onClose={() => setModal(null)} />
      )}
    </>
  );
}

function MovementsTab() {
  const { data, page, setPage } = useCrud("/inventory/movements");
  return (
    <>
      <table className="sf-table">
        <thead><tr><th>ID</th><th>Item ID</th><th>Type</th><th>Quantity</th><th>Date</th><th>Remarks</th></tr></thead>
        <tbody>
          {data.items.map((m) => (
            <tr key={m.movement_id}>
              <td>#{m.movement_id}</td><td>{m.item_id}</td>
              <td><span className={`badge-status badge-${m.movement_type === "IN" ? "CONFIRMED" : "REJECTED"}`}>{m.movement_type}</span></td>
              <td>{m.quantity}</td><td>{new Date(m.movement_date).toLocaleString()}</td><td>{m.remarks || "-"}</td>
            </tr>
          ))}
          {data.items.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-3">No stock movements yet.</td></tr>}
        </tbody>
      </table>
      <Pagination page={page} totalPages={data.total_pages} onChange={setPage} />
    </>
  );
}

function LedgerTab() {
  const { data, page, setPage } = useCrud("/inventory/ledger");
  return (
    <>
      <table className="sf-table">
        <thead><tr><th>ID</th><th>Type</th><th>Amount</th><th>Reference</th><th>Payment Method</th><th>Date</th></tr></thead>
        <tbody>
          {data.items.map((l) => (
            <tr key={l.cash_transaction_id}>
              <td>#{l.cash_transaction_id}</td>
              <td><span className={`badge-status badge-${l.transaction_type === "IN" ? "CONFIRMED" : "REJECTED"}`}>{l.transaction_type}</span></td>
              <td>{l.amount.toLocaleString()} {l.currency}</td><td>{l.reference_type}</td><td>{l.payment_method}</td>
              <td>{new Date(l.transaction_date).toLocaleString()}</td>
            </tr>
          ))}
          {data.items.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-3">No cash transactions yet.</td></tr>}
        </tbody>
      </table>
      <Pagination page={page} totalPages={data.total_pages} onChange={setPage} />
    </>
  );
}

const TABS = [
  { key: "items", label: "Items", Component: ItemsTab },
  { key: "categories", label: "Categories", Component: CategoriesTab },
  { key: "stock", label: "Stock Levels", Component: StockTab },
  { key: "movements", label: "Movements ", Component: MovementsTab },
  { key: "ledger", label: "Fund Ledger ", Component: LedgerTab },
];

export default function Inventory() {
  const [tab, setTab] = useState("items");
  const Active = TABS.find((t) => t.key === tab).Component;

  return (
    <Layout title="Items & Inventory">
      <ul className="nav nav-pills mb-3">
        {TABS.map((t) => (
          <li className="nav-item" key={t.key}>
            <button className={`nav-link fw-bold ${tab === t.key ? "active" : ""}`}
                    style={tab === t.key ? { background: "var(--sf-navy)" } : { color: "var(--sf-navy)" }}
                    onClick={() => setTab(t.key)}>{t.label}</button>
          </li>
        ))}
      </ul>
      <div className="sf-card"><Active /></div>
    </Layout>
  );
}

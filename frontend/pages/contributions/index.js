import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import Pagination from "../../components/Pagination";
import FormModal from "../../components/FormModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import useCrud from "../../lib/useCrud";
import api from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useAuth } from "../../lib/auth";

const GATEWAY_METHODS = ["BANK", "MOBILE_MONEY_MTN", "MOBILE_MONEY_AIRTEL"];
const PAYMENT_METHOD_OPTIONS = [
  { value: "MOBILE_MONEY_MTN", label: "MTN Mobile Money" },
  { value: "MOBILE_MONEY_AIRTEL", label: "Airtel Money" },
  { value: "CHEQUE", label: "Cheque" },
];

const CONTRIBUTOR_FIELDS = [
  { name: "contributor_name", label: "Contributor Name", required: true },
  { name: "contributor_type", label: "Type", required: true, type: "select",
    options: ["Government", "NGO", "Company", "Individual"].map((v) => ({ value: v, label: v })) },
  { name: "phone_number", label: "Phone Number" },
  { name: "email", label: "Email", type: "email" },
  { name: "address", label: "Address", type: "textarea" },
];

function ContributorsTab() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("CONFIRM_CONTRIBUTION");
  const { data, page, setPage, create, update, remove } = useCrud("/contributions/contributors");
  const [modal, setModal] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  async function submit(values) {
    const ok = modal.mode === "create" ? await create(values, "Contributor registered") : await update(modal.record.contributor_id, values, "Contributor updated");
    if (ok) setModal(null);
  }

  return (
    <>
      <div className="d-flex justify-content-between mb-3">
        <div />
        {canManage && <button className="btn btn-sf-accent" onClick={() => setModal({ mode: "create", record: {} })}>+ New Contributor</button>}
      </div>
      <table className="sf-table">
        <thead><tr><th>Name</th><th>Type</th><th>Phone</th><th>Email</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {data.items.map((c) => (
            <tr key={c.contributor_id}>
              <td>{c.contributor_name}</td><td>{c.contributor_type}</td><td>{c.phone_number || "-"}</td><td>{c.email || "-"}</td>
              {canManage && (
                <td className="d-flex gap-2">
                  <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setModal({ mode: "edit", record: c })}>Edit</button>
                  <button className="btn btn-sm btn-outline-danger fw-bold" onClick={() => setToDelete(c)}>Delete</button>
                </td>
              )}
            </tr>
          ))}
          {data.items.length === 0 && <tr><td colSpan={5} className="text-center text-muted py-3">No contributors yet.</td></tr>}
        </tbody>
      </table>
      <Pagination page={page} totalPages={data.total_pages} onChange={setPage} />
      {modal && (
        <FormModal title={modal.mode === "create" ? "New Contributor" : "Edit Contributor"} fields={CONTRIBUTOR_FIELDS}
                   initialValues={modal.record} onSubmit={submit} onClose={() => setModal(null)} />
      )}
      {toDelete && (
        <ConfirmDialog title="Delete Contributor" message={`Delete "${toDelete.contributor_name}"? Blocked if they already have contributions on file.`}
                       onConfirm={async () => { if (await remove(toDelete.contributor_id, "Contributor deleted")) setToDelete(null); }}
                       onClose={() => setToDelete(null)} />
      )}
    </>
  );
}

function ContributionsTab() {
  const router = useRouter();
  const { hasPermission, contributor } = useAuth();
  const isContributor = hasPermission("RECORD_CONTRIBUTION");
  const canConfirm = hasPermission("CONFIRM_CONTRIBUTION");
  const { notifySuccess, notifyError } = useToast();
  const [status, setStatus] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const { data, page, setPage, remove, action, load } = useCrud("/contributions", {
    params: { status: status || undefined, payment_status: paymentFilter || undefined },
  });
  const [contributors, setContributors] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [modal, setModal] = useState(null); // {mode:'create'|'edit', kind:'cash'|'item', record, contributionId}
  const [toDelete, setToDelete] = useState(null);
  const [recordPaymentModal, setRecordPaymentModal] = useState(null); // contribution row

  
  useEffect(() => { if (!contributor) api.get("/contributions/contributors", { params: { page_size: 100 } }).then((r) => setContributors(r.data.items)); }, [contributor]);
  useEffect(() => { api.get("/inventory/items", { params: { page_size: 100 } }).then((r) => setInventoryItems(r.data.items)); }, []);

  const contributorField = contributor
    ? { name: "_contributor", label: "Contributing As", readOnly: true, displayValue: contributor.name }
    : { name: "contributor_id", label: "Contributor", required: true, type: "select",
        options: contributors.map((c) => ({ value: c.contributor_id, label: c.contributor_name })) };

  const cashFields = useMemo(() => [
    contributorField,
    { name: "contribution_date", label: "Contribution Date", type: "date", required: true },
    { name: "amount", label: "Cash Amount", type: "number", required: true },
    { name: "payment_method", label: "Payment Method", required: true, type: "select", options: PAYMENT_METHOD_OPTIONS },
    { name: "remarks", label: "Remarks", type: "textarea" },
  ], [contributors, contributor]);

  const itemFields = useMemo(() => [
    contributorField,
    { name: "contribution_date", label: "Contribution Date", type: "date", required: true },
    { name: "item_id", label: "Item Donated", required: true, type: "select",
      options: inventoryItems.map((i) => ({ value: i.item_id, label: `${i.item_name} (${i.unit_of_measure})` })) },
    { name: "quantity", label: "Quantity", type: "number", required: true },
    { name: "unit", label: "Unit", required: true },
    { name: "condition", label: "Condition", type: "select",
      options: ["NEW", "GOOD", "USED"].map((v) => ({ value: v, label: v })) },
    { name: "remarks", label: "Remarks", type: "textarea" },
  ], [contributors, inventoryItems, contributor]);

  const recordPaymentFields = [
    { name: "payment_reference", label: "Payment Reference", required: true },
    { name: "amount_paid", label: "Amount Paid", type: "number", required: true },
  ];

  async function openEdit(c) {
    try {
      const res = await api.get(`/contributions/${c.contribution_id}`);
      const detail = res.data;
      if (detail.cash) {
        setModal({ mode: "edit", kind: "cash", contributionId: c.contribution_id,
          record: { contributor_id: detail.contributor_id, contribution_date: detail.contribution_date,
                    amount: detail.cash.amount, payment_method: detail.cash.payment_method, remarks: detail.remarks } });
      } else {
        const firstItem = (detail.items || [])[0] || {};
        setModal({ mode: "edit", kind: "item", contributionId: c.contribution_id,
          record: { contributor_id: detail.contributor_id, contribution_date: detail.contribution_date,
                    item_id: firstItem.item_id, quantity: firstItem.quantity, unit: firstItem.unit,
                    condition: firstItem.condition, remarks: detail.remarks } });
      }
    } catch (err) {
      notifyError(err, "Could not load contribution for editing");
    }
  }

  async function submit(values) {
    try {
      const payload = {
        contributor_id: contributor ? undefined : Number(values.contributor_id),
        contribution_date: values.contribution_date, remarks: values.remarks || undefined,
        cash: modal.kind === "cash" ? { amount: Number(values.amount), payment_method: values.payment_method } : undefined,
        items: modal.kind === "item" ? [{ item_id: Number(values.item_id), quantity: Number(values.quantity), unit: values.unit, condition: values.condition || undefined }] : undefined,
      };
      if (modal.mode === "create") {
        const res = await api.post("/contributions", payload);
        setModal(null);
        if (modal.kind === "cash" && GATEWAY_METHODS.includes(values.payment_method)) {
          notifySuccess("Contribution submitted — now complete your payment");
          router.push(`/contributions/${res.data.id}`);
          return;
        }
        notifySuccess(`${modal.kind === "cash" ? "Cash" : "Item"} contribution submitted`);
      } else {
        await api.put(`/contributions/${modal.contributionId}`, payload);
        notifySuccess("Contribution updated");
        setModal(null);
      }
      load();
    } catch (err) { notifyError(err, "Could not save contribution"); }
  }

  async function submitExternalPayment(values) {
    try {
      await api.put(`/contributions/${recordPaymentModal.contribution_id}/payment`,
        { payment_reference: values.payment_reference, amount_paid: Number(values.amount_paid) });
      notifySuccess("Payment recorded");
      setRecordPaymentModal(null);
      load();
    } catch (err) {
      notifyError(err, "Could not record payment");
    }
  }

  async function confirm(id) { await action("post", `/contributions/${id}/confirm`, undefined, "Contribution confirmed"); }

  return (
    <>
      <div className="d-flex justify-content-between mb-3 flex-wrap gap-2">
        <div className="d-flex gap-2">
          <select className="form-select w-auto" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">All statuses</option>
            {["PENDING", "CONFIRMED", "REJECTED"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="form-select w-auto" value={paymentFilter} onChange={(e) => { setPage(1); setPaymentFilter(e.target.value); }}>
            <option value="">All payments</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Unpaid</option>
          </select>
        </div>
        {isContributor && (
          <div className="d-flex gap-2">
            <button className="btn btn-sf-accent" onClick={() => setModal({ mode: "create", kind: "cash", record: {} })}>+ Cash Contribution</button>
            <button className="btn btn-sf-accent" onClick={() => setModal({ mode: "create", kind: "item", record: {} })}>+ Item Contribution</button>
          </div>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="sf-table">
          <thead><tr><th>ID</th><th>Contributor ID</th><th>Date</th><th>Status</th><th>Payment</th><th></th></tr></thead>
          <tbody>
            {data.items.map((c) => (
              <tr key={c.contribution_id}>
                <td>#{c.contribution_id}</td><td>{c.contributor_id}</td><td>{c.contribution_date}</td>
                <td><span className={`badge-status badge-${c.verification_status}`}>{c.verification_status}</span></td>
                <td>
                  {!c.cash ? "-" : c.cash.payment_status === "PAID"
                    ? <span className="badge-status badge-CONFIRMED">Paid</span>
                    : <span className="badge-status badge-PENDING">Unpaid</span>}
                </td>
                <td className="d-flex gap-2 flex-wrap">
                  <Link href={`/contributions/${c.contribution_id}`} className="btn btn-sm btn-sf-primary">View</Link>
                  {canConfirm && c.verification_status === "PENDING" && c.cash && c.cash.payment_status !== "PAID" && (
                    <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setRecordPaymentModal(c)}>Record External Payment</button>
                  )}
                  {canConfirm && c.verification_status === "PENDING" && (!c.cash || c.cash.payment_status === "PAID") && (
                    <button className="btn btn-sm" style={{ background: "var(--sf-green)", color: "#fff", fontWeight: 700 }} onClick={() => confirm(c.contribution_id)}>Confirm Receipt</button>
                  )}
                  {isContributor && c.verification_status === "PENDING" && <>
                    <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => openEdit(c)}>Edit</button>
                    <button className="btn btn-sm btn-outline-danger fw-bold" onClick={() => setToDelete(c)}>Delete</button>
                  </>}
                </td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-3">No contributions found.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={data.total_pages} onChange={setPage} />

      {modal && (
        <FormModal title={`${modal.mode === "create" ? "New" : "Edit"} ${modal.kind === "cash" ? "Cash" : "Item"} Contribution`}
                   fields={modal.kind === "cash" ? cashFields : itemFields}
                   initialValues={modal.record} onSubmit={submit} onClose={() => setModal(null)} />
      )}
      {toDelete && (
        <ConfirmDialog title="Delete Contribution" message={`Delete contribution #${toDelete.contribution_id}?`}
                       onConfirm={async () => { if (await remove(toDelete.contribution_id, "Contribution deleted")) setToDelete(null); }}
                       onClose={() => setToDelete(null)} />
      )}
      {recordPaymentModal && (
        <FormModal title={`Record Payment — Contribution #${recordPaymentModal.contribution_id}`} fields={recordPaymentFields}
                   initialValues={{ amount_paid: recordPaymentModal.cash?.amount }} submitLabel="Save"
                   onSubmit={submitExternalPayment} onClose={() => setRecordPaymentModal(null)} />
      )}
    </>
  );
}

export default function Contributions() {
  const { hasPermission } = useAuth();
  const showContributorsTab = hasPermission("CONFIRM_CONTRIBUTION");
  const [tab, setTab] = useState("contributions");

  if (!showContributorsTab) {
    return (
      <Layout title="Contributions">
        <div className="sf-card"><ContributionsTab /></div>
      </Layout>
    );
  }

  return (
    <Layout title="Contributions">
      <ul className="nav nav-pills mb-3">
        {[{ key: "contributions", label: "Contributions" }, { key: "contributors", label: "Contributors" }].map((t) => (
          <li className="nav-item" key={t.key}>
            <button className={`nav-link fw-bold ${tab === t.key ? "active" : ""}`}
                    style={tab === t.key ? { background: "var(--sf-navy)" } : { color: "var(--sf-navy)" }}
                    onClick={() => setTab(t.key)}>{t.label}</button>
          </li>
        ))}
      </ul>
      <div className="sf-card">{tab === "contributions" ? <ContributionsTab /> : <ContributorsTab />}</div>
    </Layout>
  );
}

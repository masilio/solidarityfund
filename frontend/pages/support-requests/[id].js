import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import FormModal from "../../components/FormModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import InfoModal from "../../components/InfoModal";
import api from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useAuth } from "../../lib/auth";

// Display-only hint for whether a MoMo payout looks possible — the backend does the real
// (authoritative) network detection and validation when the payout actually happens.
function looksLikeMomoNumber(phone) {
  if (!phone) return false;
  const local = phone.replace(/\D/g, "").slice(-9);
  return /^(78|79|72|73)/.test(local);
}

export default function SupportRequestDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { hasPermission } = useAuth();
  const canManage = hasPermission("SUBMIT_SUPPORT_REQUEST");
  const canDisburse = hasPermission("DISBURSE_SUPPORT");
  // Verify-allocate-submit is one composite action on the backend (requires all three at
  // once) — mirrored here rather than using the OR-based hasPermission for this one check.
  const canVerifyAllocate = hasPermission("VERIFY_SUPPORT_REQUEST") && hasPermission("ALLOCATE_SUPPORT_REQUEST") && hasPermission("SUBMIT_FOR_APPROVAL");
  const { notifySuccess, notifyError } = useToast();
  const [sr, setSr] = useState(null);
  const [items, setItems] = useState([]);
  const [stockByItem, setStockByItem] = useState({}); // item_id -> quantity_available
  const [cashBalance, setCashBalance] = useState(null);
  const [household, setHousehold] = useState(null); // auto-detected via sr.assessment_id -> assessment.household_id
  const [assessment, setAssessment] = useState(null); // full assessment record, for the Assessment Details popup
  const [approvedAmount, setApprovedAmount] = useState(null); // from the latest APPROVED decision, Cash requests only
  const [allocations, setAllocations] = useState({});
  const [modal, setModal] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [confirmDisburse, setConfirmDisburse] = useState(false);
  const [disbursing, setDisbursing] = useState(false);
  const [showAssessment, setShowAssessment] = useState(false);

  const showsItems = sr && sr.request_type !== "Cash"; // a Cash request has no item lines at all — not even to browse

  async function load() {
    if (!id) return;
    try {
      const res = await api.get(`/support-requests/${id}`);
      setSr(res.data);
      setAllocations(Object.fromEntries(res.data.items.map((it) => [it.request_item_id, it.quantity_approved ?? it.quantity_requested])));
    } catch (err) {
      notifyError(err, "Could not load support request");
    }
  }
  useEffect(() => { load(); }, [id]);
  useEffect(() => { api.get("/inventory/items", { params: { page_size: 100 } }).then((r) => setItems(r.data.items)); }, []);
  useEffect(() => {
    api.get("/inventory/stock", { params: { page_size: 100 } }).then((r) =>
      setStockByItem(Object.fromEntries(r.data.items.map((s) => [s.item_id, s.quantity_available])))
    );
  }, []);

  // The household a request belongs to is never chosen by hand — it follows the
  // chain support_request -> assessment -> household, exactly as it's modeled.
  useEffect(() => {
    if (!sr?.assessment_id) return;
    (async () => {
      try {
        const a = await api.get(`/assessments/${sr.assessment_id}`);
        setAssessment(a.data);
        const hh = await api.get(`/households/${a.data.household_id}`);
        const head = (hh.data.members || []).find((m) => (m.relationship_to_head || "").toLowerCase() === "head");
        setHousehold({
          id: hh.data.household_id,
          code: hh.data.household_code,
          phoneNumber: hh.data.phone_number,
          headName: head ? `${head.first_name} ${head.last_name}` : "-",
          memberCount: (hh.data.members || []).length,
        });
      } catch (err) {
        notifyError(err, "Could not determine the household for this request");
      }
    })();
  }, [sr?.assessment_id]);

  // Cash requests have no item lines to show an "available quantity" next to — show the
  // available cash balance instead, so whoever is verifying/approving can see it either way.
  useEffect(() => {
    if (!sr || sr.request_type !== "Cash") return;
    api.get("/inventory/balance").then((r) => setCashBalance(r.data.cash_balance)).catch(() => {});
  }, [sr?.request_type]);

  // Only relevant for a Cash request — surfaced purely for the disbursement summary, never editable here.
  useEffect(() => {
    if (!sr || sr.request_type !== "Cash" || sr.status !== "APPROVED") return;
    api.get(`/approvals/${sr.request_id}/history`).then((r) => {
      const latest = [...r.data].reverse().find((a) => a.approval_status === "APPROVED");
      setApprovedAmount(latest?.approved_amount ?? null);
    });
  }, [sr?.request_id, sr?.status]);

  const itemFields = useMemo(() => [
    { name: "item_id", label: "Item", required: true, type: "select",
      options: items.map((i) => ({ value: i.item_id, label: `${i.item_name} (${i.unit_of_measure})` })) },
    { name: "quantity_requested", label: "Quantity Requested", type: "number", required: true },
    { name: "remarks", label: "Remarks", type: "textarea" },
  ], [items]);

  function itemName(itemId) {
    return items.find((i) => i.item_id === itemId)?.item_name || `Item #${itemId}`;
  }

  async function submitItem(values) {
    try {
      if (modal.mode === "create") {
        await api.post(`/support-requests/${id}/items`, values);
        notifySuccess("Item added to request");
      } else {
        await api.put(`/support-requests/${id}/items/${modal.record.request_item_id}`, values);
        notifySuccess("Requested item updated");
      }
      setModal(null);
      load();
    } catch (err) {
      notifyError(err, "Could not save requested item");
    }
  }

  async function deleteItem() {
    try {
      await api.delete(`/support-requests/${id}/items/${toDelete.request_item_id}`);
      notifySuccess("Item removed from request");
      setToDelete(null);
      load();
    } catch (err) {
      notifyError(err, "Could not remove item");
    }
  }

  async function verifyAndSubmit() {
    try {
      const payload = { items: Object.entries(allocations).map(([request_item_id, quantity_approved]) => ({ request_item_id: Number(request_item_id), quantity_approved: Number(quantity_approved) })) };
      await api.post(`/support-requests/${id}/verify-allocate`, payload);
      notifySuccess("Verified and submitted for approval");
      load();
    } catch (err) {
      notifyError(err, "Could not verify request");
    }
  }

  // No form here on purpose: everything given out is exactly what was approved
  // (approval.approved_amount for cash, quantity_approved on each item line) — a
  // distributor confirms the handover, they don't get to type in different numbers.
  // payout_method is the one real choice: it picks the channel (mobile money vs handed
  // over outside the system), never the amount.
  async function handleDisburse(payoutMethod) {
    setDisbursing(true);
    try {
      await api.post("/distributions", { request_id: sr.request_id, payout_method: payoutMethod });
      notifySuccess(payoutMethod === "MOMO" ? "Sent to household's mobile money account" : "Assistance disbursed to household");
      setConfirmDisburse(false);
      load();
    } catch (err) {
      notifyError(err, "Could not record disbursement");
    } finally {
      setDisbursing(false);
    }
  }

  const disburseSummaryLines = useMemo(() => {
    if (!sr) return [];
    const lines = [];
    if (approvedAmount) lines.push(`Cash: ${approvedAmount.toLocaleString()} RWF`);
    const approvedItems = sr.items.filter((it) => it.quantity_approved > 0);
    if (approvedItems.length) lines.push(...approvedItems.map((it) => `${itemName(it.item_id)} x${it.quantity_approved}`));
    return lines;
  }, [sr, approvedAmount, items]);

  if (!sr) return <Layout title="Support Request"><div className="sf-card">Loading…</div></Layout>;

  return (
    <Layout title={`Support Request #${sr.request_id}`}>
      <div className="sf-card mb-3">
        <div className="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
          <h6 className="fw-bold mb-0">Request Overview</h6>
          <button className="btn btn-sm btn-sf-primary" onClick={() => setShowAssessment(true)} disabled={!assessment}>
            Assessment Details
          </button>
        </div>
        <div className="row g-2 fw-bold">
          <div className="col-md-3">Type: <span className="fw-normal">{sr.request_type}</span></div>
          <div className="col-md-3">Priority: <span className="fw-normal">{sr.priority}</span></div>
          <div className="col-md-3">Request Date: <span className="fw-normal">{sr.request_date}</span></div>
          <div className="col-md-3">Status: <span className={`badge-status badge-${sr.status}`}>{sr.status}</span></div>
          <div className="col-md-3">Household: <span className="fw-normal">{household ? `${household.code} (Head: ${household.headName})` : "…"}</span></div>
          <div className="col-12">Justification: <span className="fw-normal">{sr.justification || "-"}</span></div>
        </div>
        {canDisburse && sr.status === "APPROVED" && (
          <button className="btn btn-sf-accent mt-3" onClick={() => setConfirmDisburse(true)}>Disburse to Household</button>
        )}
      </div>

      {showsItems && (
        <div className="sf-card">
          <div className="d-flex justify-content-between mb-3">
            <h6 className="fw-bold mb-0">Requested Items</h6>
            {canManage && sr.status === "PENDING" && <button className="btn btn-sf-accent" onClick={() => setModal({ mode: "create", record: {} })}>+ Add Item</button>}
          </div>
          <table className="sf-table">
            <thead><tr><th>Item</th><th>Qty Requested</th><th>Qty Approved</th><th>Remarks</th><th>Available in Inventory</th><th></th></tr></thead>
            <tbody>
              {sr.items.map((it) => (
                <tr key={it.request_item_id}>
                  <td>{itemName(it.item_id)}</td><td>{it.quantity_requested}</td>
                  <td>
                    {canVerifyAllocate && sr.status === "PENDING" ? (
                      <input type="number" className="form-control form-control-sm" style={{ width: 100 }}
                             value={allocations[it.request_item_id] ?? ""} onChange={(e) => setAllocations({ ...allocations, [it.request_item_id]: e.target.value })} />
                    ) : (it.quantity_approved ?? "-")}
                  </td>
                  <td>{it.remarks || "-"}</td>
                  <td className="fw-bold">{stockByItem[it.item_id] ?? "-"}</td>
                  <td className="d-flex gap-2">
                    {canManage && sr.status === "PENDING" && <>
                      <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setModal({ mode: "edit", record: it })}>Edit</button>
                      <button className="btn btn-sm btn-outline-danger fw-bold" onClick={() => setToDelete(it)}>Delete</button>
                    </>}
                  </td>
                </tr>
              ))}
              {sr.items.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-3">No items on this request.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {canVerifyAllocate && sr.status === "PENDING" && (
        <div className="sf-card mt-3">
          {!showsItems && (
            <p className="text-secondary fw-semibold">
              This is a cash request — there are no items to allocate.
              {cashBalance !== null && <> Available cash balance: <strong>{cashBalance.toLocaleString()} RWF</strong>.</>}
            </p>
          )}
          <button className="btn btn-sf-primary" onClick={verifyAndSubmit}>Verify & Submit for Approval</button>
        </div>
      )}

      {modal && (
        <FormModal title={modal.mode === "create" ? "Add Requested Item" : "Edit Requested Item"} fields={itemFields}
                   initialValues={modal.record} submitLabel="Submit"
                   onSubmit={submitItem} onClose={() => setModal(null)} />
      )}
      {confirmDisburse && (
        <div className="sf-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !disbursing && setConfirmDisburse(false)}>
          <div className="sf-modal" style={{ width: 560, maxWidth: "95vw" }}>
            <div className="sf-modal-header">
              <h5>Disburse to Household</h5>
              <button type="button" className="sf-modal-close" onClick={() => setConfirmDisburse(false)} aria-label="Close">&times;</button>
            </div>
            <div className="sf-modal-body">
              <p className="fw-semibold">
                {disburseSummaryLines.length
                  ? `This will register exactly what was approved as given to ${household?.code || "the household"}: ${disburseSummaryLines.join(", ")}.`
                  : "This will register the approved assistance as given."}
                {" "}This cannot be adjusted here — it's fixed by the approval.
              </p>
              {approvedAmount > 0 && !looksLikeMomoNumber(household?.phoneNumber) && (
                <p className="text-secondary fw-semibold mb-0">
                  No MTN/Airtel mobile money number found on file for this household — cash can only be handed over externally.
                </p>
              )}
            </div>
            <div className="sf-modal-footer">
              <button type="button" className="btn btn-outline-secondary fw-bold" onClick={() => setConfirmDisburse(false)} disabled={disbursing}>Cancel</button>
              {approvedAmount > 0 && looksLikeMomoNumber(household?.phoneNumber) && (
                <button type="button" className="btn btn-sf-accent" onClick={() => handleDisburse("MOMO")} disabled={disbursing}>
                  {disbursing ? "Sending…" : "Send via Mobile Money"}
                </button>
              )}
              <button type="button" className="btn btn-sf-primary" onClick={() => handleDisburse("EXTERNAL")} disabled={disbursing}>
                {disbursing ? "Recording…" : approvedAmount > 0 ? "Hand Over as Cash (External)" : "Confirm Disbursement"}
              </button>
            </div>
          </div>
        </div>
      )}
      {toDelete && (
        <ConfirmDialog title="Remove Item" message="Remove this item from the request?" onConfirm={deleteItem} onClose={() => setToDelete(null)} />
      )}
      {showAssessment && assessment && (
        <InfoModal title={`Assessment #${assessment.assessment_id}`} width={760} onClose={() => setShowAssessment(false)}>
          <div className="row g-2 fw-bold mb-4">
            <div className="col-md-4">Household: <span className="fw-normal">{household ? household.code : "…"}</span></div>
            <div className="col-md-4">Household Members: <span className="fw-normal">{household ? household.memberCount : "…"}</span></div>
            <div className="col-md-4">Status: <span className={`badge-status badge-${assessment.status}`}>{assessment.status}</span></div>
            <div className="col-md-4">Assessment Date: <span className="fw-normal">{assessment.assessment_date}</span></div>
            <div className="col-md-4">Vulnerability Level: <span className="fw-normal">{assessment.vulnerability_level}</span></div>
            <div className="col-md-4">Impact Level: <span className="fw-normal">{assessment.impact_level}</span></div>
            <div className="col-md-4">House Condition: <span className="fw-normal">{assessment.house_condition}</span></div>
            <div className="col-md-4">Livelihood Condition: <span className="fw-normal">{assessment.livelihood_condition || "-"}</span></div>
            <div className="col-md-4">Displacement Status: <span className="fw-normal">{assessment.displacement_status}</span></div>
            <div className="col-md-4">Current Shelter: <span className="fw-normal">{assessment.current_shelter || "-"}</span></div>
            <div className="col-md-8">Injured / Missing / Deceased: <span className="fw-normal">{assessment.people_injured} / {assessment.people_missing} / {assessment.people_deceased}</span></div>
            <div className="col-12">Notes: <span className="fw-normal">{assessment.assessment_notes || "-"}</span></div>
          </div>

          <h6 className="fw-bold mb-2">Affected Assets</h6>
          <table className="sf-table">
            <thead><tr><th>Asset</th><th>Type</th><th>Damage</th><th>Quantity</th><th>Est. Loss</th></tr></thead>
            <tbody>
              {(assessment.affected_assets || []).map((x) => (
                <tr key={x.affected_asset_id}>
                  <td>{x.asset_name}</td><td>{x.asset_type}</td>
                  <td>{x.damage_status}{x.damage_level ? ` (${x.damage_level})` : ""}</td>
                  <td>{x.quantity} {x.unit}</td><td>{x.estimated_loss ?? "-"}</td>
                </tr>
              ))}
              {(assessment.affected_assets || []).length === 0 && <tr><td colSpan={5} className="text-center text-muted py-3">No affected assets recorded.</td></tr>}
            </tbody>
          </table>
        </InfoModal>
      )}
    </Layout>
  );
}

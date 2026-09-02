import { useState } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import Pagination from "../../components/Pagination";
import FormModal from "../../components/FormModal";
import InfoModal from "../../components/InfoModal";
import useCrud from "../../lib/useCrud";

const isApprovingCash = (v) => v._decision === "APPROVED" && v._requestType === "Cash";

const DECISION_FIELDS = [
  { name: "approved_amount", label: "Approved Cash Amount", type: "number", required: true, showIf: isApprovingCash },
  { name: "remarks", label: "Remarks", type: "textarea" },
];

export default function Approvals() {
  const { data, page, setPage, action } = useCrud("/approvals/pending");
  const [decideModal, setDecideModal] = useState(null); // {requestId, decision, requestType}
  const [detailsRow, setDetailsRow] = useState(null); // the full enriched row, for the Details popup

  async function submitDecision(values) {
    const ok = await action("post", `/approvals/${decideModal.requestId}/decide`,
      { decision: decideModal.decision, approved_amount: values.approved_amount || undefined, remarks: values.remarks || undefined },
      `Request ${decideModal.decision.toLowerCase().replace("_", " ")}`);
    if (ok) setDecideModal(null);
  }

  return (
    <Layout title="Pending Approvals">
      <div className="sf-card">
        <div style={{ overflowX: "auto" }}>
          <table className="sf-table">
            <thead>
              <tr>
                <th>ID</th><th>Household</th><th>Type</th><th>Priority</th><th>Request Date</th>
                <th>Requested By</th><th>Verified By</th><th></th><th style={{ width: 380 }}>Decision</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.request_id}>
                  <td><Link href={`/support-requests/${r.request_id}`} className="fw-bold">#{r.request_id}</Link></td>
                  <td>{r.household_code || "-"}</td>
                  <td>{r.request_type}</td><td>{r.priority}</td><td>{r.request_date}</td>
                  <td>{r.requested_by_user?.name || "-"}</td>
                  <td>{r.verified_by_user ? `${r.verified_by_user.name} (${new Date(r.verified_at).toLocaleDateString()})` : "-"}</td>
                  <td><button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setDetailsRow(r)}>Details</button></td>
                  <td className="d-flex gap-2">
                    <button className="btn btn-sm" style={{ background: "var(--sf-green)", color: "#fff", fontWeight: 700 }} onClick={() => setDecideModal({ requestId: r.request_id, decision: "APPROVED", requestType: r.request_type })}>Approve</button>
                    <button className="btn btn-sm" style={{ background: "var(--sf-red)", color: "#fff", fontWeight: 700 }} onClick={() => setDecideModal({ requestId: r.request_id, decision: "REJECTED", requestType: r.request_type })}>Reject</button>
                    <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={() => setDecideModal({ requestId: r.request_id, decision: "SENT_BACK", requestType: r.request_type })}>Send Back</button>
                  </td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={9} className="text-center text-muted py-3">No pending requests.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={data.total_pages} onChange={setPage} />
      </div>

      {decideModal && (
        <FormModal title={`${decideModal.decision.replace("_", " ")} Request #${decideModal.requestId}`} fields={DECISION_FIELDS}
                   initialValues={{ _decision: decideModal.decision, _requestType: decideModal.requestType }}
                   submitLabel="Submit" onSubmit={submitDecision} onClose={() => setDecideModal(null)} />
      )}

      {detailsRow && (
        <InfoModal title={`What's Being Approved — Request #${detailsRow.request_id}`} width={680} onClose={() => setDetailsRow(null)}>
          <div className="row g-2 fw-bold mb-3">
            <div className="col-md-6">Household: <span className="fw-normal">{detailsRow.household_code || "-"}</span></div>
            <div className="col-md-6">Type: <span className="fw-normal">{detailsRow.request_type}</span></div>
            <div className="col-md-6">Priority: <span className="fw-normal">{detailsRow.priority}</span></div>
            <div className="col-md-6">Request Date: <span className="fw-normal">{detailsRow.request_date}</span></div>
            <div className="col-md-6">Requested By: <span className="fw-normal">{detailsRow.requested_by_user?.name || "-"}</span></div>
            <div className="col-md-6">
              Verified By: <span className="fw-normal">
                {detailsRow.verified_by_user ? `${detailsRow.verified_by_user.name} on ${new Date(detailsRow.verified_at).toLocaleString()}` : "-"}
              </span>
            </div>
            <div className="col-12">Justification: <span className="fw-normal">{detailsRow.justification || "-"}</span></div>
          </div>

          {detailsRow.request_type === "Cash" ? (
            <p className="text-secondary fw-semibold mb-0">
              This is a cash request — there are no items involved. The amount to approve is your decision, informed by the justification above.
            </p>
          ) : (
            <>
              <h6 className="fw-bold mb-2">Items</h6>
              <table className="sf-table">
                <thead><tr><th>Item</th><th>Qty Requested</th><th>Qty Approved (allocated)</th></tr></thead>
                <tbody>
                  {(detailsRow.items || []).map((it, i) => (
                    <tr key={i}>
                      <td>{it.item_name}</td>
                      <td>{it.quantity_requested} {it.unit}</td>
                      <td>{it.quantity_approved ?? "-"} {it.quantity_approved ? it.unit : ""}</td>
                    </tr>
                  ))}
                  {(detailsRow.items || []).length === 0 && <tr><td colSpan={3} className="text-center text-muted py-3">No items on this request.</td></tr>}
                </tbody>
              </table>
            </>
          )}
        </InfoModal>
      )}
    </Layout>
  );
}

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import api from "../../lib/api";
import { useToast } from "../../lib/toast";

export default function DistributionDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { notifyError } = useToast();
  const [d, setD] = useState(null);

  useEffect(() => {
    if (!id) return;
    api.get(`/distributions/${id}`).then((r) => setD(r.data)).catch((err) => notifyError(err, "Could not load distribution"));
  }, [id]);

  if (!d) return <Layout title="Distribution"><div className="sf-card">Loading…</div></Layout>;

  return (
    <Layout title={`Distribution #${d.id}`}>
      <div className="sf-card mb-3">
        <div className="row g-2 fw-bold">
          <div className="col-md-3">Support Request: <span className="fw-normal">#{d.support_request_id}</span></div>
          <div className="col-md-3">Household ID: <span className="fw-normal">{d.household_id}</span></div>
          <div className="col-md-3">Type: <span className="fw-normal">{d.distribution_type}</span></div>
          <div className="col-md-3">Status: <span className={`badge-status badge-${d.status}`}>{d.status}</span></div>
          <div className="col-md-3">Received By: <span className="fw-normal">{d.received_by}</span></div>
          <div className="col-md-3">Receipt Ref: <span className="fw-normal">{d.receipt_reference || "-"}</span></div>
          <div className="col-md-3">Date: <span className="fw-normal">{d.distribution_date}</span></div>
        </div>
      </div>

      {d.cash && (
        <div className="sf-card mb-3">
          <h6 className="fw-bold">Cash Given</h6>
          <p className="fw-semibold mb-0">{d.cash.amount} {d.cash.currency} via {d.cash.payment_method} {d.cash.payment_reference ? `(ref: ${d.cash.payment_reference})` : ""}</p>
        </div>
      )}

      <div className="sf-card">
        <h6 className="fw-bold mb-3">Items Given</h6>
        <table className="sf-table">
          <thead><tr><th>Item ID</th><th>Quantity</th><th>Unit</th><th>Remarks</th></tr></thead>
          <tbody>
            {(d.items || []).map((it) => (
              <tr key={it.item_given_id}><td>{it.item_id}</td><td>{it.quantity}</td><td>{it.unit}</td><td>{it.remarks || "-"}</td></tr>
            ))}
            {(d.items || []).length === 0 && <tr><td colSpan={4} className="text-center text-muted py-3">No items in this distribution.</td></tr>}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

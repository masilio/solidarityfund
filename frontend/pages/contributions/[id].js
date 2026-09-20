import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import FormModal from "../../components/FormModal";
import api from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useAuth } from "../../lib/auth";

const GATEWAY_METHODS = ["BANK", "MOBILE_MONEY_MTN", "MOBILE_MONEY_AIRTEL"];
const ACCOUNT_LABEL = {
  BANK: "Your Bank Account Number",
  MOBILE_MONEY_MTN: "Your MTN Phone Number",
  MOBILE_MONEY_AIRTEL: "Your Airtel Phone Number",
};

export default function ContributionDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { hasPermission } = useAuth();
  const isContributor = hasPermission("RECORD_CONTRIBUTION");
  const { notifySuccess, notifyError } = useToast();
  const [c, setC] = useState(null);
  const [accountDetails, setAccountDetails] = useState(null);
  const [payModal, setPayModal] = useState(false);
  const [checking, setChecking] = useState(false);

  async function load() {
    if (!id) return;
    try {
      await api.post(`/contributions/${id}/check-payment`);
      const res = await api.get(`/contributions/${id}`);
      setC(res.data);
    } catch (err) {
      notifyError(err, "Could not load contribution");
    }
  }
  useEffect(() => { load(); }, [id]);

  const canPay = isContributor && c?.cash && c.cash.payment_status !== "PAID" && GATEWAY_METHODS.includes(c.cash.payment_method);
  // Checking status polls Flutterwave by charge id — only the mobile-money flow has one
  

  const payFields = c?.cash ? [
    { name: "amount", label: "Amount Being Paid", type: "number", required: true },
    { name: "account_number", label: ACCOUNT_LABEL[c.cash.payment_method] || "Account Number", required: true },
  ] : [];

  async function submitPayment(values) {
    try {
      const res = await api.post(`/contributions/${id}/pay`,
        { amount: Number(values.amount), account_number: values.account_number });
      setPayModal(false);
      if (res.data.mode === "virtual_account") {
        notifySuccess(`complete your payment`);
      } else {
        notifySuccess(res.data.message || "Payment initiated");
      }
     
       await load();

        // Keep checking until payment status changes
        let attempts = 0;
        const maxAttempts = 12;

        const interval = setInterval(async () => {
      attempts++;

          try {
            await load();

            if (attempts >= maxAttempts) {
              clearInterval(interval);
            }
          } catch (err) {
            clearInterval(interval);
          }
        }, 5000);

    } catch (err) {
      notifyError(err, "Could not start the payment");
    }
  }



  if (!c) return <Layout title="Contribution"><div className="sf-card">Loading…</div></Layout>;

  return (
    <Layout title={`Contribution #${c.contribution_id}`}>
      <div className="sf-card mb-3">
        <div className="row g-2 fw-bold">
          <div className="col-md-3">Contributor ID: <span className="fw-normal">{c.contributor_id}</span></div>
          <div className="col-md-3">Date: <span className="fw-normal">{c.contribution_date}</span></div>
          <div className="col-md-3">Status: <span className={`badge-status badge-${c.verification_status}`}>{c.verification_status}</span></div>
          <div className="col-md-3">Type: <span className="fw-normal">{c.cash ? "Cash Contribution" : "Item Contribution"}</span></div>
          <div className="col-12">Remarks: <span className="fw-normal">{c.remarks || "-"}</span></div>
        </div>
      </div>

      {c.cash && (
        <div className="sf-card mb-3">
          <h6 className="fw-bold mb-3">Cash Contribution</h6>
          <div className="row g-2 fw-bold mb-3">
            <div className="col-md-4">Amount Declared: <span className="fw-normal">{c.cash.amount.toLocaleString()} {c.cash.currency}</span></div>
            <div className="col-md-4">Payment Method: <span className="fw-normal">{c.cash.payment_method}</span></div>
            <div className="col-md-4">Payment Status: {c.cash.payment_status === "PAID" ? <span className="badge-status badge-CONFIRMED">Paid</span> : <span className="badge-status badge-PENDING">Unpaid</span>}</div>
            <div className="col-md-4">Payment Reference: <span className="fw-normal">{c.cash.transaction_reference || "-"}</span></div>
            <div className="col-md-4">Amount Paid: <span className="fw-normal">{c.cash.amount_paid != null ? `${c.cash.amount_paid.toLocaleString()} ${c.cash.currency}` : "-"}</span></div>
            <div className="col-md-4">Paid At: <span className="fw-normal">{c.cash.paid_at ? new Date(c.cash.paid_at).toLocaleString() : "-"}</span></div>
          </div>

          {c.cash.virtual_account_number && c.cash.payment_status !== "PAID" && (
            <div className="sf-card mb-3" style={{ background: "var(--sf-grey-bg)" }}>
              <p className="fw-bold mb-1">Transfer to complete this payment:</p>
              <p className="fw-bold mb-0" style={{ fontSize: "1.1rem" }}>{c.cash.virtual_account_number}</p>
            </div>
          )}

          {canPay && accountDetails && (
            <div className="sf-card mb-3" style={{ background: "var(--sf-grey-bg)" }}>
              <p className="fw-bold mb-2">Or send payment yourself to:</p>
              <div className="row g-2 fw-semibold">
                <div className="col-md-4">Bank Account: <span className="fw-bold">{accountDetails.bank}</span></div>
                <div className="col-md-4">MoMo — MTN: <span className="fw-bold">{accountDetails.momo_mtn}</span></div>
                <div className="col-md-4">MoMo — Airtel: <span className="fw-bold">{accountDetails.momo_airtel}</span></div>
              </div>
            </div>
          )}

          <div className="d-flex gap-2 flex-wrap">
            {canPay && <button className="btn btn-sf-accent" onClick={() => setPayModal(true)}>Process Payment</button>}
          
          </div>
        </div>
      )}

      {(c.items || []).length > 0 && (
        <div className="sf-card">
          <h6 className="fw-bold mb-3">Item Contribution</h6>
          <table className="sf-table">
            <thead><tr><th>Item ID</th><th>Quantity</th><th>Unit</th><th>Condition</th><th>Remarks</th></tr></thead>
            <tbody>
              {c.items.map((it) => (
                <tr key={it.item_contribution_id}>
                  <td>{it.item_id}</td><td>{it.quantity}</td><td>{it.unit}</td><td>{it.condition || "-"}</td><td>{it.remarks || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payModal && (
        <FormModal title="Process Payment" fields={payFields} initialValues={{ amount: c.cash.amount }}
                   submitLabel="Submit Payment" onSubmit={submitPayment} onClose={() => setPayModal(false)} />
      )}
    </Layout>
  );
}

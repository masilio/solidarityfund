import { useEffect, useState } from "react";
import Layout from "../../components/Layout";
import api from "../../lib/api";

export default function Reports() {
  const [types, setTypes] = useState([]);
  const [key, setKey] = useState("");
  const [format, setFormat] = useState("pdf");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/reports/types").then((r) => { setTypes(r.data); if (r.data[0]) setKey(r.data[0].key); });
  }, []);

  async function download() {
    setLoading(true);
    try {
      const res = await api.get(`/reports/${key}`, {
        params: { format, status: status || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      const ext = { pdf: "pdf", excel: "xlsx", word: "docx" }[format];
      a.href = url; a.download = `${key}.${ext}`; a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Could not generate report");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="Reports">
      <div className="sf-card" style={{ maxWidth: 640 }}>
        <div className="mb-3">
          <label className="form-label fw-bold">Report</label>
          <select className="form-select" value={key} onChange={(e) => setKey(e.target.value)}>
            {types.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}
          </select>
        </div>
        <div className="row g-3 mb-3">
          <div className="col-md-4">
            <label className="form-label fw-bold">Status filter</label>
            <input className="form-control" placeholder="e.g. APPROVED" value={status} onChange={(e) => setStatus(e.target.value)} />
          </div>
          <div className="col-md-4">
            <label className="form-label fw-bold">From date</label>
            <input className="form-control" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="col-md-4">
            <label className="form-label fw-bold">To date</label>
            <input className="form-control" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="mb-4">
          <label className="form-label fw-bold d-block">Export format</label>
          {["pdf", "excel", "word"].map((f) => (
            <div className="form-check form-check-inline" key={f}>
              <input className="form-check-input" type="radio" name="fmt" checked={format === f} onChange={() => setFormat(f)} />
              <label className="form-check-label text-uppercase fw-bold">{f}</label>
            </div>
          ))}
        </div>
        <button className="btn btn-sf-primary" disabled={loading || !key} onClick={download}>
          {loading ? "Generating…" : "Generate & Download"}
        </button>
      </div>
    </Layout>
  );
}

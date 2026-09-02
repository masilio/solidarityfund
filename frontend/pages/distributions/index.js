import Link from "next/link";
import Layout from "../../components/Layout";
import Pagination from "../../components/Pagination";
import useCrud from "../../lib/useCrud";

export default function Distributions() {
  const { data, page, setPage } = useCrud("/distributions");

  return (
    <Layout title="Distributions">
      <div className="sf-card">
        <p className="text-secondary fw-semibold">
          Assistance already handed over to households 
        </p>
        <table className="sf-table">
          <thead><tr><th>ID</th><th>Household ID</th><th>Type</th><th>Received By</th><th>Date</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {data.items.map((d) => (
              <tr key={d.id}>
                <td>#{d.id}</td><td>{d.household_id}</td><td>{d.distribution_type}</td>
                <td>{d.received_by}</td><td>{d.distribution_date}</td>
                <td><span className={`badge-status badge-${d.status}`}>{d.status}</span></td>
                <td><Link href={`/distributions/${d.id}`} className="btn btn-sm btn-sf-primary">View</Link></td>
              </tr>
            ))}
            {data.items.length === 0 && <tr><td colSpan={7} className="text-center text-muted py-3">No distributions recorded yet.</td></tr>}
          </tbody>
        </table>
        <Pagination page={page} totalPages={data.total_pages} onChange={setPage} />
      </div>
    </Layout>
  );
}

import Layout from "../components/Layout";
import { useAuth } from "../lib/auth";
import Link from "next/link";

const CARDS = [
  { href: "/disasters", label: "Disasters", desc: "Record and manage disaster/incident events.", perms: ["REGISTER_BENEFICIARY", "SUBMIT_SUPPORT_REQUEST"] },
  { href: "/households", label: "Households", desc: "Register affected households and their members.", perms: ["REGISTER_BENEFICIARY", "VERIFY_SUPPORT_REQUEST", "ALLOCATE_SUPPORT_REQUEST", "APPROVE_SUPPORT_REQUEST", "SUBMIT_SUPPORT_REQUEST", "VIEW_REQUEST_HISTORY"] },
  { href: "/assessments", label: "Assessments", desc: "Record impact assessments and affected assets.", perms: ["REGISTER_BENEFICIARY", "VERIFY_SUPPORT_REQUEST", "ALLOCATE_SUPPORT_REQUEST", "APPROVE_SUPPORT_REQUEST", "SUBMIT_SUPPORT_REQUEST", "VIEW_REQUEST_HISTORY"] },
  { href: "/support-requests", label: "Support Requests", desc: "Submit, verify and allocate assistance.", perms: ["SUBMIT_SUPPORT_REQUEST", "VIEW_REQUEST_HISTORY", "VERIFY_SUPPORT_REQUEST", "ALLOCATE_SUPPORT_REQUEST", "APPROVE_SUPPORT_REQUEST", "DISBURSE_SUPPORT"] },
  { href: "/approvals", label: "Approvals", desc: "Review and decide on submitted requests.", perms: ["APPROVE_SUPPORT_REQUEST"] },
  { href: "/distributions", label: "Distributions", desc: "View assistance already disbursed to households.", perms: ["DISBURSE_SUPPORT", "VIEW_REQUEST_HISTORY", "APPROVE_SUPPORT_REQUEST"] },
  { href: "/contributions", label: "Contributions", desc: "Record and confirm cash/item contributions.", perms: ["RECORD_CONTRIBUTION", "VIEW_CONTRIBUTION", "CONFIRM_CONTRIBUTION"] },
  { href: "/inventory", label: "Items & Inventory", desc: "Manage items, categories, stock and the fund ledger.", perms: ["MANAGE_INVENTORY", "VERIFY_SUPPORT_REQUEST", "ALLOCATE_SUPPORT_REQUEST"] },
  { href: "/reports", label: "Reports", desc: "Export PDF, Excel or Word reports with filters.", perms: ["VIEW_REPORTS"] },
  { href: "/users", label: "Users & Roles", desc: "Manage accounts, roles and permissions.", perms: ["MANAGE_USERS", "ASSIGN_ROLES", "ASSIGN_PERMISSIONS"] },
  { href: "/audit-log", label: "Audit Log", desc: "Review the full trail of system activity.", perms: ["VIEW_AUDIT_LOGS"] },
];

export default function Dashboard() {
  const { user, hasPermission } = useAuth();
  const visible = CARDS.filter((card) => hasPermission(...card.perms));
  const canRegister = hasPermission("REGISTER_BENEFICIARY");

  return (
    <Layout title={`Welcome, ${user?.name || ""}`}>
      {canRegister && (
        <Link href="/households/register" className="text-decoration-none">
          <div className="sf-card mb-3 d-flex justify-content-between align-items-center flex-wrap gap-2"
               style={{ background: "var(--sf-navy)", color: "#fff" }}>
            <div>
              <h5 className="mb-1 fw-bold">Register a New Case</h5>
              <p className="mb-0 fw-semibold" style={{ opacity: .9 }}>
          
              </p>
            </div>
            <span className="btn btn-sf-accent">Start &rarr;</span>
          </div>
        </Link>
      )}
      <div className="row g-3">
        {visible.map((c) => (
          <div className="col-md-4" key={c.href}>
            <Link href={c.href} className="text-decoration-none">
              <div className="sf-card h-100">
                <h5 style={{ color: "var(--sf-navy)", fontWeight: 800 }}>{c.label}</h5>
                <p className="text-secondary fw-semibold mb-0">{c.desc}</p>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </Layout>
  );
}

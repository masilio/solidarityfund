import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../lib/auth";

// permissions set to links
const LINKS = [
  { href: "/dashboard", label: "Dashboard", perms: null },
  { href: "/disasters", label: "Disasters", perms: ["REGISTER_BENEFICIARY", "SUBMIT_SUPPORT_REQUEST"] },
  { href: "/households", label: "Households", perms: ["REGISTER_BENEFICIARY", "VERIFY_SUPPORT_REQUEST", "ALLOCATE_SUPPORT_REQUEST", "APPROVE_SUPPORT_REQUEST", "SUBMIT_SUPPORT_REQUEST", "VIEW_REQUEST_HISTORY"] },
  { href: "/assessments", label: "Assessments", perms: ["REGISTER_BENEFICIARY", "VERIFY_SUPPORT_REQUEST", "ALLOCATE_SUPPORT_REQUEST", "APPROVE_SUPPORT_REQUEST", "SUBMIT_SUPPORT_REQUEST", "VIEW_REQUEST_HISTORY"] },
  { href: "/support-requests", label: "Support Requests", perms: ["SUBMIT_SUPPORT_REQUEST", "VIEW_REQUEST_HISTORY", "VERIFY_SUPPORT_REQUEST", "ALLOCATE_SUPPORT_REQUEST", "APPROVE_SUPPORT_REQUEST", "DISBURSE_SUPPORT"] },
  { href: "/approvals", label: "Approvals", perms: ["APPROVE_SUPPORT_REQUEST"] },
  { href: "/distributions", label: "Distributions", perms: ["DISBURSE_SUPPORT", "VIEW_REQUEST_HISTORY", "APPROVE_SUPPORT_REQUEST"] },
  { href: "/contributions", label: "Contributions", perms: ["RECORD_CONTRIBUTION", "VIEW_CONTRIBUTION", "CONFIRM_CONTRIBUTION"] },
  { href: "/inventory", label: "Items & Inventory", perms: ["MANAGE_INVENTORY", "VERIFY_SUPPORT_REQUEST", "ALLOCATE_SUPPORT_REQUEST"] },
  { href: "/reports", label: "Reports", perms: ["VIEW_REPORTS"] },
  { href: "/users", label: "Users & Roles", perms: ["MANAGE_USERS", "ASSIGN_ROLES", "ASSIGN_PERMISSIONS"] },
  { href: "/audit-log", label: "Audit Log", perms: ["VIEW_AUDIT_LOGS"] },
];

export default function Sidebar({ open = false, onClose }) {
  const router = useRouter();
  const { hasPermission } = useAuth();

  return (
    <nav className={`sf-sidebar ${open ? "sf-sidebar-open" : ""}`}>
      <div className="brand">Solidarity Fund</div>
      {LINKS.filter((l) => !l.perms || hasPermission(...l.perms)).map((l) => (
        <Link key={l.href} href={l.href} onClick={onClose} className={router.pathname.startsWith(l.href) ? "active" : ""}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

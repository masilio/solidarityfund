"""
The permission catalog and each role's default permission set. Seeded into the
Permission/RolePermission tables by app/seed.py; require_permissions() in app/deps.py is
what actually enforces this at request time.

Roles: ADMINISTRATOR, RESPONSE_MANAGER, RESOURCE_MANAGER, CONTRIBUTOR. ADMINISTRATOR
always passes every permission check regardless of what's seeded here (see deps.py) — the
seeded ADMINISTRATOR row below exists so the row shows up in the UI's permission matrix,
not because it's needed for the bypass to work.

APPROVE_SUPPORT_REQUEST deliberately has no default role — approving isn't tied to a job
title here, it's an elevated capability an administrator grants to specific individuals
(e.g. a senior resource manager) via user-level permissions, which is exactly the "same
role, different permissions" scenario this system exists to support.
"""

PERMISSIONS: list[tuple[str, str]] = [
    ("MANAGE_USERS", "Create, view, update, delete, lock and unlock user accounts"),
    ("ASSIGN_ROLES", "Assign or remove roles for users"),
    ("ASSIGN_PERMISSIONS", "Assign or remove individual permissions for users"),
    ("VIEW_AUDIT_LOGS", "View the system audit log"),
    ("RECORD_CONTRIBUTION", "Record a new contribution"),
    ("VIEW_CONTRIBUTION", "View contributions"),
    ("CONFIRM_CONTRIBUTION", "Check and confirm a contribution's receipt/payment"),
    ("MANAGE_INVENTORY", "Manage item categories, items, fund inventory, stock movements and the fund ledger"),
    ("REGISTER_BENEFICIARY", "Register households, household members, assessments and affected assets"),
    ("SUBMIT_SUPPORT_REQUEST", "Submit a support request for a household"),
    ("VIEW_REQUEST_HISTORY", "View support request history"),
    ("VERIFY_SUPPORT_REQUEST", "Verify a submitted support request"),
    ("ALLOCATE_SUPPORT_REQUEST", "Allocate resources to a support request"),
    ("SUBMIT_FOR_APPROVAL", "Submit a verified request onward for approval"),
    ("APPROVE_SUPPORT_REQUEST", "Approve, reject or send back a support request"),
    ("DISBURSE_SUPPORT", "Distribute approved support to a household"),
    ("VIEW_REPORTS", "Generate and view reports"),
]

ALL_CODES = [code for code, _ in PERMISSIONS]

DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "ADMINISTRATOR": ALL_CODES,
    "RESPONSE_MANAGER": ["REGISTER_BENEFICIARY", "SUBMIT_SUPPORT_REQUEST", "VIEW_REQUEST_HISTORY", "VIEW_REPORTS"],
    "RESOURCE_MANAGER": ["VIEW_CONTRIBUTION", "CONFIRM_CONTRIBUTION", "MANAGE_INVENTORY", "VERIFY_SUPPORT_REQUEST",
                         "ALLOCATE_SUPPORT_REQUEST", "SUBMIT_FOR_APPROVAL", "DISBURSE_SUPPORT",
                         "VIEW_REQUEST_HISTORY", "VIEW_REPORTS"],
    "CONTRIBUTOR": ["RECORD_CONTRIBUTION", "VIEW_CONTRIBUTION"],
}

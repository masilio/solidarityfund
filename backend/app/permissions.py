

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

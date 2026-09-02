"""
All persistence models in one module, grouped by domain, to keep the codebase
small and easy to navigate. Each class maps 1:1 to a table from the data
dictionary. Enums are plain strings validated at the API layer (schemas.py)
so the DB stays simple and portable.
"""
from datetime import datetime, date
from typing import Optional
from sqlmodel import SQLModel, Field


# ---------- Identity & access ----------

class Role(SQLModel, table=True):
    role_id: Optional[int] = Field(default=None, primary_key=True)
    role_name: str = Field(unique=True, index=True)  # ADMINISTRATOR, RESPONSE_MANAGER, RESOURCE_MANAGER, CONTRIBUTOR
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class User(SQLModel, table=True):
    user_id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    password_hash: str
    first_name: str
    last_name: str
    phone_number: Optional[str] = None
    status: str = Field(default="ACTIVE")  # ACTIVE, LOCKED, DISABLED
    last_login_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


class UserRole(SQLModel, table=True):
    user_role_id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.user_id", index=True)
    role_id: int = Field(foreign_key="role.role_id", index=True)
    assigned_at: datetime = Field(default_factory=datetime.utcnow)


# --- Permissions (not in the original schema — added so two users can hold the same role
# but different capabilities, per an explicit request for that). A role has a default set of
# permissions (RolePermission); a user's effective permissions are that default set, with any
# of their own UserPermission rows applied on top — granted=True adds a permission the role
# wouldn't otherwise give them, granted=False revokes one the role would. Only the rows that
# differ from the role default are ever stored, so a user with no overrides has none. ---

class Permission(SQLModel, table=True):
    permission_id: Optional[int] = Field(default=None, primary_key=True)
    permission_code: str = Field(unique=True, index=True)
    description: Optional[str] = None


class RolePermission(SQLModel, table=True):
    role_permission_id: Optional[int] = Field(default=None, primary_key=True)
    role_id: int = Field(foreign_key="role.role_id", index=True)
    permission_id: int = Field(foreign_key="permission.permission_id", index=True)


class UserPermission(SQLModel, table=True):
    user_permission_id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.user_id", index=True)
    permission_id: int = Field(foreign_key="permission.permission_id", index=True)
    granted: bool = Field(default=True)  # True = explicitly granted beyond the role default; False = explicitly revoked
    assigned_by: Optional[int] = Field(default=None, foreign_key="user.user_id")
    assigned_at: datetime = Field(default_factory=datetime.utcnow)


# ---------- Disasters & beneficiaries ----------

class Disaster(SQLModel, table=True):
    disaster_id: Optional[int] = Field(default=None, primary_key=True)
    disaster_name: str
    disaster_type: str
    description: Optional[str] = None
    start_date: date
    end_date: Optional[date] = None
    declared_date: Optional[date] = None
    status: str = Field(default="ACTIVE")
    created_by: int = Field(foreign_key="user.user_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


class Household(SQLModel, table=True):
    household_id: Optional[int] = Field(default=None, primary_key=True)
    household_code: str = Field(unique=True, index=True)
    phone_number: Optional[str] = None
    alternative_phone: Optional[str] = None
    district: str
    sector: str
    cell: str
    village: str
    address_details: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    housing_status: Optional[str] = None
    status: str = Field(default="ACTIVE")
    created_by: int = Field(foreign_key="user.user_id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


class HouseholdMember(SQLModel, table=True):
    member_id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="household.household_id", index=True)
    first_name: str
    middle_name: Optional[str] = None
    last_name: str
    national_id: Optional[str] = Field(default=None, unique=True)
    gender: str
    date_of_birth: date
    relationship_to_head: str
    marital_status: Optional[str] = None
    phone_number: Optional[str] = None
    disability_status: Optional[str] = None
    vulnerability_status: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


# ---------- Assessment ----------

class Assessment(SQLModel, table=True):
    assessment_id: Optional[int] = Field(default=None, primary_key=True)
    household_id: int = Field(foreign_key="household.household_id", index=True)
    disaster_id: int = Field(foreign_key="disaster.disaster_id", index=True)
    assessed_by: int = Field(foreign_key="user.user_id")
    assessment_date: date
    vulnerability_level: str
    impact_level: str
    house_condition: str
    livelihood_condition: Optional[str] = None
    displacement_status: str
    current_shelter: Optional[str] = None
    people_injured: int = 0
    people_missing: int = 0
    people_deceased: int = 0
    assessment_notes: Optional[str] = None
    status: str = Field(default="PENDING")  # PENDING, VERIFIED
    verified_by: Optional[int] = Field(default=None, foreign_key="user.user_id")
    verified_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


class AffectedAsset(SQLModel, table=True):
    affected_asset_id: Optional[int] = Field(default=None, primary_key=True)
    assessment_id: int = Field(foreign_key="assessment.assessment_id", index=True)
    asset_name: str
    asset_type: str
    damage_status: str
    damage_level: Optional[str] = None
    quantity: float
    unit: str
    estimated_loss: Optional[float] = None
    description: Optional[str] = None


# ---------- Support requests & approvals ----------

class SupportRequest(SQLModel, table=True):
    request_id: Optional[int] = Field(default=None, primary_key=True)
    assessment_id: int = Field(foreign_key="assessment.assessment_id", index=True)
    requested_by: int = Field(foreign_key="user.user_id")
    request_type: str  # CASH, MATERIAL, SERVICE
    priority: str = Field(default="NORMAL")
    justification: Optional[str] = None
    request_date: date
    # PENDING -> SUBMITTED_FOR_APPROVAL (resource mgmt verified/allocated) -> APPROVED/REJECTED (loops to
    # PENDING on SENT_BACK) -> DISBURSED. Who verified/approved and any cash amount decided live in
    # audit_log and approval.approved_amount respectively — no extra columns beyond the schema.
    status: str = Field(default="PENDING", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


class SupportRequestItem(SQLModel, table=True):
    request_item_id: Optional[int] = Field(default=None, primary_key=True)
    request_id: int = Field(foreign_key="supportrequest.request_id", index=True)
    item_id: int = Field(foreign_key="item.item_id")
    quantity_requested: float
    quantity_approved: Optional[float] = None
    remarks: Optional[str] = None


class Approval(SQLModel, table=True):
    approval_id: Optional[int] = Field(default=None, primary_key=True)
    request_id: int = Field(foreign_key="supportrequest.request_id", index=True)
    approved_by: int = Field(foreign_key="user.user_id")
    approval_status: str  # APPROVED, REJECTED, SENT_BACK
    approved_amount: Optional[float] = None
    approval_date: datetime = Field(default_factory=datetime.utcnow)
    remarks: Optional[str] = None


# ---------- Contributors & contributions ----------

class Contributor(SQLModel, table=True):
    contributor_id: Optional[int] = Field(default=None, primary_key=True)
    contributor_name: str
    contributor_type: str  # GOVERNMENT, NGO, COMPANY, INDIVIDUAL
    phone_number: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None
    # Not in the original schema — links a self-service contributor (registered via the public
    # landing page's Donate form) to the User account they log in with, so "make a new
    # contribution" can identify who they're contributing as automatically instead of asking
    # them to pick themselves from a list. Nullable + unique: a contributor org added directly
    # by staff has no login of its own and stays unlinked; at most one Contributor per User.
    user_id: Optional[int] = Field(default=None, foreign_key="user.user_id", unique=True)


class FundContribution(SQLModel, table=True):
    contribution_id: Optional[int] = Field(default=None, primary_key=True)
    contributor_id: int = Field(foreign_key="contributor.contributor_id", index=True)
    contribution_date: date
    verification_status: str = Field(default="PENDING", index=True)  # PENDING, CONFIRMED, REJECTED
    verified_by: Optional[int] = Field(default=None, foreign_key="user.user_id")
    verified_at: Optional[datetime] = None
    remarks: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CashContribution(SQLModel, table=True):
    cash_contribution_id: Optional[int] = Field(default=None, primary_key=True)
    contribution_id: int = Field(foreign_key="fundcontribution.contribution_id", index=True)
    amount: float
    currency: str = Field(default="RWF")
    payment_method: str  # BANK, MOBILE_MONEY_MTN, MOBILE_MONEY_AIRTEL, CASH, CHEQUE
    transaction_reference: Optional[str] = Field(default=None, unique=True)
    remarks: Optional[str] = None
    # --- Payment gateway lifecycle (not in the original schema — added specifically for the
    # sandbox payment gateway integration, so a contributor's self-reported "here's my cash
    # contribution" can be separately tracked as actually paid or still pending). ---
    payment_status: str = Field(default="PENDING")  # PENDING, PAID
    amount_paid: Optional[float] = None
    paid_at: Optional[datetime] = None
    gateway: Optional[str] = None  # FLUTTERWAVE (paid via the gateway) or MANUAL (staff-recorded)
    gateway_charge_id: Optional[str] = None  # Flutterwave v4 charge id (MoMo) — how /check-payment looks it up
    virtual_account_number: Optional[str] = None  # for BANK: the generated account to transfer into


class ItemContribution(SQLModel, table=True):
    item_contribution_id: Optional[int] = Field(default=None, primary_key=True)
    contribution_id: int = Field(foreign_key="fundcontribution.contribution_id", index=True)
    item_id: int = Field(foreign_key="item.item_id")
    quantity: float
    unit: str
    condition: Optional[str] = None
    remarks: Optional[str] = None


# ---------- Items, inventory & ledger ----------

class ItemCategory(SQLModel, table=True):
    category_id: Optional[int] = Field(default=None, primary_key=True)
    category_name: str = Field(unique=True)
    description: Optional[str] = None
    status: str = Field(default="ACTIVE")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


class Item(SQLModel, table=True):
    item_id: Optional[int] = Field(default=None, primary_key=True)
    category_id: int = Field(foreign_key="itemcategory.category_id")
    item_name: str
    unit_of_measure: str
    description: Optional[str] = None
    status: str = Field(default="ACTIVE")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None


class FundInventory(SQLModel, table=True):
    inventory_id: Optional[int] = Field(default=None, primary_key=True)
    item_id: int = Field(foreign_key="item.item_id", unique=True)
    quantity_available: float = Field(default=0)
    reorder_level: float = Field(default=0)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class StockMovement(SQLModel, table=True):
    movement_id: Optional[int] = Field(default=None, primary_key=True)
    item_id: int = Field(foreign_key="item.item_id", index=True)
    movement_type: str  # IN, OUT
    quantity: float
    movement_date: datetime = Field(default_factory=datetime.utcnow)
    recorded_by: int = Field(foreign_key="user.user_id")
    # Schema names these donation_id / distribution_item_id; the closest concrete records we have are
    # the per-item lines of a contribution or a distribution, so that's what they point to.
    contribution_id: Optional[int] = Field(default=None, foreign_key="itemcontribution.item_contribution_id")
    distribution_item_id: Optional[int] = Field(default=None, foreign_key="itemsupport.item_given_id")
    remarks: Optional[str] = None


class FundLedger(SQLModel, table=True):
    cash_transaction_id: Optional[int] = Field(default=None, primary_key=True)
    transaction_type: str  # IN, OUT
    amount: float
    currency: str = Field(default="RWF")
    transaction_date: datetime = Field(default_factory=datetime.utcnow)
    reference_type: str  # CONTRIBUTION, SUPPORT
    reference_id: Optional[int] = None
    payment_method: str  # BANK, MOBILE_MONEY, CASH, CHEQUE
    recorded_by: int = Field(foreign_key="user.user_id")
    remarks: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------- Distribution to households ----------

class FundSupport(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    support_request_id: int = Field(foreign_key="supportrequest.request_id", index=True)
    household_id: int = Field(foreign_key="household.household_id", index=True)
    distribution_date: date
    distribution_type: str  # CASH, MATERIAL, BOTH
    distributed_by: int = Field(foreign_key="user.user_id")
    received_by: str
    receipt_reference: Optional[str] = Field(default=None, unique=True)
    status: str = Field(default="PENDING")  # PENDING, COMPLETED, CANCELLED
    remarks: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CashSupport(SQLModel, table=True):
    cash_given_id: Optional[int] = Field(default=None, primary_key=True)
    distribution_id: int = Field(foreign_key="fundsupport.id", index=True)
    amount: float
    currency: str = Field(default="RWF")
    payment_method: str
    payment_reference: Optional[str] = None
    remarks: Optional[str] = None
    # --- Payout channel (not in the original schema — added for the sandbox payment gateway
    # integration): cash support can be sent to the household's mobile money account via the
    # gateway, or handed over outside the system (physical cash / an external transfer staff
    # arrange themselves), tracked the same way a contribution's inbound payment is. ---
    payout_method: str = Field(default="EXTERNAL")  # MOMO or EXTERNAL
    payout_status: str = Field(default="COMPLETED")  # PENDING, COMPLETED, FAILED
    payout_reference: Optional[str] = None


class ItemSupport(SQLModel, table=True):
    item_given_id: Optional[int] = Field(default=None, primary_key=True)
    distribution_id: int = Field(foreign_key="fundsupport.id", index=True)
    item_id: int = Field(foreign_key="item.item_id")
    quantity: float
    unit: str
    remarks: Optional[str] = None


# ---------- Audit ----------

class AuditLog(SQLModel, table=True):
    audit_log_id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, foreign_key="user.user_id")
    action: str  # CREATE, UPDATE, DELETE, VERIFY, APPROVE, REJECT, LOGIN, LOGOUT, LOCK, UNLOCK
    table_name: str
    record_id: Optional[int] = None
    description: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

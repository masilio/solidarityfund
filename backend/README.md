# Solidarity Fund — Backend (FastAPI + SQLModel + PostgreSQL)

## Setup
```bash
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # edit DATABASE_URL, JWT_SECRET, admin creds
createdb solidarity_fund                               # or create it in psql/pgAdmin
uvicorn app.main:app --reload --port 8000
```
On first startup the app creates all tables and seeds the 4 roles
(ADMINISTRATOR, RESPONSE_MANAGER, RESOURCE_MANAGER, CONTRIBUTOR), the
17-permission catalog and each role's default permissions (see below),
plus one administrator account using ADMIN_EMAIL / ADMIN_PASSWORD from
`.env`. **Change that password after first login.**

Docs: http://localhost:8000/docs

## Roles + permissions — two users, same role, different capabilities
Authorization has two layers, deliberately decoupled:
- **Roles** (`role`/`user_role`, from the original schema) are still what
  a user *is* — ADMINISTRATOR, RESPONSE_MANAGER, RESOURCE_MANAGER,
  CONTRIBUTOR.
- **Permissions** (`Permission`/`RolePermission`/`UserPermission` in
  `app/models.py` — new, not in the original schema, added specifically
  for this) are what a user *can do*. Each role grants a default set of
  permissions (`app/permissions.py`'s `DEFAULT_ROLE_PERMISSIONS`); an
  administrator can then grant a user a permission their role wouldn't
  normally give them, or revoke one it would, via `UserPermission` rows.
  Only the rows that actually differ from the role default are ever
  stored — a user with no overrides has none, and `GET /users/{id}`
  shows exactly which permissions are in effect either way.

`app/deps.py`'s `require_permissions(...)` (all of the given codes) and
`require_any_permission(...)` (any one of them) are what every route
actually checks — not role names. `require_roles(...)` still exists for
the rare case that's genuinely about identity rather than capability, but
no router uses it anymore. ADMINISTRATOR always passes every check,
regardless of what's seeded for it.

The 17 permission codes (`app/permissions.py`, with descriptions):
`MANAGE_USERS`, `ASSIGN_ROLES`, `ASSIGN_PERMISSIONS`, `VIEW_AUDIT_LOGS`,
`RECORD_CONTRIBUTION`, `VIEW_CONTRIBUTION`, `CONFIRM_CONTRIBUTION`,
`MANAGE_INVENTORY`, `REGISTER_BENEFICIARY`, `SUBMIT_SUPPORT_REQUEST`,
`VIEW_REQUEST_HISTORY`, `VERIFY_SUPPORT_REQUEST`,
`ALLOCATE_SUPPORT_REQUEST`, `SUBMIT_FOR_APPROVAL`,
`APPROVE_SUPPORT_REQUEST`, `DISBURSE_SUPPORT`, `VIEW_REPORTS`.

**`APPROVE_SUPPORT_REQUEST` deliberately has no default role.** Approving
isn't tied to a job title here — there's no more "Approver" role at all
(the earlier 5-role version of this system had one; it's gone). An
administrator grants it to specific individuals — e.g. a senior resource
manager, but not every resource manager — which is the clearest possible
example of what this whole system exists to support.

**Endpoints**: `PUT /users/{id}/roles` (needs `ASSIGN_ROLES`) replaces a
user's role assignments; `PUT /users/{id}/permissions` (needs
`ASSIGN_PERMISSIONS`), payload `{"permission_codes": [...]}`, takes the
*full* desired effective set and computes the minimal diff against role
defaults itself. `GET /users/permissions` lists the catalog for building
a permission-assignment UI. `GET /auth/me` returns the caller's own
`roles` and `permissions` (or the string `"ALL"` for an administrator,
rather than spelling out all 17) — this is what the frontend uses to
decide what to show, not a hardcoded role check.

## Public self-registration creates a linked Contributor, not just a User
`POST /auth/register` needs no auth — payload `{contributor_name,
contributor_type, email, password, phone_number?, address?}`, the same
shape as the Contributor form on the Contributions page (see
`app/routers/contributions.py`'s `CONTRIBUTOR_FIELDS`-equivalent), plus a
password. It creates **two** rows in one call: a `User` (how they log
in — `first_name`/`last_name` are derived by splitting `contributor_name`,
since the schema requires them but this form doesn't collect them
separately) with the CONTRIBUTOR role, and a `Contributor` (the
organization/individual actually giving) linked to that user via
`Contributor.user_id` — a field not in the original schema, added
specifically so the system can tell "this login" and "this donor" are the
same entity. There's no way to request a staff role through this
endpoint; anyone needing one is created by an administrator via
`POST /users` instead.

**What the link changes elsewhere:**
- `GET /auth/me` and `POST /auth/login` both return `contributor: {id,
  name} | null`. The frontend uses this to skip asking a linked
  contributor which Contributor they're submitting as — see
  `POST /contributions`.
- `POST /contributions` takes `contributor_id` from the caller's own
  link when they have one, **ignoring anything sent in the payload** — a
  self-service contributor can only ever submit as themselves. Only a
  contributor-role account with no personal link (e.g. one an
  administrator added directly, representing an org with no individual
  login of its own) needs to pass `contributor_id` explicitly.
- `GET /contributions` scopes the list to a linked contributor's own
  records; staff (holding `CONFIRM_CONTRIBUTION`, who have no personal
  link) still see everyone's. `PUT`/`DELETE /contributions/{id}` reject
  with 403 if a linked contributor tries to touch a contribution that
  isn't theirs — this was a real gap before the link existed (nothing
  scoped the list or blocked cross-contributor edits), worth knowing if
  you're comparing against an earlier version of this backend.

## Schema changes: no migration tool, wipe and rebuild instead
`init_db()` (called on every startup) runs `SQLModel.metadata.create_all()`,
which only creates tables that don't exist yet — **it never alters an
existing table.** If a model changes (a renamed/added/dropped column, a
different foreign key) after the database already has that table,
`create_all()` silently does nothing for it and the running database
drifts out of sync with `models.py` — surfacing later as a confusing
`IntegrityError` or `UndefinedColumn` error rather than an obvious one at
startup.

This project deliberately has no migration tool (no Alembic, no manual
`ALTER TABLE` scripts) — `create_all()` is the only thing that manages
schema. That's a fine trade-off for development, where there's no data
worth preserving across a schema change, but it means **the fix for any
model change, or for a schema-drift error, is the same: wipe the database
and let `create_all()` rebuild it fresh.**
```bash
docker compose down -v && docker compose up --build -d   # -v drops the sf_db_data volume
```
Running locally instead of via Docker: drop and recreate the database
(`dropdb solidarity_fund && createdb solidarity_fund`) and restart
`uvicorn` — `init_db()` does the rest.

If this system ever needs to preserve real data across schema changes
(a staging or production environment, not just development), that's the
point to introduce a real migration tool — there's a genuine gap here
with nothing filling it.

## Structure
```
app/
  config.py       Settings loaded from .env
  db.py           SQLModel engine/session
  models.py       Every table from the data dictionary, one file by design
  security.py     bcrypt hashing + JWT issue/verify
  deps.py         get_current_user + require_roles(...) RBAC dependency
  audit.py        log_action() — called from every mutating endpoint
  pagination.py   paginate() — offset/limit + total page count
  reports.py      report definitions + PDF/Excel/Word renderers
  seed.py         creates roles + first administrator
  routers/        one router per workflow area (see below)
```

## Schema notes
`app/models.py` mirrors your pasted data dictionary field-for-field, with
two deliberate, commented exceptions:
- `support_request` has no cash-amount column in your schema, so no cash
  amount is stored on the request itself — the requested amount is
  described in `justification` (free text) and the *decided* amount lives
  in `approval.approved_amount`, exactly where your schema puts it.
- `stock_movement.donation_id` / `distribution_item_id` point at
  `item_contribution` / `item_support` rows (the closest concrete "item
  donation" / "distribution item" records that exist), since your schema
  names `Item_Donations` / `Distribution_Items` without defining them as
  separate tables.

## CRUD coverage
Every entity gets list / view / edit / delete where the real workflow
allows it. A few are deliberately read-only or delete-guarded, and that's
also documented inline at the router:
- **Append-only financial/inventory records** (`stock_movement`,
  `fund_ledger`, `distributions`/`fund_support`, `approval`) — list/view
  only. Editing a disbursement or a ledger row after the fact would break
  the audit trail the whole system exists to keep.
- **Delete guards** — households/disasters/assessments block deletion
  once dependent records exist (an assessment, a support request, etc.);
  contributors block deletion once they have contributions on file; items
  block deletion while they still have stock, movements, or references
  from a request/contribution. Every guard returns a specific error
  message explaining what's blocking it, not just a generic 400.
- **Status-gated edits** — support requests and contributions are only
  editable/deletable while still `PENDING`; once resource management or
  an approver has acted on them, further changes go through the
  workflow's own actions (send-back, etc.) instead of a silent edit.
- **Users** — no hard delete (too many tables reference `user_id` via
  `created_by`/`assessed_by`/etc.); `lock`/`unlock` is the real-world
  equivalent of deactivating an account.

## Disbursement is fully automatic — the amount is never an input
`POST /distributions` takes `{request_id, payout_method?}`. Every amount
and quantity is derived server-side and never accepted from the client,
so a distributor cannot increase, decrease, or otherwise alter what an
authorized approver decided — `payout_method` is the one input this
endpoint takes, and it only picks the channel (mobile money vs external
handover), never the amount; see "Payouts" above for what it does:
- **Household** — from `support_request.assessment_id -> assessment.household_id`.
- **Cash amount** — the `approved_amount` on the latest `APPROVED` decision
  for this request (only exists for `Cash`-type requests — see below).
- **Items and quantities** — every `support_request_item` row with
  `quantity_approved > 0`; the unit comes from the item's own
  `unit_of_measure`, not from client input.
- **`distribution_type`** — computed from what's actually being given
  (`Cash`, `Material`, or `Both`), not copied from the original request.
- **`received_by`** — the household member whose `relationship_to_head`
  is `Head`; falls back to "Household representative" if none is on
  file.
- **`receipt_reference`** — auto-generated (`DISB-{request_id}-{timestamp}`).

If nothing was approved (no cash amount and no approved item lines), the
endpoint returns 400 rather than creating an empty distribution.

## Cash vs. Material is enforced end-to-end, not just in the UI
A `Cash`-type support request can never carry item lines — rejected at
creation (`POST /support-requests`) and at `POST /support-requests/{id}/items`
alike. An approval decision's `approved_amount` is silently dropped unless
the request being decided is `Cash`-type, regardless of what a client
sends — there's nothing cash-related to approve on a `Material` request.
This mirrors the frontend, which hides the items section entirely for a
Cash request and hides the cash-amount field entirely for a non-Cash one
(previously both showed regardless of type, which read as a request for
information that didn't apply).

## "Assistance Received" report redesigned
The `distributions` report (`GET /reports/distributions`) now shows, per
distribution: household code, head of household's name, household member
count, a plain-language summary of what was actually given (`Cash: 50,000
RWF`, `Materials: Blankets x10 pieces`, or both joined together for a
`Both`-type distribution), and the date received — instead of raw IDs.
"Head of household" is found by matching `household_member.relationship_to_head
== "Head"`; the frontend's member forms now use a fixed dropdown for that
field (Head/Spouse/Child/…) specifically so this match is reliable. Any
household member data entered before this change, where that field was
free text, may not match and will show "-" for the head's name.

## Guided registration flow
Response staff work through one continuous path — `Household` →
`Members` → `Assessment` → `Affected Assets` → `Support Request` — via a
dedicated stepper UI (`/households/register` on the frontend, see
`frontend/README.md`). The backend enables this by not gating
support-request creation on assessment verification status, since
verification happens later, together with the request's own
verification (see below).

## Assessment verification is merged into support-request verification
`POST /support-requests/{id}/verify-allocate` now also verifies the
assessment behind that request (sets `assessment.status = VERIFIED`,
`verified_by`, `verified_at`) in the same transaction — resource
management staff no longer perform two separate verify actions. The
standalone `POST /assessments/{id}/verify` endpoint still exists (e.g. for
scripting or an admin override) but the frontend no longer surfaces it as
a required step.

## Workflow → endpoints
1. **Anyone with `REGISTER_BENEFICIARY`** (default: Response Manager):
   `POST /households` (+members) → `POST /assessments` (+affected assets)
   → `POST /support-requests` (+items).
2. **Anyone with `VERIFY_SUPPORT_REQUEST` + `ALLOCATE_SUPPORT_REQUEST` +
   `SUBMIT_FOR_APPROVAL`** (default: Resource Manager):
   `POST /support-requests/{id}/verify-allocate` (checks `fund_inventory`
   balance before allocating; also verifies the linked assessment in the
   same step) → request becomes `SUBMITTED_FOR_APPROVAL`.
3. **Anyone with `APPROVE_SUPPORT_REQUEST`** (granted individually — no
   role has it by default, see "Roles + permissions" above):
   `GET /approvals/pending` → `POST /approvals/{id}/decide` with
   `APPROVED` / `REJECTED` / `SENT_BACK`. `SENT_BACK` returns the request
   to `PENDING`.
4. **Anyone with `DISBURSE_SUPPORT`** (default: Resource Manager):
   `POST /distributions` on an `APPROVED` request — hands assistance to
   the household, writes `stock_movement` (OUT) / `fund_ledger` (OUT) and
   decrements `fund_inventory`.
5. **Anyone with `RECORD_CONTRIBUTION`** (default: Contributor):
   `POST /contributions` (cash and/or items, `PENDING`).
6. **Anyone with `CONFIRM_CONTRIBUTION`** (default: Resource Manager):
   `POST /contributions/{id}/confirm` — writes `stock_movement` (IN) /
   `fund_ledger` (IN) and increments `fund_inventory`.
7. **Anyone with `MANAGE_USERS`/`ASSIGN_ROLES`/`ASSIGN_PERMISSIONS`**
   (default: Administrator): full CRUD on `/users`, role assignment via
   `PUT /users/{id}/roles`, permission overrides via
   `PUT /users/{id}/permissions`, `POST /users/{id}/lock|unlock`.

Every write endpoint calls `log_action(...)`, so `audit_log` has a full,
filterable trail (`who`, `what table`, `what record`, `when`, `from where`).

## Payment gateway (Flutterwave v4 sandbox) — inbound contributions
`app/payments.py` wraps Flutterwave's **v4** sandbox API — a real
departure from the older v3 API most tutorials describe. v4 uses OAuth2
(`client_credentials`) for auth instead of a static secret-key header,
and its endpoints follow an "orchestrator" resource model
(`/orchestration/direct-charges`, `/virtual-accounts`, `/direct-transfers`)
rather than v3's `/payments`, `/transactions`, `/transfers`. If you have
v3-style credentials (a single `FLWSECK_TEST-...` key), this integration
won't work with them — it needs a **Client ID** and **Client Secret**
from Flutterwave's newer credential type.

Get free test credentials at https://dashboard.flutterwave.com (toggle
Test Mode, then Settings -> API Keys). Leave `FLUTTERWAVE_CLIENT_ID`/
`FLUTTERWAVE_CLIENT_SECRET` blank in `.env` and every payment endpoint
still works — a contributor just can't use "Process Payment", and has to
be recorded as paid manually by staff instead.

**Honest caveat**: this was built from Flutterwave's published v4
reference and worked examples, not tested against a live sandbox from
this environment (no outbound network access here). The OAuth2 token
flow and the mobile-money charge/verify shapes are the best-documented
parts of v4 and the ones to trust most; the bank virtual-account flow
(`create_bank_virtual_account`) is comparatively thin in public
documentation and the most likely to need a field name adjusted once
tested against a real sandbox account — flagged inline in
`app/payments.py` where that function is defined.

**New fields not in the original schema**, added specifically for this:
`cash_contribution` gains `payment_status` (PENDING/PAID), `amount_paid`,
`paid_at`, `gateway` (FLUTTERWAVE/MANUAL), `gateway_charge_id` (the
Flutterwave charge id, for polling a mobile-money payment's status),
`virtual_account_number` (for the bank flow); `cash_support` gains
`payout_method` (MOMO/EXTERNAL), `payout_status`, `payout_reference`.
All are commented inline in `models.py` explaining why they're there.

**Inbound flow:**
1. `POST /contributions` with a `BANK`/`MOBILE_MONEY_MTN`/`MOBILE_MONEY_AIRTEL`
   cash payment method creates the contribution `payment_status = PENDING`.
2. `POST /contributions/{id}/pay` (contributor), payload `{amount,
   account_number}` — the contributor enters the amount and the account
   it's coming from directly in-app:
   - **`MOBILE_MONEY_MTN`/`MOBILE_MONEY_AIRTEL`** dispatches a direct
     mobile-money charge to `account_number` (their phone) via
     `POST /orchestration/direct-charges` — they approve a prompt on
     their own phone; the response is `{"mode": "pending", ...}` since
     there's nothing to redirect to. The returned charge id is stored on
     `gateway_charge_id`.
   - **`BANK`** generates a one-time virtual account number
     (`POST /virtual-accounts`) for the contributor to transfer into —
     v4 has no v3-style hosted checkout page for this. Response:
     `{"mode": "virtual_account", "account_number": ...}`.
   Safe to call again to "resume" an unpaid contribution — reuses the
   same `reference` if one already exists.
3. **Confirming a pending mobile-money charge**: `POST /contributions/{id}/check-payment`
   fetches the charge by id (`GET /charges/{id}`) and marks the
   contribution paid if it's gone through. `POST /payments/webhook`
   does the same asynchronously for either flow, authenticated by the
   shared secret hash header rather than a login, in case the
   contributor closes the tab too early.
4. For a payment made outside the system entirely, `PUT /contributions/{id}/payment`
   (resource management staff) records the reference and amount manually.
5. `POST /contributions/{id}/confirm` now refuses to proceed if the
   contribution has a cash component with no payment reference/amount on
   file yet — "the verifier confirms payment only once it's actually there."

## Contributor management is staff-only, not a contributor's own job
Registering, editing, or deleting a `Contributor` record now requires the
`CONFIRM_CONTRIBUTION` permission (default: Resource Manager) rather than
just having a `CONTRIBUTOR` role — a user whose role is Contributor can
still `GET /contributions/contributors` (they need the list to pick
themselves when submitting a contribution) but the create/update/
delete/single-view endpoints require that permission. Previously any
contributor could add or edit contributor organizations, which conflated
"the entity donating" with "the person submitting on its behalf."

## Payouts — disbursing cash support via mobile money
`POST /distributions` accepts an optional `payout_method` ("MOMO" or the
default "EXTERNAL") alongside the request id — it's the one genuine choice
in an otherwise fully-automatic endpoint (see below), since it picks the
channel, never the amount. "MOMO" guesses the household's network from
their phone number's prefix (078/079 -> MTN, 072/073 -> Airtel — there's
no separate network field in the schema) and calls Flutterwave v4's
`/direct-transfers` endpoint; "EXTERNAL" just records that assistance was handed over
outside the system (physical cash, or a transfer staff arrange
themselves) with no gateway call. A failed MoMo payout aborts the whole
disbursement before anything else is written, rather than leaving a
distribution on file with no money actually sent.

## Pending approvals are enriched, not just raw rows
`GET /approvals/pending` doesn't return bare `support_request` rows — each
one is joined server-side with the household it's for, who submitted it
(`requested_by`, resolved to a name), who verified it and when (looked up
from `audit_log`, since "who verified" isn't a column on `support_request`
itself — see the merged-verification note above), and, for a
Material/Service request, every item with its requested and approved
quantities. This lets an approver see what they're actually deciding on
without opening the request's own detail page first.

## Cash balance endpoint
`GET /inventory/balance` returns `{"cash_balance": <number>}` — the sum
of every `fund_ledger` inflow minus every outflow, computed as a single
SQL aggregate rather than paging through the whole ledger client-side.
Used when verifying a Cash-type support request, so resource management
staff can see whether the fund can actually cover it before allocating.

## Reports
`GET /reports/types` lists available report keys. Generate one with:
```
GET /reports/{key}?format=pdf|excel|word&status=...&date_from=...&date_to=...
```
Renderers use a bold navy/white header row and bold body text sized for
readability on a projector or from across a room; filters narrow the
underlying query before the file is built, and pagination on every list
endpoint (`page`, `page_size`, capped at 100) keeps big tables usable.

All three formats now set explicit, equal margins on every side (not just
top/bottom) and carry a consistent branded footer:
- **PDF** — 18mm margins all around; a two-pass `NumberedCanvas` draws a
  "Page X of Y" footer with a rule above it, and the header row repeats on
  every page (verified against a 200-row / 14-page sample during
  development — footer text and page count both came out correct).
- **Excel** — explicit `page_margins` (0.6"/0.75"), landscape print setup
  fit to page width, the header row repeats via `print_title_rows`, and a
  print footer shows "Page &P of &N" (Excel's own page-number field code —
  only appears when actually printed or in print-preview, not in normal
  view).
- **Word** — explicit 1.8cm margins on every side (python-docx's defaults
  only really control two), landscape orientation via `WD_ORIENT` (an
  earlier version of this code set `section.orientation` to a raw integer,
  which is invalid — fixed), and a branded footer.

## Security notes to carry into production
- Move `JWT_SECRET` and DB credentials to a real secrets manager.
- Put this behind HTTPS/TLS; the CORS origin list in `main.py` should be
  the real frontend domain(s) only.
- Add refresh tokens / shorter access-token TTL if you need stronger
  session control than the current 60-minute JWT.

# Solidarity Fund — Frontend (Next.js + Bootstrap)

Single-Page Application (Next.js client-side routing — no full page reloads
between views) with a JWT stored client-side and attached to every API call.

## Public landing page (`pages/index.js`)
Anyone not logged in sees a landing page — About / Purpose / Who We Serve —
instead of being bounced straight to `/login`. Two buttons:
- **Donate** opens a popup (`components/FormModal.js`, reused) with the
  *same fields as the Contributor form* on the Contributions page
  (contributor name, type, phone, email, address) plus a password —
  because that's what it actually creates: a `Contributor` record linked
  to a new login, via `POST /auth/register`. Always a Contributor, no
  role picker. On success, sends the browser to `/login`.
- **Check In** just goes to `/login`.

A logged-in user hitting `/` is redirected straight to `/dashboard`, same
as before.

## A self-service contributor doesn't pick themselves from a list
Once logged in as a contributor registered through the landing page,
`lib/auth.js` exposes `contributor: {id, name} | null` (from
`POST /auth/login`'s response) app-wide. On the Contributions page's
"+ Cash Contribution"/"+ Item Contribution" forms, that replaces the
"Contributor" dropdown with a read-only "Contributing As: {name}" line —
nothing to pick, and the payload doesn't even send a `contributor_id`
(the backend fills it in from the same link, and ignores one if sent
anyway). The **Contributors** tab disappears entirely for anyone without
`CONFIRM_CONTRIBUTION` — a self-service contributor has no reason to
browse or manage the contributor roster now that they don't need to find
themselves in it.

A contributor-role account with no personal link (one an administrator
added directly — representing an org with no individual login) is the
one case that still sees the picker, since there's no "self" to
auto-select.

## Navigation is permission-gated, not role-gated
`lib/auth.js`'s `hasPermission(...codes)` (true if the user holds *any*
one of the given codes, or if they're an Administrator) is what every
page and every button checks — `components/Sidebar.js`'s nav links,
`pages/dashboard.js`'s cards, and every "can this button show" check
throughout the app. `hasRole(...)` still exists for the rare genuinely
identity-based check but nothing uses it anymore. This is what makes "two
users with the same role, different permissions" actually show up in the
UI — an administrator revoking `DISBURSE_SUPPORT` from one specific
Resource Manager makes that button disappear for them alone, without
touching their role.

The one composite check worth knowing: verify → allocate → submit for
approval is one action on the backend requiring all three permissions at
once, so the frontend checks `hasPermission("VERIFY_SUPPORT_REQUEST") &&
hasPermission("ALLOCATE_SUPPORT_REQUEST") && hasPermission("SUBMIT_FOR_APPROVAL")`
for that one button rather than the usual any-of check.

## Profile + logout, top-right, on every page
`components/UserMenu.js` — a small avatar-initial button in the topbar
(desktop and mobile both) that opens a dropdown with the user's name/email,
a link to `/profile` (their own roles, effective permissions, and account
details), and Log Out. Present for every logged-in user regardless of
role or permissions; unrelated to `Sidebar.js`'s permission-gated nav.

## Managing roles and permissions (`pages/users/index.js`)
Three separate actions per user, each gated on its own permission (an
admin has all three by default; nothing stops someone from having just
one): **Edit** (`MANAGE_USERS`), **Roles** (`ASSIGN_ROLES` — a checkbox
list from `GET /users/roles`), and **Permissions** (`ASSIGN_PERMISSIONS`
— a checkbox list from `GET /users/permissions`, the full 17-permission
catalog, pre-checked to the user's *current effective* set whether that
came from their role or a prior override). Submitting Permissions sends
the complete desired set to `PUT /users/{id}/permissions`; the backend
works out which codes actually differ from the role default and stores
only those as overrides.

## Popup forms & alerts
Every create/edit action opens a **popup form modal** (`components/FormModal.js`)
instead of navigating to a separate page:
- Fields auto-wrap into 1–3 columns based on how many the form has, so a
  typical form fits without a vertical scrollbar; the modal itself caps at
  92vh with scroll as a safety net for unusually long forms, and drops to
  a single column on phone-width screens.
- A field can declare `showIf: (values) => boolean` to appear only when
  another field in the same form has a certain value — e.g. on the
  Disburse to Household form, Cash Amount / Payment Method / Receipt
  Reference only show up once Distribution Type is Cash or Both; a
  Material-only distribution never sees them. `components/FieldsGrid.js`
  (shared by `FormModal` and the wizard) is what implements this.
- A field can also be `readOnly` with a `displayValue` — used for context
  that's derived, not entered, like the household a disbursement targets
  (see below).
- Every create / update / delete / decide / confirm / verify action shows
  a toast (`lib/toast.js`) — green for success, red for failure. Failures
  read the backend's actual `detail` message (e.g. "Cannot delete: this
  household has assessment records on file"), never a generic "error
  occurred".
- Deletes go through `components/ConfirmDialog.js` first.
- `lib/useCrud.js` is the shared list+create+update+delete+toast hook
  every list page builds on, so this pattern is consistent everywhere.

## Disbursement: a confirmation, not a form
"Disburse to Household" on the support-request detail page opens a small
modal that summarizes exactly what will be given (e.g. "Cash: 50,000 RWF,
Blankets x10") and to whom — built entirely from data already on file:
the latest approved cash amount and each item's approved quantity. The
only choice on it, when cash is involved, is the payout channel — "Send
via Mobile Money" (only offered if the household's phone number looks
like an MTN/Airtel number) or "Hand Over as Cash (External)" — never the
amount. The backend derives the same numbers independently and ignores
anything a client might send for the amount, so this isn't just a
frontend nicety.

## Payment gateway (Flutterwave v4 sandbox)
- **Contributing**: submitting a cash contribution paid by bank transfer,
  MTN MoMo, or Airtel Money lands the contributor on that contribution's
  own detail page (`pages/contributions/[id].js`) rather than a popup on
  the list — the "View" button gets you back there anytime. That page
  shows the fund's account details (from `GET /payments/account-details`,
  in case they'd rather pay manually) and a **Process Payment** button
  that opens a small form asking for the **amount being paid** and the
  **account it's coming from** (labeled "Your MTN Phone Number", "Your
  Airtel Phone Number", or "Your Bank Account Number" depending on the
  method chosen when the contribution was recorded) — submitting calls
  `POST /contributions/{id}/pay` directly.
  - For MTN/Airtel, that call charges the phone number directly (no
    redirect); a **Check Payment Status** button appears afterward to
    poll for confirmation once they've approved the prompt on their
    phone.
  - For Bank, it generates a one-time virtual account number, shown
    right on the page, for the contributor to transfer into — v4 has no
    v3-style hosted checkout redirect for this.
  The Contributions list still shows a Paid/Unpaid badge per row; the
  actual payment action lives on the detail page only, not inline in the
  list, matching the one place it's discoverable from.
- **Confirming**: resource management staff can't Confirm Receipt on a
  cash contribution until it's actually paid — if it wasn't paid through
  the gateway, a **Record External Payment** button (on the list) lets
  them enter the reference and amount manually instead.
- **Disbursing**: see above — cash support can go out via mobile money
  through the same gateway, or be recorded as handed over externally.

None of this requires a real Flutterwave account to explore — with no
sandbox credentials configured on the backend, Process Payment and Send
via Mobile Money surface a clear error instead of silently failing, and
everything else (account details, manual reference entry) works the same
either way.

## Contributor management is staff-only
The whole **Contributors** tab (not just "+ New Contributor" and its
Edit/Delete actions) only renders for someone holding
`CONFIRM_CONTRIBUTION` (Administrators always pass every permission
check; Resource Managers hold it by default) — see "A self-service
contributor doesn't pick themselves from a list" above for why a
Contributor-role user has no need for it at all anymore.

## Cash vs. Material requests show only what applies
The support-request detail page hides the "Requested Items" section
entirely for a `Cash`-type request (there's a short note instead, and the
"Verify & Submit for Approval" action still works with no items to
allocate); the Approvals decision form hides "Approved Cash Amount" for
any non-`Cash` request and for any decision other than Approve. Both were
previously shown unconditionally, which read as asking for information
that didn't apply to the request in front of you.

## Read-only detail popups (`components/InfoModal.js`)
A third modal type alongside `FormModal` (edit) and `ConfirmDialog`
(destructive actions) — same chrome, but just content and a Close button,
for things there's nothing to do with except look at:
- **Assessment Details**, from the support-request detail page (top-right
  of the Request Overview card) — the full assessment, the household's
  member count, and every affected asset with its quantity, without
  leaving the request you're verifying.
- **User Details**, from the Audit Log — every `User ID` in the table is
  now a clickable link; clicking it opens the user's name, email, phone,
  roles, and status, so "who did this" doesn't require a trip to the
  Users page and back.
- **Approval Details**, from Pending Approvals — the "Details" button on
  each row opens what's actually being approved (household, requester,
  verifier and when, justification, and the item breakdown for a
  Material/Service request). The list itself also gets "Household",
  "Requested By" and "Verified By" columns directly, so most of that
  context is visible without even opening the popup.

## Requested items show what's actually available
The Requested Items table on a support request has an "Available in
Inventory" column next to Remarks, pulled from `fund_inventory` per item
— so whoever's verifying or approving can see at a glance whether the
fund can actually cover what's being asked for. A `Cash`-type request has
no items to show that column on, so its available cash balance
(`fund_ledger` inflows minus outflows, via `GET /inventory/balance`) is
shown as a line of text where the items table would be instead.

## Registration wizard (data collection)
`/households/register` is a dedicated, full-screen stepper — not a popup —
purpose-built for field data collection, where connectivity is often poor
and a case has a variable number of members and affected assets:

1. **Household** → **Members** (repeat group) → **Assessment** →
   **Affected Assets** (repeat group) → **Support Request**.
2. Each one-off step (Household, Assessment, Support Request) submits and
   advances only on success; going back and editing re-saves with `PUT`
   rather than creating a duplicate.
3. Each repeatable step (Members, Affected Assets) is an inline
   "add another" form (`components/RepeatGroupForm.js`) — submitting adds
   the row immediately and clears the form without leaving the step, so
   entering five household members in a row takes five submits, not five
   trips through a popup. There's no forced auto-advance after the first
   one added; a manual "Next" (or a "Proceed to …" shortcut on the older
   per-record detail pages) is what moves you on.
4. **Draft persistence** (`lib/wizardDraft.js`) — the wizard's current
   step and the IDs of whatever's already been created are written to
   `localStorage` on every change and rehydrated on load, so a refresh, a
   crash, or a dropped connection mid-registration resumes exactly where
   it left off instead of losing the session. Records that already made it
   to the server (e.g. the household, if you get cut off on the Members
   step) are never lost either way — they're real rows, not local-only
   drafts.
5. `components/Stepper.js` shows full step labels on desktop and collapses
   to a "Step X of 5" progress bar on phones; `components/WizardShell.js`
   pins the Back/Next bar to the bottom of the viewport so the primary
   action never requires scrolling.

Outside the wizard, `/households`, `/assessments`, `/support-requests` and
their detail pages remain normal list/detail CRUD screens (popup
`FormModal` for create/edit) — for ad-hoc follow-up work like adding one
more member to an already-registered household weeks later, not for the
initial multi-step registration.

## Mobile navigation
Below 768px, the sidebar becomes an off-canvas drawer opened by a hamburger
button in a slim mobile topbar, instead of permanently eating screen width.
It closes automatically on navigation. `components/Sidebar.js` and
`components/Layout.js` carry this; no page-level changes were needed.

## Setup
```bash
npm install
cp .env.local.example .env.local     # point NEXT_PUBLIC_API_URL at the backend
npm run dev                          # http://localhost:3000
```

## Structure
```
lib/api.js         axios instance — attaches JWT, redirects to /login on 401
lib/auth.js         React context: login/logout/current user/roles+permissions (hasPermission)
lib/toast.js         toast notifications + FastAPI error-detail extraction
lib/useCrud.js        shared list/create/update/delete/action hook
lib/wizardDraft.js      localStorage draft persistence for the registration wizard
components/
  Sidebar / Layout    permission-filtered nav, guarded page shell, off-canvas on mobile
  UserMenu             top-right profile + logout, on every page regardless of role
  Pagination            page-number control shared by every list
  FieldsGrid              responsive field renderer shared by FormModal and the wizard
  FormModal                responsive popup create/edit form (standalone CRUD)
  RepeatGroupForm            inline add-another form + list (wizard repeat steps)
  Stepper                     step progress indicator (wizard)
  WizardShell                   full-screen step layout with sticky Back/Next bar
  ConfirmDialog                   delete / destructive-action confirmation popup
  InfoModal                         read-only detail popup (Assessment Details, User Details)
pages/
  index.js                public landing page — About/Purpose/Who We Serve, Donate + Check In
  login.js                  sign-in
  profile.js                  own account: roles, effective permissions, account details
  dashboard.js                  permission-aware landing cards + "Register a New Case" banner
  households/
    register.js                  the 5-step guided registration wizard
    index.js                       list + quick-edit modal (not the wizard)
    [id].js                          detail + member management (post-hoc, standalone)
  disasters/               list + create/edit/delete modal
  assessments/               list + create/edit/delete modal; [id].js — detail + affected-asset CRUD
  support-requests/           list + create/edit/delete modal; [id].js — item CRUD + verify-allocate + disburse
  approvals/                    pending list + approve/reject/send-back modal
  distributions/                  read-only list + detail (append-only financial record)
  contributions/                    tabbed Contributions / Contributors, each with modal CRUD
  inventory/                         tabbed Items / Categories / Stock / Movements / Ledger
  reports/                            filterable PDF / Excel / Word export
  users/                                 edit/roles/permissions modals, each its own permission check
  audit-log/                             read-only, filterable
```

Every page under `pages/` except `index.js` and `login.js` is wrapped in
`<Layout>`, which redirects to `/login` without a session and renders the
sidebar filtered to the signed-in user's *permissions* (not their role
name directly — see "Navigation is permission-gated" above).

Colors and typography live in `styles/globals.css` as CSS variables (navy
`#1F3864` / orange accent `#C55A11` on white) — chosen for contrast so
tables, status badges and modals stay legible from across a room or on a
projector.

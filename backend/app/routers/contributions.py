from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from app.db import get_session
from app.models import (Contributor, FundContribution, CashContribution, ItemContribution,
                         FundInventory, StockMovement, FundLedger, User)
from app.deps import require_permissions, require_any_permission, client_ip
from app.audit import log_action
from app.pagination import paginate
from app.payment import payment_service
from app.config import settings

router = APIRouter(prefix="/contributions", tags=["contributions"])
READ_PERMS = ("RECORD_CONTRIBUTION", "VIEW_CONTRIBUTION", "CONFIRM_CONTRIBUTION")  # need the list to pick a
                                                                                    # contributor when submitting
MANAGE_PERM = "CONFIRM_CONTRIBUTION"  # registering/editing/deleting a Contributor org is a resource-manager task
GATEWAY_METHODS = ("BANK", "MOBILE_MONEY_MTN", "MOBILE_MONEY_AIRTEL")


# ---------- Contributors ----------

@router.get("/contributors")
def list_contributors(page: int = 1, page_size: int = 20, session: Session = Depends(get_session),
                       user: User = Depends(require_any_permission(*READ_PERMS))):
    return paginate(session, Contributor, page, page_size, order_by=Contributor.contributor_id.desc())


@router.post("/contributors")
def create_contributor(payload: dict, request: Request, session: Session = Depends(get_session),
                        user: User = Depends(require_permissions(MANAGE_PERM))):
    c = Contributor(contributor_name=payload["contributor_name"], contributor_type=payload["contributor_type"],
                     phone_number=payload.get("phone_number"), email=payload.get("email"), address=payload.get("address"))
    session.add(c)
    session.commit()
    session.refresh(c)
    log_action(session, user.user_id, "CREATE", "contributor", c.contributor_id, f"Registered contributor {c.contributor_name}", client_ip(request))
    return {"id": c.contributor_id}


@router.get("/contributors/{contributor_id}")
def get_contributor(contributor_id: int, session: Session = Depends(get_session), user: User = Depends(require_permissions(MANAGE_PERM))):
    c = session.get(Contributor, contributor_id)
    if not c:
        raise HTTPException(404, "Contributor not found")
    return c


@router.put("/contributors/{contributor_id}")
def update_contributor(contributor_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
                        user: User = Depends(require_permissions(MANAGE_PERM))):
    c = session.get(Contributor, contributor_id)
    if not c:
        raise HTTPException(404, "Contributor not found")
    for field in ("contributor_name", "contributor_type", "phone_number", "email", "address"):
        if field in payload:
            setattr(c, field, payload[field])
    c.updated_at = datetime.utcnow()
    session.add(c)
    session.commit()
    log_action(session, user.user_id, "UPDATE", "contributor", contributor_id, "Updated contributor", client_ip(request))
    return {"ok": True}


@router.delete("/contributors/{contributor_id}")
def delete_contributor(contributor_id: int, request: Request, session: Session = Depends(get_session),
                        user: User = Depends(require_permissions(MANAGE_PERM))):
    c = session.get(Contributor, contributor_id)
    if not c:
        raise HTTPException(404, "Contributor not found")
    linked = session.exec(select(FundContribution).where(FundContribution.contributor_id == contributor_id)).first()
    if linked:
        raise HTTPException(400, "Cannot delete: this contributor already has contributions on file")
    session.delete(c)
    session.commit()
    log_action(session, user.user_id, "DELETE", "contributor", contributor_id, "Deleted contributor", client_ip(request))
    return {"ok": True}


# ---------- Contributions ----------

@router.get("")
def list_contributions(page: int = 1, page_size: int = 20, status: str | None = None, payment_status: str | None = None,
                        session: Session = Depends(get_session), user: User = Depends(require_any_permission(*READ_PERMS))):

    filters = [FundContribution.verification_status == status] if status else []
    own_contributor = session.exec(select(Contributor).where(Contributor.user_id == user.user_id)).first()
    if own_contributor:
        filters.append(FundContribution.contributor_id == own_contributor.contributor_id)
    result = paginate(session, FundContribution, page, page_size, extra_filters=filters,
                       order_by=FundContribution.contribution_id.desc())
    enriched = []
    for fc in result["items"]:
        cash = session.exec(select(CashContribution).where(CashContribution.contribution_id == fc.contribution_id)).first()
        if payment_status and (not cash or cash.payment_status != payment_status):
            continue
        enriched.append({**fc.dict(), "cash": cash})
    result["items"] = enriched
    return result


@router.post("")
def make_contribution(payload: dict, request: Request, session: Session = Depends(get_session),
                       user: User = Depends(require_permissions("RECORD_CONTRIBUTION"))):
    own_contributor = session.exec(select(Contributor).where(Contributor.user_id == user.user_id)).first()
    contributor_id = own_contributor.contributor_id if own_contributor else payload.get("contributor_id")
    if not contributor_id:
        raise HTTPException(400, "contributor_id is required")

    fc = FundContribution(contributor_id=contributor_id, contribution_date=payload["contribution_date"],
                           remarks=payload.get("remarks"))
    session.add(fc)
    session.commit()
    session.refresh(fc)

    cash_id = None
    cash = payload.get("cash")
    if cash:
        row = CashContribution(contribution_id=fc.contribution_id, amount=cash["amount"],
                                currency=cash.get("currency", "RWF"), payment_method=cash["payment_method"],
                                transaction_reference=cash.get("transaction_reference"), remarks=cash.get("remarks"))
        session.add(row)
        session.commit()
        session.refresh(row)
        cash_id = row.cash_contribution_id
    for it in payload.get("items", []):
        session.add(ItemContribution(contribution_id=fc.contribution_id, item_id=it["item_id"],
                                      quantity=it["quantity"], unit=it["unit"], condition=it.get("condition"),
                                      remarks=it.get("remarks")))
    session.commit()
    log_action(session, user.user_id, "CREATE", "fund_contribution", fc.contribution_id, "Contribution submitted", client_ip(request))
    return {"id": fc.contribution_id, "cash_contribution_id": cash_id,
            "requires_payment": bool(cash and cash["payment_method"] in GATEWAY_METHODS)}


@router.get("/{contribution_id}")
def get_contribution(contribution_id: int, session: Session = Depends(get_session), user: User = Depends(require_any_permission(*READ_PERMS))):
    fc = session.get(FundContribution, contribution_id)
    if not fc:
        raise HTTPException(404, "Contribution not found")
    cash = session.exec(select(CashContribution).where(CashContribution.contribution_id == contribution_id)).first()
    items = session.exec(select(ItemContribution).where(ItemContribution.contribution_id == contribution_id)).all()
    return {**fc.dict(), "cash": cash, "items": items}


@router.put("/{contribution_id}")
def update_contribution(contribution_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
                         user: User = Depends(require_permissions("RECORD_CONTRIBUTION"))):
    """Editable only while still PENDING confirmation — once resource management staff has confirmed
    receipt, ledger/inventory entries already exist and the record becomes an immutable financial trail."""
    fc = session.get(FundContribution, contribution_id)
    if not fc:
        raise HTTPException(404, "Contribution not found")
    own_contributor = session.exec(select(Contributor).where(Contributor.user_id == user.user_id)).first()
    if own_contributor and fc.contributor_id != own_contributor.contributor_id:
        raise HTTPException(403, "You can only edit your own contributions")
    if fc.verification_status != "PENDING":
        raise HTTPException(400, f"Cannot edit a contribution that is already {fc.verification_status}")
    if "contribution_date" in payload:
        fc.contribution_date = payload["contribution_date"]
    if "remarks" in payload:
        fc.remarks = payload["remarks"]
    session.add(fc)

    cash_payload = payload.get("cash")
    if cash_payload is not None:
        existing = session.exec(select(CashContribution).where(CashContribution.contribution_id == contribution_id)).first()
        if existing:
            for field in ("amount", "currency", "payment_method", "transaction_reference", "remarks"):
                if field in cash_payload:
                    setattr(existing, field, cash_payload[field])
            session.add(existing)
        else:
            session.add(CashContribution(contribution_id=contribution_id, amount=cash_payload["amount"],
                                          currency=cash_payload.get("currency", "RWF"),
                                          payment_method=cash_payload["payment_method"],
                                          transaction_reference=cash_payload.get("transaction_reference")))

    items_payload = payload.get("items")
    if items_payload is not None:
        existing_items = session.exec(select(ItemContribution).where(ItemContribution.contribution_id == contribution_id)).all()
        # Editable only as a single line — matches the frontend's one-item-per-item-contribution form.
        if existing_items:
            line = existing_items[0]
            for field in ("item_id", "quantity", "unit", "condition", "remarks"):
                if field in items_payload[0]:
                    setattr(line, field, items_payload[0][field])
            session.add(line)
            for extra in existing_items[1:]:
                session.delete(extra)
        elif items_payload:
            it = items_payload[0]
            session.add(ItemContribution(contribution_id=contribution_id, item_id=it["item_id"], quantity=it["quantity"],
                                          unit=it["unit"], condition=it.get("condition"), remarks=it.get("remarks")))
    session.commit()
    log_action(session, user.user_id, "UPDATE", "fund_contribution", contribution_id, "Updated contribution", client_ip(request))
    return {"ok": True}


@router.delete("/{contribution_id}")
def delete_contribution(contribution_id: int, request: Request, session: Session = Depends(get_session),
                         user: User = Depends(require_permissions("RECORD_CONTRIBUTION"))):
    fc = session.get(FundContribution, contribution_id)
    if not fc:
        raise HTTPException(404, "Contribution not found")
    own_contributor = session.exec(select(Contributor).where(Contributor.user_id == user.user_id)).first()
    if own_contributor and fc.contributor_id != own_contributor.contributor_id:
        raise HTTPException(403, "You can only delete your own contributions")
    if fc.verification_status != "PENDING":
        raise HTTPException(400, f"Cannot delete a contribution that is already {fc.verification_status}")
    for cash in session.exec(select(CashContribution).where(CashContribution.contribution_id == contribution_id)).all():
        session.delete(cash)
    for item in session.exec(select(ItemContribution).where(ItemContribution.contribution_id == contribution_id)).all():
        session.delete(item)
    session.delete(fc)
    session.commit()
    log_action(session, user.user_id, "DELETE", "fund_contribution", contribution_id, "Deleted contribution", client_ip(request))
    return {"ok": True}


# ---------- Payment (gateway + manual) ----------

@router.post("/{contribution_id}/pay")
async def initiate_payment(
    contribution_id: int, payload: dict, request: Request,
    session: Session = Depends(get_session),
    user: User = Depends(require_permissions("RECORD_CONTRIBUTION")),
):
    """Processes payment for this contribution's cash portion, in-app.
    payload: {amount, account_number, country_code (optional, defaults to "250")}"""
    fc = session.get(FundContribution, contribution_id)
    if not fc:
        raise HTTPException(404, "Contribution not found")
    cash = session.exec(select(CashContribution).where(CashContribution.contribution_id == contribution_id)).first()
    if not cash:
        raise HTTPException(400, "This contribution has no cash component to pay")
    if cash.payment_method not in GATEWAY_METHODS:
        raise HTTPException(400, f"{cash.payment_method} isn't paid through the gateway — nothing to initiate")
    if cash.payment_status == "PAID":
        raise HTTPException(400, "This contribution is already marked as paid")

    amount = payload.get("amount")
    account_number = payload.get("account_number")
    country_code = payload.get("country_code", "250")
    if not amount or not account_number:
        raise HTTPException(400, "amount and account_number are both required")

    reference = cash.transaction_reference or f"SF-CONTRIB-{contribution_id}-{int(datetime.utcnow().timestamp())}"
    redirect_url = f"{settings.frontend_base_url}/payments/callback?contribution_id={contribution_id}"
    try:
        if cash.payment_method == "BANK":
            # TODO: payment_service currently has no bank-transfer method.
            # Add a `pay_with_bank_transfer(...)` method (customer + bank_transfer
            # payment-method + charge) before this branch will work.
            raise HTTPException(501, "Bank transfer payment is not yet implemented in payment_service")
        else:
            network = "MTN" if cash.payment_method == "MOBILE_MONEY_MTN" else "AIRTEL"
            result = await payment_service.pay_with_momo(
                email=user.email,
                first_name=user.first_name,
                last_name=user.last_name,
                phone=account_number,
                country_code=country_code,
                network=network,
                amount=amount,
                currency=cash.currency,
                redirect_url=redirect_url,
            )
    except Exception as e:
        raise HTTPException(502, f"Could not start the payment: {e}")

    charge_data = result.get("data", {})
    cash.gateway_charge_id = charge_data.get("id")
    cash.transaction_reference = charge_data.get("reference", reference)
    cash.gateway = "FLUTTERWAVE"
    cash.remarks = f"{(cash.remarks + ' | ') if cash.remarks else ''}Paying account: {account_number}"
    session.add(cash)
    session.commit()

    log_action(session, user.user_id, "UPDATE", "cash_contribution", cash.cash_contribution_id,
               "Initiated gateway payment", client_ip(request))
    
    next_action = charge_data.get("next_action")

    return {
        "mode": next_action.get("type") if next_action else "pending",
        "next_action": next_action,
        "message": "Complete the payment to continue.",
        "reference": cash.transaction_reference,
    }


@router.post("/{contribution_id}/check-payment")
async def check_payment(
    contribution_id: int, session: Session = Depends(get_session),
    user: User = Depends(require_any_permission("RECORD_CONTRIBUTION", "CONFIRM_CONTRIBUTION")),
):
    """Polls Flutterwave for a payment that was initiated but hasn't been confirmed yet."""
    fc = session.get(FundContribution, contribution_id)
    if not fc:
        raise HTTPException(404, "Contribution not found")
    cash = session.exec(select(CashContribution).where(CashContribution.contribution_id == contribution_id)).first()
    if not cash or not cash.gateway_charge_id:
        raise HTTPException(400, "No mobile money payment has been initiated for this contribution yet")
    if cash.payment_status == "PAID":
        return {"status": "PAID"}

    try:
        result = await payment_service.verify_charge(cash.gateway_charge_id)
    except Exception as e:
        raise HTTPException(502, f"Charge verification failed: {e}")

    data = result.get("data", {})
    status = data.get("status")

    if status in ("successful", "success"):
        cash.payment_status = "PAID"
        cash.amount_paid = data.get("amount") or cash.amount
        cash.paid_at = datetime.utcnow()
        session.add(cash)
        session.commit()
        return {"status": "PAID"}

    return {"status": "PENDING", "detail": status or "Not confirmed yet — the contributor may still need to approve it"}

@router.put("/{contribution_id}/payment")
def record_external_payment(contribution_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
                             user: User = Depends(require_permissions("CONFIRM_CONTRIBUTION"))):
   
    fc = session.get(FundContribution, contribution_id)
    if not fc:
        raise HTTPException(404, "Contribution not found")
    cash = session.exec(select(CashContribution).where(CashContribution.contribution_id == contribution_id)).first()
    if not cash:
        raise HTTPException(400, "This contribution has no cash component")
    if not payload.get("payment_reference") or not payload.get("amount_paid"):
        raise HTTPException(400, "payment_reference and amount_paid are both required")
    cash.transaction_reference = payload["payment_reference"]
    cash.amount_paid = payload["amount_paid"]
    cash.paid_at = payload.get("paid_at") or datetime.utcnow()
    cash.payment_status = "PAID"
    cash.gateway = "MANUAL"
    session.add(cash)
    session.commit()
    log_action(session, user.user_id, "UPDATE", "cash_contribution", cash.cash_contribution_id,
               "Recorded externally-made payment", client_ip(request))
    return {"ok": True}


@router.post("/{contribution_id}/confirm")
def confirm_contribution(contribution_id: int, request: Request, session: Session = Depends(get_session),
                          user: User = Depends(require_permissions("CONFIRM_CONTRIBUTION"))):
   
    fc = session.get(FundContribution, contribution_id)
    if not fc or fc.verification_status != "PENDING":
        raise HTTPException(404, "No pending contribution found for this id")

    cash = session.exec(select(CashContribution).where(CashContribution.contribution_id == contribution_id)).first()
    if cash and (not cash.transaction_reference or not cash.amount_paid):
        raise HTTPException(400, "Cannot confirm: payment reference and amount paid must be recorded first "
                                  "(either the contributor completes payment, or you record an external payment)")
    if cash:
        session.add(FundLedger(transaction_type="IN", amount=cash.amount_paid or cash.amount, currency=cash.currency,
                                transaction_date=datetime.utcnow(), reference_type="CONTRIBUTION",
                                reference_id=fc.contribution_id, payment_method=cash.payment_method,
                                recorded_by=user.user_id, remarks=f"Cash contribution from contributor {fc.contributor_id}"))

    for item in session.exec(select(ItemContribution).where(ItemContribution.contribution_id == contribution_id)).all():
        inv = session.exec(select(FundInventory).where(FundInventory.item_id == item.item_id)).first()
        if not inv:
            inv = FundInventory(item_id=item.item_id, quantity_available=0)
        inv.quantity_available += item.quantity
        inv.updated_at = datetime.utcnow()
        session.add(inv)
        session.add(StockMovement(item_id=item.item_id, movement_type="IN", quantity=item.quantity,
                                   recorded_by=user.user_id, donation_id=item.item_contribution_id,
                                   remarks="Item contribution received"))

    fc.verification_status = "CONFIRMED"
    fc.verified_by = user.user_id
    fc.verified_at = datetime.utcnow()
    session.add(fc)
    session.commit()
    log_action(session, user.user_id, "VERIFY", "fund_contribution", contribution_id, "Confirmed contribution receipt", client_ip(request))
    return {"ok": True}

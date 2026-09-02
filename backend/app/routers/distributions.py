from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from app.db import get_session
from app.models import (SupportRequest, SupportRequestItem, Assessment, Approval, Household, HouseholdMember,
                         Item, FundSupport, CashSupport, ItemSupport, FundInventory, StockMovement, FundLedger, User)
from app.deps import require_permissions, require_any_permission, client_ip
from app.audit import log_action
from app.pagination import paginate
from app.payment import payment_service as gateway

router = APIRouter(prefix="/distributions", tags=["distributions"])
VIEW_PERMS = ("DISBURSE_SUPPORT", "VIEW_REQUEST_HISTORY", "APPROVE_SUPPORT_REQUEST")


@router.get("")
def list_distributions(page: int = 1, page_size: int = 20, household_id: int | None = None,
                        status: str | None = None, session: Session = Depends(get_session),
                        user: User = Depends(require_any_permission(*VIEW_PERMS))):
    filters = []
    if household_id:
        filters.append(FundSupport.household_id == household_id)
    if status:
        filters.append(FundSupport.status == status)
    return paginate(session, FundSupport, page, page_size, extra_filters=filters, order_by=FundSupport.id.desc())


@router.get("/{distribution_id}")
def get_distribution(distribution_id: int, session: Session = Depends(get_session), user: User = Depends(require_any_permission(*VIEW_PERMS))):
    """Distributions are a financial/inventory record of assistance already handed over — append-only
    by design (no edit/delete), same as the fund ledger and stock movements they generate."""
    fs = session.get(FundSupport, distribution_id)
    if not fs:
        raise HTTPException(404, "Distribution not found")
    cash = session.exec(select(CashSupport).where(CashSupport.distribution_id == distribution_id)).first()
    items = session.exec(select(ItemSupport).where(ItemSupport.distribution_id == distribution_id)).all()
    return {**fs.dict(), "cash": cash, "items": items}


@router.post("")
def disburse(payload: dict, request: Request, session: Session = Depends(get_session),
             user: User = Depends(require_permissions("DISBURSE_SUPPORT"))):
    
    sr = session.get(SupportRequest, payload["request_id"])
    if not sr or sr.status != "APPROVED":
        raise HTTPException(404, "No approved request found for this id")

    assessment = session.get(Assessment, sr.assessment_id)
    if not assessment:
        raise HTTPException(400, "This request's assessment could not be found")
    household = session.get(Household, assessment.household_id)

    latest_approval = session.exec(
        select(Approval).where(Approval.request_id == sr.request_id, Approval.approval_status == "APPROVED")
        .order_by(Approval.approval_id.desc())
    ).first()
    approved_amount = latest_approval.approved_amount if latest_approval else None

    approved_items = session.exec(
        select(SupportRequestItem).where(SupportRequestItem.request_id == sr.request_id,
                                          SupportRequestItem.quantity_approved > 0)
    ).all()

    if not approved_amount and not approved_items:
        raise HTTPException(400, "Nothing was approved on this request — there is nothing to disburse")

    distribution_type = "Both" if approved_amount and approved_items else ("Cash" if approved_amount else "Material")

    # Attempt the MoMo payout (if requested) before anything else is written, so a gateway
    # failure aborts cleanly rather than leaving a distribution on file with no money actually sent.
    payout_method = payload.get("payout_method", "EXTERNAL")
    payout_status, payout_reference = "COMPLETED", None
    if approved_amount and payout_method == "MOMO":
        network = gateway.detect_momo_network(household.phone_number if household else None)
        if not network:
            raise HTTPException(400, "Could not determine an MTN/Airtel mobile money number for this household — "
                                      "use External instead, or add a valid phone number to the household record")
        reference = f"SF-PAYOUT-{sr.request_id}-{int(datetime.utcnow().timestamp())}"
        result = gateway.create_momo_payout(reference=reference, amount=approved_amount, currency="RWF",
                                             phone=household.phone_number, network=network,
                                             narration=f"Solidarity fund support — request {sr.request_id}")
        if not result.get("ok"):
            raise HTTPException(502, result.get("error", "Mobile money payout failed"))
        payout_status, payout_reference = result.get("status", "PENDING"), reference

    members = session.exec(select(HouseholdMember).where(HouseholdMember.household_id == assessment.household_id)).all()
    head = next((m for m in members if (m.relationship_to_head or "").strip().lower() == "head"), None)
    received_by = f"{head.first_name} {head.last_name}" if head else "Household representative"
    receipt_reference = f"DISB-{sr.request_id}-{int(datetime.utcnow().timestamp())}"

    fs = FundSupport(support_request_id=sr.request_id, household_id=assessment.household_id,
                      distribution_date=datetime.utcnow().date(), distribution_type=distribution_type,
                      distributed_by=user.user_id, received_by=received_by, receipt_reference=receipt_reference,
                      status="COMPLETED", remarks="Auto-recorded from the approved request")
    session.add(fs)
    session.commit()
    session.refresh(fs)

    if approved_amount:
        session.add(CashSupport(distribution_id=fs.id, amount=approved_amount, currency="RWF",
                                 payment_method="MOBILE_MONEY" if payout_method == "MOMO" else "CASH",
                                 payment_reference=payout_reference, payout_method=payout_method,
                                 payout_status=payout_status, payout_reference=payout_reference,
                                 remarks="Amount matches the authorized approval"))
        session.add(FundLedger(transaction_type="OUT", amount=approved_amount, currency="RWF",
                                transaction_date=datetime.utcnow(), reference_type="SUPPORT", reference_id=fs.id,
                                payment_method="MOBILE_MONEY" if payout_method == "MOMO" else "CASH",
                                recorded_by=user.user_id,
                                remarks=f"Cash support disbursed for request {sr.request_id}"))

    for line in approved_items:
        inv = session.exec(select(FundInventory).where(FundInventory.item_id == line.item_id)).first()
        if not inv or inv.quantity_available < line.quantity_approved:
            raise HTTPException(400, f"Insufficient inventory for item {line.item_id} to cover the approved quantity")
        inv.quantity_available -= line.quantity_approved
        inv.updated_at = datetime.utcnow()
        session.add(inv)

        item = session.get(Item, line.item_id)
        item_support = ItemSupport(distribution_id=fs.id, item_id=line.item_id, quantity=line.quantity_approved,
                                    unit=item.unit_of_measure if item else "unit",
                                    remarks="Quantity matches the resource management allocation")
        session.add(item_support)
        session.commit()
        session.refresh(item_support)
        session.add(StockMovement(item_id=line.item_id, movement_type="OUT", quantity=line.quantity_approved,
                                   recorded_by=user.user_id, distribution_item_id=item_support.item_given_id,
                                   remarks=f"Distributed for request {sr.request_id}"))

    sr.status = "DISBURSED"
    session.add(sr)
    session.commit()
    log_action(session, user.user_id, "CREATE", "fund_support", fs.id,
               f"Disbursed support request {sr.request_id} to household {fs.household_id} via {payout_method}", client_ip(request))
    return {"id": fs.id, "status": "COMPLETED", "payout_method": payout_method}

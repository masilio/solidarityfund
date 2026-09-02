from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from app.db import get_session
from app.models import SupportRequest, SupportRequestItem, FundInventory, Assessment, User
from app.deps import require_permissions, require_any_permission, client_ip
from app.audit import log_action
from app.pagination import paginate

router = APIRouter(prefix="/support-requests", tags=["support-requests"])
VIEW_PERMS = ("SUBMIT_SUPPORT_REQUEST", "VIEW_REQUEST_HISTORY", "VERIFY_SUPPORT_REQUEST",
              "ALLOCATE_SUPPORT_REQUEST", "APPROVE_SUPPORT_REQUEST", "DISBURSE_SUPPORT")


def _get_request_or_404(session: Session, request_id: int) -> SupportRequest:
    sr = session.get(SupportRequest, request_id)
    if not sr:
        raise HTTPException(404, "Support request not found")
    return sr


@router.get("")
def list_requests(page: int = 1, page_size: int = 20, status: str | None = None,
                   session: Session = Depends(get_session), user: User = Depends(require_any_permission(*VIEW_PERMS))):
    filters = [SupportRequest.status == status] if status else []
    return paginate(session, SupportRequest, page, page_size, extra_filters=filters, order_by=SupportRequest.request_id.desc())


@router.post("")
def create_request(payload: dict, request: Request, session: Session = Depends(get_session),
                    user: User = Depends(require_permissions("SUBMIT_SUPPORT_REQUEST"))):
    """Response staff submits a support request (cash and/or items) for an assessed household."""
    if payload["request_type"] == "Cash" and payload.get("items"):
        raise HTTPException(400, "A Cash request cannot include item lines")
    sr = SupportRequest(assessment_id=payload["assessment_id"], requested_by=user.user_id,
                         request_type=payload["request_type"], priority=payload.get("priority", "NORMAL"),
                         justification=payload.get("justification"), request_date=payload["request_date"])
    session.add(sr)
    session.commit()
    session.refresh(sr)
    for it in payload.get("items", []):
        session.add(SupportRequestItem(request_id=sr.request_id, item_id=it["item_id"],
                                        quantity_requested=it["quantity_requested"], remarks=it.get("remarks")))
    session.commit()
    log_action(session, user.user_id, "CREATE", "support_request", sr.request_id, "Submitted support request", client_ip(request))
    return {"id": sr.request_id}


@router.get("/{request_id}")
def get_request(request_id: int, session: Session = Depends(get_session), user: User = Depends(require_any_permission(*VIEW_PERMS))):
    sr = _get_request_or_404(session, request_id)
    items = session.exec(select(SupportRequestItem).where(SupportRequestItem.request_id == request_id)).all()
    return {**sr.dict(), "items": items}


@router.put("/{request_id}")
def update_request(request_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
                    user: User = Depends(require_permissions("SUBMIT_SUPPORT_REQUEST"))):
    """Editable only while still PENDING — once resource management has verified/allocated it, the
    request has entered the approval pipeline and must go through send-back instead of a silent edit."""
    sr = _get_request_or_404(session, request_id)
    if sr.status != "PENDING":
        raise HTTPException(400, f"Cannot edit a request that is already {sr.status}; only PENDING requests can be edited")
    for field in ("request_type", "priority", "justification", "request_date"):
        if field in payload:
            setattr(sr, field, payload[field])
    sr.updated_at = datetime.utcnow()
    session.add(sr)
    session.commit()
    log_action(session, user.user_id, "UPDATE", "support_request", request_id, "Updated support request", client_ip(request))
    return {"ok": True}


@router.delete("/{request_id}")
def delete_request(request_id: int, request: Request, session: Session = Depends(get_session),
                    user: User = Depends(require_permissions("SUBMIT_SUPPORT_REQUEST"))):
    sr = _get_request_or_404(session, request_id)
    if sr.status != "PENDING":
        raise HTTPException(400, f"Cannot delete a request that is already {sr.status}")
    for line in session.exec(select(SupportRequestItem).where(SupportRequestItem.request_id == request_id)).all():
        session.delete(line)
    session.delete(sr)
    session.commit()
    log_action(session, user.user_id, "DELETE", "support_request", request_id, "Deleted support request", client_ip(request))
    return {"ok": True}


@router.post("/{request_id}/items")
def add_item(request_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
             user: User = Depends(require_permissions("SUBMIT_SUPPORT_REQUEST"))):
    sr = _get_request_or_404(session, request_id)
    if sr.status != "PENDING":
        raise HTTPException(400, "Cannot add items once the request has left PENDING status")
    if sr.request_type == "Cash":
        raise HTTPException(400, "A Cash request cannot have item lines")
    line = SupportRequestItem(request_id=request_id, item_id=payload["item_id"],
                               quantity_requested=payload["quantity_requested"], remarks=payload.get("remarks"))
    session.add(line)
    session.commit()
    session.refresh(line)
    log_action(session, user.user_id, "CREATE", "support_request_item", line.request_item_id, "Added requested item", client_ip(request))
    return {"id": line.request_item_id}


@router.put("/{request_id}/items/{item_line_id}")
def update_item(request_id: int, item_line_id: int, payload: dict, request: Request,
                 session: Session = Depends(get_session), user: User = Depends(require_permissions("SUBMIT_SUPPORT_REQUEST"))):
    sr = _get_request_or_404(session, request_id)
    if sr.status != "PENDING":
        raise HTTPException(400, "Cannot edit items once the request has left PENDING status")
    line = session.get(SupportRequestItem, item_line_id)
    if not line or line.request_id != request_id:
        raise HTTPException(404, "Requested item line not found")
    for field in ("item_id", "quantity_requested", "remarks"):
        if field in payload:
            setattr(line, field, payload[field])
    session.add(line)
    session.commit()
    log_action(session, user.user_id, "UPDATE", "support_request_item", item_line_id, "Updated requested item", client_ip(request))
    return {"ok": True}


@router.delete("/{request_id}/items/{item_line_id}")
def delete_item(request_id: int, item_line_id: int, request: Request, session: Session = Depends(get_session),
                 user: User = Depends(require_permissions("SUBMIT_SUPPORT_REQUEST"))):
    sr = _get_request_or_404(session, request_id)
    if sr.status != "PENDING":
        raise HTTPException(400, "Cannot remove items once the request has left PENDING status")
    line = session.get(SupportRequestItem, item_line_id)
    if not line or line.request_id != request_id:
        raise HTTPException(404, "Requested item line not found")
    session.delete(line)
    session.commit()
    log_action(session, user.user_id, "DELETE", "support_request_item", item_line_id, "Removed requested item", client_ip(request))
    return {"ok": True}


@router.post("/{request_id}/verify-allocate")
def verify_and_allocate(request_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
                         user: User = Depends(require_permissions("VERIFY_SUPPORT_REQUEST", "ALLOCATE_SUPPORT_REQUEST", "SUBMIT_FOR_APPROVAL"))):
    """Resource management staff checks item availability, sets quantity_approved on each line, then
    submits the request forward for approval. payload: {items:[{request_item_id, quantity_approved}]}.
    Any cash amount is decided by the approver directly on approval.approved_amount. The assessment
    behind this request is verified in the same step, rather than as a separate action beforehand."""
    sr = _get_request_or_404(session, request_id)
    if sr.status != "PENDING":
        raise HTTPException(400, f"Request is already {sr.status}, nothing to verify")
    for it in payload.get("items", []):
        line = session.get(SupportRequestItem, it["request_item_id"])
        if not line or line.request_id != request_id:
            continue
        inv = session.exec(select(FundInventory).where(FundInventory.item_id == line.item_id)).first()
        available = inv.quantity_available if inv else 0
        if it["quantity_approved"] > available:
            raise HTTPException(400, f"Only {available} available for item {line.item_id}, cannot allocate {it['quantity_approved']}")
        line.quantity_approved = it["quantity_approved"]
        session.add(line)
    sr.status = "SUBMITTED_FOR_APPROVAL"
    session.add(sr)

    assessment = session.get(Assessment, sr.assessment_id)
    if assessment and assessment.status != "VERIFIED":
        assessment.status = "VERIFIED"
        assessment.verified_by = user.user_id
        assessment.verified_at = datetime.utcnow()
        session.add(assessment)

    session.commit()
    log_action(session, user.user_id, "VERIFY", "support_request", request_id, "Verified, allocated resources and submitted for approval", client_ip(request))
    if assessment:
        log_action(session, user.user_id, "VERIFY", "assessment", assessment.assessment_id, "Verified together with its support request", client_ip(request))
    return {"ok": True}

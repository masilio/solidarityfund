from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from app.db import get_session
from app.models import SupportRequest, SupportRequestItem, Approval, Assessment, Household, Item, AuditLog, User
from app.deps import require_permissions, require_any_permission, client_ip
from app.audit import log_action
from app.pagination import paginate

router = APIRouter(prefix="/approvals", tags=["approvals"])


def _user_brief(session: Session, user_id: int | None) -> dict | None:
    if not user_id:
        return None
    u = session.get(User, user_id)
    return {"id": user_id, "name": f"{u.first_name} {u.last_name}" if u else "Unknown user"}


@router.get("/pending")
def pending_requests(page: int = 1, page_size: int = 20, session: Session = Depends(get_session),
                      user: User = Depends(require_permissions("APPROVE_SUPPORT_REQUEST"))):
   
    result = paginate(session, SupportRequest, page, page_size,
                       extra_filters=[SupportRequest.status == "SUBMITTED_FOR_APPROVAL"],
                       order_by=SupportRequest.request_id.desc())

    enriched = []
    for sr in result["items"]:
        assessment = session.get(Assessment, sr.assessment_id)
        household = session.get(Household, assessment.household_id) if assessment else None

        latest_verify = session.exec(
            select(AuditLog).where(AuditLog.table_name == "support_request", AuditLog.record_id == sr.request_id,
                                    AuditLog.action == "VERIFY").order_by(AuditLog.audit_log_id.desc())
        ).first()

        items = []
        if sr.request_type != "Cash":
            for line in session.exec(select(SupportRequestItem).where(SupportRequestItem.request_id == sr.request_id)).all():
                item = session.get(Item, line.item_id)
                items.append({"item_name": item.item_name if item else f"Item #{line.item_id}",
                              "unit": item.unit_of_measure if item else "", "quantity_requested": line.quantity_requested,
                              "quantity_approved": line.quantity_approved})

        enriched.append({
            **sr.dict(),
            "household_code": household.household_code if household else None,
            "requested_by_user": _user_brief(session, sr.requested_by),
            "verified_by_user": _user_brief(session, latest_verify.user_id) if latest_verify else None,
            "verified_at": latest_verify.created_at if latest_verify else None,
            "items": items,
        })
    result["items"] = enriched
    return result


@router.post("/{request_id}/decide")
def decide(request_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
           user: User = Depends(require_permissions("APPROVE_SUPPORT_REQUEST"))):
  
    sr = session.get(SupportRequest, request_id)
    if not sr or sr.status != "SUBMITTED_FOR_APPROVAL":
        raise HTTPException(404, "No pending request found for this id")
    decision = payload["decision"]
    if decision not in ("APPROVED", "REJECTED", "SENT_BACK"):
        raise HTTPException(400, "decision must be APPROVED, REJECTED or SENT_BACK")
    approved_amount = payload.get("approved_amount") if sr.request_type == "Cash" else None
    session.add(Approval(request_id=request_id, approved_by=user.user_id, approval_status=decision,
                          approved_amount=approved_amount, remarks=payload.get("remarks")))
    sr.status = {"APPROVED": "APPROVED", "REJECTED": "REJECTED", "SENT_BACK": "PENDING"}[decision]
    session.add(sr)
    session.commit()
    log_action(session, user.user_id, "APPROVE" if decision == "APPROVED" else decision, "support_request",
               request_id, f"Decision: {decision}", client_ip(request))
    return {"ok": True, "status": sr.status}


@router.get("/{request_id}/history")
def approval_history(request_id: int, session: Session = Depends(get_session),
                      user: User = Depends(require_any_permission("APPROVE_SUPPORT_REQUEST", "VERIFY_SUPPORT_REQUEST", "ALLOCATE_SUPPORT_REQUEST", "SUBMIT_SUPPORT_REQUEST"))):
    return session.exec(select(Approval).where(Approval.request_id == request_id).order_by(Approval.approval_id)).all()

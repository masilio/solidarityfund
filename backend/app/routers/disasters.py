from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from app.db import get_session
from app.models import Disaster, Assessment, User
from app.deps import require_permissions, get_current_user, client_ip
from app.audit import log_action
from app.pagination import paginate

router = APIRouter(prefix="/disasters", tags=["disasters"])


@router.get("")
def list_disasters(page: int = 1, page_size: int = 20, status: str | None = None,
                    session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    filters = [Disaster.status == status] if status else []
    return paginate(session, Disaster, page, page_size, extra_filters=filters, order_by=Disaster.disaster_id.desc())


@router.post("")
def create_disaster(payload: dict, request: Request, session: Session = Depends(get_session),
                     user: User = Depends(require_permissions("REGISTER_BENEFICIARY"))):
    d = Disaster(disaster_name=payload["disaster_name"], disaster_type=payload["disaster_type"],
                 description=payload.get("description"), start_date=payload["start_date"],
                 end_date=payload.get("end_date"), declared_date=payload.get("declared_date"),
                 status=payload.get("status", "ACTIVE"), created_by=user.user_id)
    session.add(d)
    session.commit()
    session.refresh(d)
    log_action(session, user.user_id, "CREATE", "disaster", d.disaster_id, f"Recorded disaster {d.disaster_name}", client_ip(request))
    return {"id": d.disaster_id}


@router.get("/{disaster_id}")
def get_disaster(disaster_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    d = session.get(Disaster, disaster_id)
    if not d:
        raise HTTPException(404, "Disaster not found")
    return d


@router.put("/{disaster_id}")
def update_disaster(disaster_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
                     user: User = Depends(require_permissions("REGISTER_BENEFICIARY"))):
    d = session.get(Disaster, disaster_id)
    if not d:
        raise HTTPException(404, "Disaster not found")
    for field in ("disaster_name", "disaster_type", "description", "start_date", "end_date", "declared_date", "status"):
        if field in payload:
            setattr(d, field, payload[field])
    d.updated_at = datetime.utcnow()
    session.add(d)
    session.commit()
    log_action(session, user.user_id, "UPDATE", "disaster", disaster_id, "Updated disaster record", client_ip(request))
    return {"ok": True}


@router.delete("/{disaster_id}")
def delete_disaster(disaster_id: int, request: Request, session: Session = Depends(get_session),
                     user: User = Depends(require_permissions("REGISTER_BENEFICIARY"))):
    d = session.get(Disaster, disaster_id)
    if not d:
        raise HTTPException(404, "Disaster not found")
    linked = session.exec(select(Assessment).where(Assessment.disaster_id == disaster_id)).first()
    if linked:
        raise HTTPException(400, "Cannot delete: one or more household assessments reference this disaster")
    session.delete(d)
    session.commit()
    log_action(session, user.user_id, "DELETE", "disaster", disaster_id, "Deleted disaster record", client_ip(request))
    return {"ok": True}

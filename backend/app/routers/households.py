from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from app.db import get_session
from app.models import Household, HouseholdMember, Assessment, User
from app.deps import require_permissions, require_any_permission, client_ip
from app.audit import log_action
from app.pagination import paginate

router = APIRouter(prefix="/households", tags=["households"])
# View access is broader than write: resource managers and approvers need household
# context for their own workflows even though only response managers register beneficiaries.
VIEW_PERMS = ("REGISTER_BENEFICIARY", "VERIFY_SUPPORT_REQUEST", "ALLOCATE_SUPPORT_REQUEST",
              "APPROVE_SUPPORT_REQUEST", "SUBMIT_SUPPORT_REQUEST", "VIEW_REQUEST_HISTORY")


def _get_household_or_404(session: Session, household_id: int) -> Household:
    hh = session.get(Household, household_id)
    if not hh:
        raise HTTPException(404, "Household not found")
    return hh


@router.get("")
def list_households(page: int = 1, page_size: int = 20, district: str | None = None,
                     q: str | None = None, session: Session = Depends(get_session),
                     user: User = Depends(require_any_permission(*VIEW_PERMS))):
    filters = []
    if district:
        filters.append(Household.district == district)
    if q:
        filters.append(Household.household_code.contains(q))
    return paginate(session, Household, page, page_size, extra_filters=filters, order_by=Household.household_id.desc())


@router.post("")
def create_household(payload: dict, request: Request, session: Session = Depends(get_session),
                      user: User = Depends(require_permissions("REGISTER_BENEFICIARY"))):
    import uuid
    code = payload.get("household_code") or f"HH-{uuid.uuid4().hex[:8].upper()}"
    hh = Household(household_code=code, phone_number=payload.get("phone_number"),
                    alternative_phone=payload.get("alternative_phone"), district=payload["district"],
                    sector=payload["sector"], cell=payload["cell"], village=payload["village"],
                    address_details=payload.get("address_details"), latitude=payload.get("latitude"),
                    longitude=payload.get("longitude"), housing_status=payload.get("housing_status"),
                    created_by=user.user_id)
    session.add(hh)
    session.commit()
    session.refresh(hh)
    for m in payload.get("members", []):
        session.add(HouseholdMember(household_id=hh.household_id, first_name=m["first_name"],
                                     middle_name=m.get("middle_name"), last_name=m["last_name"],
                                     national_id=m.get("national_id"), gender=m["gender"],
                                     date_of_birth=m["date_of_birth"], relationship_to_head=m["relationship_to_head"],
                                     marital_status=m.get("marital_status"), phone_number=m.get("phone_number"),
                                     disability_status=m.get("disability_status"),
                                     vulnerability_status=m.get("vulnerability_status")))
    session.commit()
    log_action(session, user.user_id, "CREATE", "household", hh.household_id, f"Registered household {code}", client_ip(request))
    return {"id": hh.household_id, "household_code": code}


@router.get("/{household_id}")
def get_household(household_id: int, session: Session = Depends(get_session), user: User = Depends(require_any_permission(*VIEW_PERMS))):
    hh = _get_household_or_404(session, household_id)
    members = session.exec(select(HouseholdMember).where(HouseholdMember.household_id == household_id)).all()
    return {**hh.dict(), "members": members}


@router.put("/{household_id}")
def update_household(household_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
                      user: User = Depends(require_permissions("REGISTER_BENEFICIARY"))):
    hh = _get_household_or_404(session, household_id)
    for field in ("phone_number", "alternative_phone", "district", "sector", "cell", "village",
                   "address_details", "latitude", "longitude", "housing_status", "status"):
        if field in payload:
            setattr(hh, field, payload[field])
    hh.updated_at = datetime.utcnow()
    session.add(hh)
    session.commit()
    log_action(session, user.user_id, "UPDATE", "household", household_id, "Updated household", client_ip(request))
    return {"ok": True}


@router.delete("/{household_id}")
def delete_household(household_id: int, request: Request, session: Session = Depends(get_session),
                      user: User = Depends(require_permissions("REGISTER_BENEFICIARY"))):
    hh = _get_household_or_404(session, household_id)
    linked = session.exec(select(Assessment).where(Assessment.household_id == household_id)).first()
    if linked:
        raise HTTPException(400, "Cannot delete: this household has assessment records on file")
    for m in session.exec(select(HouseholdMember).where(HouseholdMember.household_id == household_id)).all():
        session.delete(m)
    session.delete(hh)
    session.commit()
    log_action(session, user.user_id, "DELETE", "household", household_id, f"Deleted household {hh.household_code}", client_ip(request))
    return {"ok": True}


# ---------- Household members ----------

@router.post("/{household_id}/members")
def add_member(household_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
                user: User = Depends(require_permissions("REGISTER_BENEFICIARY"))):
    _get_household_or_404(session, household_id)
    m = HouseholdMember(household_id=household_id, first_name=payload["first_name"],
                         middle_name=payload.get("middle_name"), last_name=payload["last_name"],
                         national_id=payload.get("national_id"), gender=payload["gender"],
                         date_of_birth=payload["date_of_birth"], relationship_to_head=payload["relationship_to_head"],
                         marital_status=payload.get("marital_status"), phone_number=payload.get("phone_number"),
                         disability_status=payload.get("disability_status"),
                         vulnerability_status=payload.get("vulnerability_status"))
    session.add(m)
    session.commit()
    session.refresh(m)
    log_action(session, user.user_id, "CREATE", "household_member", m.member_id, "Added household member", client_ip(request))
    return {"id": m.member_id}


@router.put("/{household_id}/members/{member_id}")
def update_member(household_id: int, member_id: int, payload: dict, request: Request,
                   session: Session = Depends(get_session), user: User = Depends(require_permissions("REGISTER_BENEFICIARY"))):
    m = session.get(HouseholdMember, member_id)
    if not m or m.household_id != household_id:
        raise HTTPException(404, "Household member not found")
    for field in ("first_name", "middle_name", "last_name", "national_id", "gender", "date_of_birth",
                   "relationship_to_head", "marital_status", "phone_number", "disability_status", "vulnerability_status"):
        if field in payload:
            setattr(m, field, payload[field])
    m.updated_at = datetime.utcnow()
    session.add(m)
    session.commit()
    log_action(session, user.user_id, "UPDATE", "household_member", member_id, "Updated household member", client_ip(request))
    return {"ok": True}


@router.delete("/{household_id}/members/{member_id}")
def delete_member(household_id: int, member_id: int, request: Request, session: Session = Depends(get_session),
                   user: User = Depends(require_permissions("REGISTER_BENEFICIARY"))):
    m = session.get(HouseholdMember, member_id)
    if not m or m.household_id != household_id:
        raise HTTPException(404, "Household member not found")
    session.delete(m)
    session.commit()
    log_action(session, user.user_id, "DELETE", "household_member", member_id, "Removed household member", client_ip(request))
    return {"ok": True}

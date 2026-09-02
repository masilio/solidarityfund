from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from app.db import get_session
from app.models import Assessment, AffectedAsset, SupportRequest, User
from app.deps import require_permissions, require_any_permission, client_ip
from app.audit import log_action
from app.pagination import paginate

router = APIRouter(prefix="/assessments", tags=["assessments"])
VIEW_PERMS = ("REGISTER_BENEFICIARY", "VERIFY_SUPPORT_REQUEST", "ALLOCATE_SUPPORT_REQUEST",
              "APPROVE_SUPPORT_REQUEST", "SUBMIT_SUPPORT_REQUEST", "VIEW_REQUEST_HISTORY")


def _get_assessment_or_404(session: Session, assessment_id: int) -> Assessment:
    a = session.get(Assessment, assessment_id)
    if not a:
        raise HTTPException(404, "Assessment not found")
    return a


@router.get("")
def list_assessments(page: int = 1, page_size: int = 20, status: str | None = None,
                      household_id: int | None = None, session: Session = Depends(get_session),
                      user: User = Depends(require_any_permission(*VIEW_PERMS))):
    filters = []
    if status:
        filters.append(Assessment.status == status)
    if household_id:
        filters.append(Assessment.household_id == household_id)
    return paginate(session, Assessment, page, page_size, extra_filters=filters, order_by=Assessment.assessment_id.desc())


@router.post("")
def create_assessment(payload: dict, request: Request, session: Session = Depends(get_session),
                       user: User = Depends(require_permissions("REGISTER_BENEFICIARY"))):
    """Response staff records the household's disaster impact assessment plus its affected assets."""
    a = Assessment(household_id=payload["household_id"], disaster_id=payload["disaster_id"],
                    assessed_by=user.user_id, assessment_date=payload["assessment_date"],
                    vulnerability_level=payload["vulnerability_level"], impact_level=payload["impact_level"],
                    house_condition=payload["house_condition"], livelihood_condition=payload.get("livelihood_condition"),
                    displacement_status=payload["displacement_status"], current_shelter=payload.get("current_shelter"),
                    people_injured=payload.get("people_injured", 0), people_missing=payload.get("people_missing", 0),
                    people_deceased=payload.get("people_deceased", 0), assessment_notes=payload.get("assessment_notes"))
    session.add(a)
    session.commit()
    session.refresh(a)
    for asset in payload.get("affected_assets", []):
        session.add(AffectedAsset(assessment_id=a.assessment_id, asset_name=asset["asset_name"],
                                   asset_type=asset["asset_type"], damage_status=asset["damage_status"],
                                   damage_level=asset.get("damage_level"), quantity=asset["quantity"],
                                   unit=asset["unit"], estimated_loss=asset.get("estimated_loss"),
                                   description=asset.get("description")))
    session.commit()
    log_action(session, user.user_id, "CREATE", "assessment", a.assessment_id, "Recorded household assessment", client_ip(request))
    return {"id": a.assessment_id}


@router.get("/{assessment_id}")
def get_assessment(assessment_id: int, session: Session = Depends(get_session), user: User = Depends(require_any_permission(*VIEW_PERMS))):
    a = _get_assessment_or_404(session, assessment_id)
    assets = session.exec(select(AffectedAsset).where(AffectedAsset.assessment_id == assessment_id)).all()
    return {**a.dict(), "affected_assets": assets}


@router.put("/{assessment_id}")
def update_assessment(assessment_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
                       user: User = Depends(require_permissions("REGISTER_BENEFICIARY"))):
    a = _get_assessment_or_404(session, assessment_id)
    if a.status == "VERIFIED":
        raise HTTPException(400, "Cannot edit an assessment that has already been verified")
    for field in ("household_id", "disaster_id", "assessment_date", "vulnerability_level", "impact_level",
                   "house_condition", "livelihood_condition", "displacement_status", "current_shelter",
                   "people_injured", "people_missing", "people_deceased", "assessment_notes"):
        if field in payload:
            setattr(a, field, payload[field])
    a.updated_at = datetime.utcnow()
    session.add(a)
    session.commit()
    log_action(session, user.user_id, "UPDATE", "assessment", assessment_id, "Updated assessment", client_ip(request))
    return {"ok": True}


@router.delete("/{assessment_id}")
def delete_assessment(assessment_id: int, request: Request, session: Session = Depends(get_session),
                       user: User = Depends(require_permissions("REGISTER_BENEFICIARY"))):
    a = _get_assessment_or_404(session, assessment_id)
    linked = session.exec(select(SupportRequest).where(SupportRequest.assessment_id == assessment_id)).first()
    if linked:
        raise HTTPException(400, "Cannot delete: a support request has already been raised against this assessment")
    for asset in session.exec(select(AffectedAsset).where(AffectedAsset.assessment_id == assessment_id)).all():
        session.delete(asset)
    session.delete(a)
    session.commit()
    log_action(session, user.user_id, "DELETE", "assessment", assessment_id, "Deleted assessment", client_ip(request))
    return {"ok": True}


@router.post("/{assessment_id}/verify")
def verify_assessment(assessment_id: int, request: Request, session: Session = Depends(get_session),
                       user: User = Depends(require_permissions("VERIFY_SUPPORT_REQUEST"))):
    a = _get_assessment_or_404(session, assessment_id)
    a.status = "VERIFIED"
    a.verified_by = user.user_id
    a.verified_at = datetime.utcnow()
    session.add(a)
    session.commit()
    log_action(session, user.user_id, "VERIFY", "assessment", assessment_id, "Verified assessment", client_ip(request))
    return {"ok": True}


# ---------- Affected assets ----------

@router.post("/{assessment_id}/assets")
def add_asset(assessment_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
              user: User = Depends(require_permissions("REGISTER_BENEFICIARY"))):
    _get_assessment_or_404(session, assessment_id)
    asset = AffectedAsset(assessment_id=assessment_id, asset_name=payload["asset_name"],
                           asset_type=payload["asset_type"], damage_status=payload["damage_status"],
                           damage_level=payload.get("damage_level"), quantity=payload["quantity"],
                           unit=payload["unit"], estimated_loss=payload.get("estimated_loss"),
                           description=payload.get("description"))
    session.add(asset)
    session.commit()
    session.refresh(asset)
    log_action(session, user.user_id, "CREATE", "affected_asset", asset.affected_asset_id, "Added affected asset", client_ip(request))
    return {"id": asset.affected_asset_id}


@router.put("/{assessment_id}/assets/{asset_id}")
def update_asset(assessment_id: int, asset_id: int, payload: dict, request: Request,
                  session: Session = Depends(get_session), user: User = Depends(require_permissions("REGISTER_BENEFICIARY"))):
    asset = session.get(AffectedAsset, asset_id)
    if not asset or asset.assessment_id != assessment_id:
        raise HTTPException(404, "Affected asset not found")
    for field in ("asset_name", "asset_type", "damage_status", "damage_level", "quantity", "unit",
                   "estimated_loss", "description"):
        if field in payload:
            setattr(asset, field, payload[field])
    session.add(asset)
    session.commit()
    log_action(session, user.user_id, "UPDATE", "affected_asset", asset_id, "Updated affected asset", client_ip(request))
    return {"ok": True}


@router.delete("/{assessment_id}/assets/{asset_id}")
def delete_asset(assessment_id: int, asset_id: int, request: Request, session: Session = Depends(get_session),
                  user: User = Depends(require_permissions("REGISTER_BENEFICIARY"))):
    asset = session.get(AffectedAsset, asset_id)
    if not asset or asset.assessment_id != assessment_id:
        raise HTTPException(404, "Affected asset not found")
    session.delete(asset)
    session.commit()
    log_action(session, user.user_id, "DELETE", "affected_asset", asset_id, "Removed affected asset", client_ip(request))
    return {"ok": True}

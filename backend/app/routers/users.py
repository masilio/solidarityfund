
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select
from app.db import get_session
from app.models import User, Role, UserRole, Permission, RolePermission, UserPermission
from app.security import hash_password
from app.deps import require_permissions, get_current_user, get_user_roles, get_user_permissions, client_ip
from app.audit import log_action
from app.pagination import paginate

router = APIRouter(prefix="/users", tags=["users"])


def _user_brief(user: User, session: Session) -> dict:
    roles = get_user_roles(user, session)
    perms = get_user_permissions(user, session)
    return {**user.dict(exclude={"password_hash"}), "roles": roles,
            "permissions": sorted(perms) if "ADMINISTRATOR" not in roles else "ALL"}


@router.get("")
def list_users(page: int = 1, page_size: int = 20, session: Session = Depends(get_session),
               user: User = Depends(require_permissions("MANAGE_USERS"))):
    result = paginate(session, User, page, page_size, order_by=User.user_id)
    result["items"] = [_user_brief(u, session) for u in result["items"]]
    return result


@router.post("")
def create_user(payload: dict, request: Request, session: Session = Depends(get_session),
                 admin: User = Depends(require_permissions("MANAGE_USERS"))):
    if session.exec(select(User).where(User.email == payload["email"])).first():
        raise HTTPException(400, "Email already registered")
    user = User(email=payload["email"], password_hash=hash_password(payload["password"]),
                first_name=payload["first_name"], last_name=payload["last_name"],
                phone_number=payload.get("phone_number"))
    session.add(user)
    session.commit()
    session.refresh(user)
    for role_id in payload.get("role_ids", []):
        session.add(UserRole(user_id=user.user_id, role_id=role_id))
    session.commit()
    log_action(session, admin.user_id, "CREATE", "user", user.user_id, f"Created user {user.email}", client_ip(request))
    return {"id": user.user_id}


@router.get("/roles")
def list_roles(session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    return session.exec(select(Role)).all()


@router.post("/roles")
def create_role(payload: dict, request: Request, session: Session = Depends(get_session),
                 admin: User = Depends(require_permissions("ASSIGN_ROLES"))):
    role = Role(role_name=payload["role_name"], description=payload.get("description"))
    session.add(role)
    session.commit()
    session.refresh(role)
    log_action(session, admin.user_id, "CREATE", "role", role.role_id, f"Created role {role.role_name}", client_ip(request))
    return role


@router.put("/roles/{role_id}")
def update_role(role_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
                 admin: User = Depends(require_permissions("ASSIGN_ROLES"))):
    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    for field in ("role_name", "description"):
        if field in payload:
            setattr(role, field, payload[field])
    session.add(role)
    session.commit()
    log_action(session, admin.user_id, "UPDATE", "role", role_id, "Updated role", client_ip(request))
    return {"ok": True}


@router.delete("/roles/{role_id}")
def delete_role(role_id: int, request: Request, session: Session = Depends(get_session),
                 admin: User = Depends(require_permissions("ASSIGN_ROLES"))):
    role = session.get(Role, role_id)
    if not role:
        raise HTTPException(404, "Role not found")
    if session.exec(select(UserRole).where(UserRole.role_id == role_id)).first():
        raise HTTPException(400, "Cannot delete: one or more users are still assigned this role")
    session.delete(role)
    session.commit()
    log_action(session, admin.user_id, "DELETE", "role", role_id, f"Deleted role {role.role_name}", client_ip(request))
    return {"ok": True}


@router.get("/permissions")
def list_permissions(session: Session = Depends(get_session), user: User = Depends(require_permissions("ASSIGN_PERMISSIONS"))):
    """The full permission catalog, for rendering an admin's permission-assignment UI."""
    rows = session.exec(select(Permission)).all()
    return [{"code": p.permission_code, "description": p.description} for p in rows]


@router.get("/{user_id}")
def get_user(user_id: int, session: Session = Depends(get_session), admin: User = Depends(require_permissions("MANAGE_USERS"))):
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    return _user_brief(target, session)


@router.put("/{user_id}")
def update_user(user_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
                 admin: User = Depends(require_permissions("MANAGE_USERS"))):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    for field in ("first_name", "last_name", "phone_number"):
        if field in payload:
            setattr(user, field, payload[field])
    if payload.get("password"):
        user.password_hash = hash_password(payload["password"])
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    log_action(session, admin.user_id, "UPDATE", "user", user_id, "Updated user profile", client_ip(request))
    return {"ok": True}


@router.post("/{user_id}/lock")
def lock_user(user_id: int, request: Request, session: Session = Depends(get_session),
              admin: User = Depends(require_permissions("MANAGE_USERS"))):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.status = "LOCKED"
    session.add(user)
    session.commit()
    log_action(session, admin.user_id, "LOCK", "user", user_id, "Locked user account", client_ip(request))
    return {"ok": True}


@router.post("/{user_id}/unlock")
def unlock_user(user_id: int, request: Request, session: Session = Depends(get_session),
                 admin: User = Depends(require_permissions("MANAGE_USERS"))):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.status = "ACTIVE"
    session.add(user)
    session.commit()
    log_action(session, admin.user_id, "UNLOCK", "user", user_id, "Unlocked user account", client_ip(request))
    return {"ok": True}


@router.put("/{user_id}/roles")
def set_user_roles(user_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
                    admin: User = Depends(require_permissions("ASSIGN_ROLES"))):
    """payload: {"role_ids": [1,2]} — replaces the user's role assignments."""
    for ur in session.exec(select(UserRole).where(UserRole.user_id == user_id)).all():
        session.delete(ur)
    for role_id in payload.get("role_ids", []):
        session.add(UserRole(user_id=user_id, role_id=role_id))
    session.commit()
    log_action(session, admin.user_id, "UPDATE", "user_role", user_id, "Reassigned roles", client_ip(request))
    return {"ok": True}


@router.put("/{user_id}/permissions")
def set_user_permissions(user_id: int, payload: dict, request: Request, session: Session = Depends(get_session),
                          admin: User = Depends(require_permissions("ASSIGN_PERMISSIONS"))):
    """payload: {"permission_codes": [...]} — the FULL desired effective set for this user.
    Only the codes that differ from what the user's role(s) already grant by default are
    stored as UserPermission override rows (granted=True to add one, granted=False to revoke
    one); anything matching the role default goes back to having no override row at all, so
    this table only ever holds actual exceptions, not a full copy of every permission."""
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    desired = set(payload.get("permission_codes", []))

    role_names = get_user_roles(target, session)
    role_ids = session.exec(select(Role.role_id).where(Role.role_name.in_(role_names))).all()
    default_ids = session.exec(select(RolePermission.permission_id).where(RolePermission.role_id.in_(role_ids))).all()
    perm_rows = session.exec(select(Permission)).all()
    code_by_id = {p.permission_id: p.permission_code for p in perm_rows}
    id_by_code = {p.permission_code: p.permission_id for p in perm_rows}
    default_codes = {code_by_id[pid] for pid in default_ids if pid in code_by_id}

    existing_overrides = {o.permission_id: o for o in
                           session.exec(select(UserPermission).where(UserPermission.user_id == user_id)).all()}

    for code, pid in id_by_code.items():
        wants_it = code in desired
        default_has_it = code in default_codes
        existing = existing_overrides.get(pid)
        if wants_it == default_has_it:
            if existing:
                session.delete(existing)
        else:
            if existing:
                existing.granted = wants_it
                session.add(existing)
            else:
                session.add(UserPermission(user_id=user_id, permission_id=pid, granted=wants_it, assigned_by=admin.user_id))
    session.commit()
    log_action(session, admin.user_id, "UPDATE", "user_permission", user_id, "Updated permission overrides", client_ip(request))
    return {"ok": True}

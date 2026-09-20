from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session, select
from app.db import get_session
from app.security import decode_access_token
from app.models import User, UserRole, Role, Permission, RolePermission, UserPermission

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), session: Session = Depends(get_session)) -> User:
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = session.get(User, int(payload["sub"]))
    if not user or user.status != "ACTIVE":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account not active")
    return user


def get_user_roles(user: User, session: Session) -> list[str]:
    rows = session.exec(
        select(Role.role_name).join(UserRole, UserRole.role_id == Role.role_id).where(UserRole.user_id == user.user_id)
    ).all()
    return list(rows)


def get_user_permissions(user: User, session: Session) -> set[str]:
   
    role_names = get_user_roles(user, session)
    if not role_names:
        return set()
    role_ids = session.exec(select(Role.role_id).where(Role.role_name.in_(role_names))).all()
    default_ids = session.exec(select(RolePermission.permission_id).where(RolePermission.role_id.in_(role_ids))).all()
    code_by_id = {p.permission_id: p.permission_code for p in session.exec(select(Permission)).all()}
    effective = {code_by_id[pid] for pid in default_ids if pid in code_by_id}

    overrides = session.exec(select(UserPermission).where(UserPermission.user_id == user.user_id)).all()
    for o in overrides:
        code = code_by_id.get(o.permission_id)
        if not code:
            continue
        if o.granted:
            effective.add(code)
        else:
            effective.discard(code)
    return effective


def require_roles(*allowed_roles: str):
   

    def checker(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> User:
        roles = get_user_roles(user, session)
        if "ADMINISTRATOR" in roles or any(r in allowed_roles for r in roles):
            return user
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")

    return checker


def require_permissions(*required_codes: str):
   

    def checker(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> User:
        roles = get_user_roles(user, session)
        if "ADMINISTRATOR" in roles:
            return user
        effective = get_user_permissions(user, session)
        if all(code in effective for code in required_codes):
            return user
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")

    return checker


def require_any_permission(*acceptable_codes: str):
   

    def checker(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> User:
        roles = get_user_roles(user, session)
        if "ADMINISTRATOR" in roles:
            return user
        effective = get_user_permissions(user, session)
        if any(code in effective for code in acceptable_codes):
            return user
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")

    return checker


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select
from app.db import get_session
from app.models import User, Role, UserRole, Contributor
from app.security import verify_password, hash_password, create_access_token
from app.deps import get_current_user, get_user_roles, get_user_permissions, client_ip
from app.audit import log_action

router = APIRouter(prefix="/auth", tags=["auth"])


def _linked_contributor(user: User, session: Session) -> dict | None:
    c = session.exec(select(Contributor).where(Contributor.user_id == user.user_id)).first()
    return {"id": c.contributor_id, "name": c.contributor_name} if c else None


@router.post("/login")
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == form.username)).first()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if user.status != "ACTIVE":
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Account is {user.status.lower()}")
    roles = get_user_roles(user, session)
    token = create_access_token(str(user.user_id), roles)
    user.last_login_at = datetime.utcnow()
    session.add(user)
    session.commit()
    log_action(session, user.user_id, "LOGIN", "user", user.user_id, "User logged in", client_ip(request))
    permissions = sorted(get_user_permissions(user, session)) if "ADMINISTRATOR" not in roles else "ALL"
    return {"access_token": token, "token_type": "bearer", "roles": roles, "permissions": permissions,
            "contributor": _linked_contributor(user, session),
            "user": {"id": user.user_id, "name": f"{user.first_name} {user.last_name}", "email": user.email}}


@router.post("/register")
def register(payload: dict, request: Request, session: Session = Depends(get_session)):
    """Public self-registration — no auth required; the landing page's "Donation" button.
    Looks like the Contributor form (contributor_name, contributor_type, phone_number,
    email, address) plus a password, because that's what it actually creates: a Contributor
    record (the organization/individual doing the giving) linked to a new User account (how
    they log in) with the CONTRIBUTOR role — not just a bare user account. Always CONTRIBUTOR;
    anyone needing a staff role goes through an administrator via POST /users instead."""
    if session.exec(select(User).where(User.email == payload["email"])).first():
        raise HTTPException(400, "Email already registered")
    contributor_role = session.exec(select(Role).where(Role.role_name == "CONTRIBUTOR")).first()
    if not contributor_role:
        raise HTTPException(500, "CONTRIBUTOR role is not configured")

    contributor_name = payload["contributor_name"]
    name_parts = contributor_name.strip().split(maxsplit=1)
    first_name, last_name = name_parts[0], (name_parts[1] if len(name_parts) > 1 else name_parts[0])

    user = User(email=payload["email"], password_hash=hash_password(payload["password"]),
                first_name=first_name, last_name=last_name, phone_number=payload.get("phone_number"))
    session.add(user)
    session.commit()
    session.refresh(user)
    session.add(UserRole(user_id=user.user_id, role_id=contributor_role.role_id))

    contributor = Contributor(contributor_name=contributor_name, contributor_type=payload["contributor_type"],
                               phone_number=payload.get("phone_number"), email=payload["email"],
                               address=payload.get("address"), user_id=user.user_id)
    session.add(contributor)
    session.commit()
    log_action(session, user.user_id, "CREATE", "user", user.user_id, "Self-registered as contributor", client_ip(request))
    return {"id": user.user_id}


@router.get("/me")
def me(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    roles = get_user_roles(user, session)
    permissions = sorted(get_user_permissions(user, session)) if "ADMINISTRATOR" not in roles else "ALL"
    return {"id": user.user_id, "email": user.email, "first_name": user.first_name,
            "last_name": user.last_name, "phone_number": user.phone_number, "status": user.status,
            "last_login_at": user.last_login_at, "created_at": user.created_at,
            "roles": roles, "permissions": permissions, "contributor": _linked_contributor(user, session)}

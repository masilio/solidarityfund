from sqlmodel import Session, select
from app.db import engine, init_db
from app.models import User, Role, UserRole, Permission, RolePermission
from app.security import hash_password
from app.config import settings
from app.permissions import PERMISSIONS, DEFAULT_ROLE_PERMISSIONS

ROLES = ["ADMINISTRATOR", "RESPONSE_MANAGER", "RESOURCE_MANAGER", "CONTRIBUTOR"]


def run():
    init_db()
    with Session(engine) as session:
        role_ids = {}
        for name in ROLES:
            role = session.exec(select(Role).where(Role.role_name == name)).first()
            if not role:
                role = Role(role_name=name, description=f"{name.replace('_', ' ').title()} role")
                session.add(role)
                session.commit()
                session.refresh(role)
            role_ids[name] = role.role_id

        permission_ids = {}
        for code, description in PERMISSIONS:
            perm = session.exec(select(Permission).where(Permission.permission_code == code)).first()
            if not perm:
                perm = Permission(permission_code=code, description=description)
                session.add(perm)
                session.commit()
                session.refresh(perm)
            permission_ids[code] = perm.permission_id

        for role_name, codes in DEFAULT_ROLE_PERMISSIONS.items():
            role_id = role_ids.get(role_name)
            if not role_id:
                continue
            existing = {rp.permission_id for rp in
                        session.exec(select(RolePermission).where(RolePermission.role_id == role_id)).all()}
            for code in codes:
                pid = permission_ids.get(code)
                if pid and pid not in existing:
                    session.add(RolePermission(role_id=role_id, permission_id=pid))
        session.commit()

        admin = session.exec(select(User).where(User.email == settings.admin_email)).first()
        if not admin:
            admin = User(email=settings.admin_email, password_hash=hash_password(settings.admin_password),
                         first_name="System", last_name="Administrator", status="ACTIVE")
            session.add(admin)
            session.commit()
            session.refresh(admin)
            session.add(UserRole(user_id=admin.user_id, role_id=role_ids["ADMINISTRATOR"]))
            session.commit()
            print(f"Seeded administrator: {settings.admin_email} / {settings.admin_password}")
        else:
            print("Administrator already exists, skipping seed.")


if __name__ == "__main__":
    run()

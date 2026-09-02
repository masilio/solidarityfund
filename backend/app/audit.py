from sqlmodel import Session
from app.models import AuditLog


def log_action(session: Session, user_id: int | None, action: str, table_name: str,
                record_id: int | None = None, description: str | None = None, ip: str | None = None) -> None:
    """Single helper called from every write endpoint so every mutation is traceable."""
    entry = AuditLog(user_id=user_id, action=action, table_name=table_name,
                      record_id=record_id, description=description, ip_address=ip)
    session.add(entry)
    session.commit()

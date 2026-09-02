"""Read-only audit trail viewer. audit_log itself is immutable — every other router writes
to it via app.audit.log_action(); this router only ever lists/filters it, never edits it."""
from fastapi import APIRouter, Depends
from sqlmodel import Session
from app.db import get_session
from app.models import AuditLog, User
from app.deps import require_permissions
from app.pagination import paginate

router = APIRouter(prefix="/audit-log", tags=["audit-log"])


@router.get("")
def list_audit_log(page: int = 1, page_size: int = 30, action: str | None = None, table_name: str | None = None,
                    user_id: int | None = None, session: Session = Depends(get_session),
                    admin: User = Depends(require_permissions("VIEW_AUDIT_LOGS"))):
    filters = []
    if action:
        filters.append(AuditLog.action == action)
    if table_name:
        filters.append(AuditLog.table_name == table_name)
    if user_id:
        filters.append(AuditLog.user_id == user_id)
    return paginate(session, AuditLog, page, page_size, extra_filters=filters, order_by=AuditLog.audit_log_id.desc())

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import io
from sqlmodel import Session
from app.db import get_session
from app.deps import require_permissions, client_ip
from app.models import User
from app.audit import log_action
from app import reports as rpt

router = APIRouter(prefix="/reports", tags=["reports"])

MEDIA = {
    "pdf": "application/pdf",
    "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "word": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
EXT = {"pdf": "pdf", "excel": "xlsx", "word": "docx"}
RENDERERS = {"pdf": rpt.render_pdf, "excel": rpt.render_excel, "word": rpt.render_word}


@router.get("/types")
def report_types(user: User = Depends(require_permissions("VIEW_REPORTS"))):
    return [{"key": k, "title": v["title"]} for k, v in rpt.REPORT_DEFINITIONS.items()]


@router.get("/{report_key}")
def generate_report(report_key: str, format: str = "pdf", status: str | None = None,
                     date_from: datetime | None = None, date_to: datetime | None = None,
                     session: Session = Depends(get_session),
                     user: User = Depends(require_permissions("VIEW_REPORTS"))):
    if report_key not in rpt.REPORT_DEFINITIONS:
        raise HTTPException(404, "Unknown report type")
    if format not in RENDERERS:
        raise HTTPException(400, "format must be pdf, excel or word")

    definition, rows = rpt.fetch_rows(session, report_key, {"status": status, "date_from": date_from, "date_to": date_to})
    content = RENDERERS[format](definition["title"], definition["headers"], rows)
    log_action(session, user.user_id, "EXPORT", report_key, None, f"Exported {report_key} as {format}")

    filename = f"{report_key}_{datetime.utcnow().strftime('%Y%m%d_%H%M')}.{EXT[format]}"
    return StreamingResponse(io.BytesIO(content), media_type=MEDIA[format],
                              headers={"Content-Disposition": f'attachment; filename="{filename}"'})

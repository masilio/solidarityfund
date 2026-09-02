from typing import TypeVar, Generic
from pydantic import BaseModel
from sqlmodel import SQLModel, Session, select, func
from app.config import settings

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int


def paginate(session: Session, model, page: int = 1, page_size: int = None, extra_filters: list = None, order_by=None):
    page = max(page, 1)
    page_size = min(page_size or settings.page_size_default, settings.page_size_max)
    stmt = select(model)
    count_stmt = select(func.count()).select_from(model)
    for f in (extra_filters or []):
        stmt = stmt.where(f)
        count_stmt = count_stmt.where(f)
    if order_by is not None:
        stmt = stmt.order_by(order_by)
    total = session.exec(count_stmt).one()
    items = session.exec(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    total_pages = (total + page_size - 1) // page_size if total else 0
    return {"items": items, "total": total, "page": page, "page_size": page_size, "total_pages": total_pages}

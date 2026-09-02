from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select, func
from app.db import get_session
from app.models import Item, ItemCategory, FundInventory, StockMovement, FundLedger, SupportRequestItem, ItemContribution, User
from app.deps import require_permissions, require_any_permission, client_ip
from app.audit import log_action
from app.pagination import paginate

router = APIRouter(prefix="/inventory", tags=["inventory"])
READ_PERMS = ("MANAGE_INVENTORY", "SUBMIT_SUPPORT_REQUEST", "VERIFY_SUPPORT_REQUEST",
              "ALLOCATE_SUPPORT_REQUEST", "REGISTER_BENEFICIARY", "RECORD_CONTRIBUTION", "CONFIRM_CONTRIBUTION")
MANAGE_PERM = "MANAGE_INVENTORY"


# ---------- Categories ----------

@router.get("/categories")
def list_categories(session: Session = Depends(get_session), user: User = Depends(require_any_permission(*READ_PERMS))):
    return session.exec(select(ItemCategory)).all()


@router.post("/categories")
def create_category(payload: dict, request: Request, session: Session = Depends(get_session), user: User = Depends(require_permissions(MANAGE_PERM))):
    c = ItemCategory(category_name=payload["category_name"], description=payload.get("description"))
    session.add(c); session.commit(); session.refresh(c)
    log_action(session, user.user_id, "CREATE", "item_category", c.category_id, f"Created category {c.category_name}", client_ip(request))
    return c


@router.put("/categories/{category_id}")
def update_category(category_id: int, payload: dict, request: Request, session: Session = Depends(get_session), user: User = Depends(require_permissions(MANAGE_PERM))):
    c = session.get(ItemCategory, category_id)
    if not c:
        raise HTTPException(404, "Item category not found")
    for field in ("category_name", "description", "status"):
        if field in payload:
            setattr(c, field, payload[field])
    c.updated_at = datetime.utcnow()
    session.add(c); session.commit()
    log_action(session, user.user_id, "UPDATE", "item_category", category_id, "Updated item category", client_ip(request))
    return {"ok": True}


@router.delete("/categories/{category_id}")
def delete_category(category_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(require_permissions(MANAGE_PERM))):
    c = session.get(ItemCategory, category_id)
    if not c:
        raise HTTPException(404, "Item category not found")
    if session.exec(select(Item).where(Item.category_id == category_id)).first():
        raise HTTPException(400, "Cannot delete: one or more items still belong to this category")
    session.delete(c); session.commit()
    log_action(session, user.user_id, "DELETE", "item_category", category_id, "Deleted item category", client_ip(request))
    return {"ok": True}


# ---------- Items ----------

@router.get("/items")
def list_items(page: int = 1, page_size: int = 50, session: Session = Depends(get_session), user: User = Depends(require_any_permission(*READ_PERMS))):
    return paginate(session, Item, page, page_size, order_by=Item.item_id)


@router.post("/items")
def create_item(payload: dict, request: Request, session: Session = Depends(get_session), user: User = Depends(require_permissions(MANAGE_PERM))):
    it = Item(category_id=payload["category_id"], item_name=payload["item_name"],
              unit_of_measure=payload["unit_of_measure"], description=payload.get("description"))
    session.add(it); session.commit(); session.refresh(it)
    session.add(FundInventory(item_id=it.item_id, quantity_available=0, reorder_level=payload.get("reorder_level", 0)))
    session.commit()
    log_action(session, user.user_id, "CREATE", "item", it.item_id, f"Created item {it.item_name}", client_ip(request))
    return it


@router.get("/items/{item_id}")
def get_item(item_id: int, session: Session = Depends(get_session), user: User = Depends(require_any_permission(*READ_PERMS))):
    it = session.get(Item, item_id)
    if not it:
        raise HTTPException(404, "Item not found")
    inv = session.exec(select(FundInventory).where(FundInventory.item_id == item_id)).first()
    return {**it.dict(), "inventory": inv}


@router.put("/items/{item_id}")
def update_item(item_id: int, payload: dict, request: Request, session: Session = Depends(get_session), user: User = Depends(require_permissions(MANAGE_PERM))):
    it = session.get(Item, item_id)
    if not it:
        raise HTTPException(404, "Item not found")
    for field in ("category_id", "item_name", "unit_of_measure", "description", "status"):
        if field in payload:
            setattr(it, field, payload[field])
    it.updated_at = datetime.utcnow()
    session.add(it); session.commit()
    log_action(session, user.user_id, "UPDATE", "item", item_id, "Updated item", client_ip(request))
    return {"ok": True}


@router.delete("/items/{item_id}")
def delete_item(item_id: int, request: Request, session: Session = Depends(get_session), user: User = Depends(require_permissions(MANAGE_PERM))):
    it = session.get(Item, item_id)
    if not it:
        raise HTTPException(404, "Item not found")
    inv = session.exec(select(FundInventory).where(FundInventory.item_id == item_id)).first()
    if inv and inv.quantity_available > 0:
        raise HTTPException(400, "Cannot delete: item still has stock on hand — deplete inventory first")
    if session.exec(select(StockMovement).where(StockMovement.item_id == item_id)).first():
        raise HTTPException(400, "Cannot delete: item already has recorded stock movements")
    if session.exec(select(SupportRequestItem).where(SupportRequestItem.item_id == item_id)).first():
        raise HTTPException(400, "Cannot delete: item is referenced by one or more support requests")
    if session.exec(select(ItemContribution).where(ItemContribution.item_id == item_id)).first():
        raise HTTPException(400, "Cannot delete: item is referenced by one or more contributions")
    if inv:
        session.delete(inv)
    session.delete(it)
    session.commit()
    log_action(session, user.user_id, "DELETE", "item", item_id, "Deleted item", client_ip(request))
    return {"ok": True}


# ---------- Fund inventory (stock levels) ----------

@router.get("/stock")
def stock_levels(page: int = 1, page_size: int = 50, session: Session = Depends(get_session), user: User = Depends(require_any_permission(*READ_PERMS))):
    return paginate(session, FundInventory, page, page_size, order_by=FundInventory.inventory_id)


@router.put("/stock/{item_id}/reorder-level")
def set_reorder_level(item_id: int, payload: dict, request: Request, session: Session = Depends(get_session), user: User = Depends(require_permissions(MANAGE_PERM))):
    """Fund inventory is otherwise a derived, append-only ledger (built from stock movements) — the
    reorder threshold is the one operational setting resource management staff needs to adjust directly."""
    inv = session.exec(select(FundInventory).where(FundInventory.item_id == item_id)).first()
    if not inv:
        raise HTTPException(404, "No inventory record found for this item")
    inv.reorder_level = payload["reorder_level"]
    inv.updated_at = datetime.utcnow()
    session.add(inv); session.commit()
    log_action(session, user.user_id, "UPDATE", "fund_inventory", inv.inventory_id, "Adjusted reorder level", client_ip(request))
    return {"ok": True}


# ---------- Movements & ledger (read-only, append-only by design) ----------

@router.get("/movements")
def stock_movements(page: int = 1, page_size: int = 20, movement_type: str | None = None,
                     session: Session = Depends(get_session), user: User = Depends(require_any_permission(*READ_PERMS))):
    filters = [StockMovement.movement_type == movement_type] if movement_type else []
    return paginate(session, StockMovement, page, page_size, extra_filters=filters, order_by=StockMovement.movement_id.desc())


@router.get("/ledger")
def fund_ledger(page: int = 1, page_size: int = 20, transaction_type: str | None = None,
                 session: Session = Depends(get_session), user: User = Depends(require_any_permission(*READ_PERMS))):
    filters = [FundLedger.transaction_type == transaction_type] if transaction_type else []
    return paginate(session, FundLedger, page, page_size, extra_filters=filters, order_by=FundLedger.cash_transaction_id.desc())


@router.get("/balance")
def cash_balance(session: Session = Depends(get_session), user: User = Depends(require_any_permission(*READ_PERMS))):
    """Available cash balance = sum of all IN transactions minus sum of all OUT transactions on
    fund_ledger, exactly as the schema describes it. Used when verifying a Cash support request,
    so resource management staff can see whether the fund can actually cover it."""
    inflow = session.exec(select(func.coalesce(func.sum(FundLedger.amount), 0)).where(FundLedger.transaction_type == "IN")).one()
    outflow = session.exec(select(func.coalesce(func.sum(FundLedger.amount), 0)).where(FundLedger.transaction_type == "OUT")).one()
    return {"cash_balance": float(inflow) - float(outflow)}

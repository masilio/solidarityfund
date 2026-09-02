"""
Generic, filterable report engine. One function builds the row data for a
named report; three renderers (PDF / Excel / Word) turn that data into a
downloadable file. Keeping renderers generic (title + headers + rows) means
adding a new report is just adding one entry to REPORT_DEFINITIONS.
"""
import io
from datetime import datetime
from sqlmodel import Session, select
from app.models import (SupportRequest, FundContribution, Contributor, CashContribution,
                         FundLedger, FundInventory, Item, Household, HouseholdMember,
                         FundSupport, CashSupport, ItemSupport, StockMovement, Approval)

# Brand palette kept high-contrast for readability on projectors / at distance.
NAVY = "1F3864"
ORANGE = "C55A11"
LIGHT_GREY = "F2F2F2"

REPORT_DEFINITIONS = {
    "support_requests": {
        "title": "Support Requests Report",
        "headers": ["ID", "Type", "Priority", "Status", "Approved Amount", "Request Date"],
        "row": None,  # built specially below (needs a join to the latest approval decision)
    },
    "contributions": {
        "title": "Fund Contributions Report",
        "headers": ["ID", "Contributor", "Status", "Date", "Cash Amount"],
        "row": None,  # built specially below (needs a join)
    },
    "fund_ledger": {
        "title": "Fund Ledger (Cash) Report",
        "headers": ["ID", "Type", "Amount", "Currency", "Reference", "Payment Method", "Date"],
        "row": lambda r: [r.cash_transaction_id, r.transaction_type, f"{r.amount:,.2f}", r.currency,
                           r.reference_type, r.payment_method, r.transaction_date.strftime("%Y-%m-%d %H:%M")],
    },
    "inventory": {
        "title": "Fund Inventory Report",
        "headers": ["Item ID", "Quantity Available", "Reorder Level", "Last Updated"],
        "row": lambda r: [r.item_id, r.quantity_available, r.reorder_level, r.updated_at.strftime("%Y-%m-%d")],
    },
    "distributions": {
        "title": "Assistance Received by Households",
        "headers": ["Household Code", "Head of Household", "Household Members", "Support Received", "Received Date"],
        "row": None,  # built specially below (household/head/member-count lookup + cash-or-item summary)
    },
    "households": {
        "title": "Registered Households Report",
        "headers": ["Code", "District", "Sector", "Cell", "Village", "Status"],
        "row": lambda r: [r.household_code, r.district, r.sector, r.cell, r.village, r.status],
    },
}

MODEL_MAP = {
    "support_requests": SupportRequest, "contributions": FundContribution, "fund_ledger": FundLedger,
    "inventory": FundInventory, "distributions": FundSupport, "households": Household,
}


def fetch_rows(session: Session, report_key: str, filters: dict):
    model = MODEL_MAP[report_key]
    stmt = select(model)
    if filters.get("status"):
        col = getattr(model, "status", None) or getattr(model, "verification_status", None)
        if col is not None:
            stmt = stmt.where(col == filters["status"])
    if filters.get("date_from") and hasattr(model, "created_at"):
        stmt = stmt.where(model.created_at >= filters["date_from"])
    if filters.get("date_to") and hasattr(model, "created_at"):
        stmt = stmt.where(model.created_at <= filters["date_to"])
    records = session.exec(stmt).all()

    definition = REPORT_DEFINITIONS[report_key]
    if report_key == "contributions":
        rows = []
        for r in records:
            contributor = session.get(Contributor, r.contributor_id)
            cash = session.exec(select(CashContribution).where(CashContribution.contribution_id == r.contribution_id)).first()
            rows.append([r.contribution_id, contributor.contributor_name if contributor else "-",
                         r.verification_status, str(r.contribution_date), f"{cash.amount:,.2f}" if cash else "-"])
        return definition, rows
    if report_key == "support_requests":
        rows = []
        for r in records:
            latest = session.exec(select(Approval).where(Approval.request_id == r.request_id)
                                   .order_by(Approval.approval_id.desc())).first()
            amount = f"{latest.approved_amount:,.2f}" if latest and latest.approved_amount else "-"
            rows.append([r.request_id, r.request_type, r.priority, r.status, amount, str(r.request_date)])
        return definition, rows
    if report_key == "distributions":
        rows = []
        for r in records:
            household = session.get(Household, r.household_id)
            members = session.exec(select(HouseholdMember).where(HouseholdMember.household_id == r.household_id)).all()
            head = next((m for m in members if (m.relationship_to_head or "").strip().lower() == "head"), None)
            head_name = f"{head.first_name} {head.last_name}" if head else "-"

            cash = session.exec(select(CashSupport).where(CashSupport.distribution_id == r.id)).first()
            item_lines = session.exec(select(ItemSupport).where(ItemSupport.distribution_id == r.id)).all()
            parts = []
            if cash:
                parts.append(f"Cash: {cash.amount:,.2f} {cash.currency}")
            if item_lines:
                described = []
                for line in item_lines:
                    item = session.get(Item, line.item_id)
                    described.append(f"{item.item_name if item else 'Item #' + str(line.item_id)} x{line.quantity:g} {line.unit}")
                parts.append("Materials: " + ", ".join(described))

            rows.append([household.household_code if household else "-", head_name, len(members),
                         "; ".join(parts) if parts else "-", str(r.distribution_date)])
        return definition, rows
    return definition, [definition["row"](r) for r in records]


def render_pdf(title: str, headers: list, rows: list) -> bytes:
    from reportlab.lib.pagesizes import landscape, A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas as pdfcanvas
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    PAGE_W, PAGE_H = landscape(A4)
    MARGIN = 18 * mm          # equal left/right/top margin
    FOOTER_RESERVE = 14 * mm  # extra room reserved below the table for the footer band

    class NumberedCanvas(pdfcanvas.Canvas):
        """Draws a branded footer with 'Page X of Y' — requires a second pass since the
        total page count isn't known until every page has been laid out once."""
        def __init__(self, *args, **kwargs):
            pdfcanvas.Canvas.__init__(self, *args, **kwargs)
            self._saved_page_states = []

        def showPage(self):
            self._saved_page_states.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total_pages = len(self._saved_page_states)
            for state in self._saved_page_states:
                self.__dict__.update(state)
                self._draw_footer(total_pages)
                pdfcanvas.Canvas.showPage(self)
            pdfcanvas.Canvas.save(self)

        def _draw_footer(self, total_pages):
            self.saveState()
            self.setStrokeColor(colors.HexColor("#" + NAVY))
            self.setLineWidth(0.6)
            self.line(MARGIN, MARGIN - 2, PAGE_W - MARGIN, MARGIN - 2)
            self.setFont("Helvetica", 8)
            self.setFillColor(colors.grey)
            self.drawString(MARGIN, MARGIN - 12, "Social Solidarity Fund Management System")
            self.drawRightString(PAGE_W - MARGIN, MARGIN - 12, f"Page {self._pageNumber} of {total_pages}")
            self.restoreState()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4),
                             leftMargin=MARGIN, rightMargin=MARGIN,
                             topMargin=MARGIN, bottomMargin=MARGIN + FOOTER_RESERVE)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("t", parent=styles["Title"], fontSize=20, textColor=colors.HexColor("#" + NAVY), spaceAfter=2)
    meta_style = ParagraphStyle("m", parent=styles["Normal"], fontSize=10, textColor=colors.grey)

    elements = [
        Paragraph(title, title_style),
        Paragraph(f"Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · {len(rows)} record(s)", meta_style),
        Spacer(1, 6),
        HRFlowable(width="100%", thickness=1.2, color=colors.HexColor("#" + NAVY)),
        Spacer(1, 14),
    ]

    data = [headers] + [[str(c) for c in row] for row in rows] if rows else [headers, ["No records match the selected filters"] + [""] * (len(headers) - 1)]
    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#" + NAVY)),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 12),
        ("FONTSIZE", (0, 1), (-1, -1), 11),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#" + LIGHT_GREY)]),
        ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#999999")),
        ("BOX", (0, 0), (-1, -1), 1, colors.HexColor("#" + NAVY)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(table)
    doc.build(elements, canvasmaker=NumberedCanvas)
    return buf.getvalue()


def render_excel(title: str, headers: list, rows: list) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.worksheet.page import PageMargins
    from openpyxl.worksheet.properties import PageSetupProperties

    wb = Workbook()
    ws = wb.active
    ws.title = title[:31]

    # Explicit, equal print margins on every side, plus a landscape, centered print layout
    # and a page-numbered footer — so a printed copy looks as intentional as the on-screen one.
    ws.page_margins = PageMargins(left=0.6, right=0.6, top=0.75, bottom=0.75, header=0.3, footer=0.3)
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.print_options.horizontalCentered = True
    ws.oddFooter.center.text = "Page &P of &N"
    ws.oddFooter.right.text = "Social Solidarity Fund Management System"

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max(len(headers), 1))
    ws.cell(1, 1, title).font = Font(size=16, bold=True, color=NAVY)
    ws.cell(2, 1, f"Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · {len(rows)} record(s)").font = Font(size=10, italic=True, color="666666")

    header_row = 4
    thin = Side(style="thin", color="BFBFBF")
    for col, h in enumerate(headers, start=1):
        cell = ws.cell(header_row, col, h)
        cell.font = Font(bold=True, color="FFFFFF", size=12)
        cell.fill = PatternFill("solid", fgColor=NAVY)
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = Border(thin, thin, thin, thin)
        ws.column_dimensions[cell.column_letter].width = max(16, len(h) + 4)

    for r_idx, row in enumerate(rows, start=header_row + 1):
        for c_idx, value in enumerate(row, start=1):
            cell = ws.cell(r_idx, c_idx, value)
            cell.font = Font(bold=True, size=11)
            cell.border = Border(thin, thin, thin, thin)
            if r_idx % 2 == 0:
                cell.fill = PatternFill("solid", fgColor=LIGHT_GREY)
    ws.freeze_panes = ws.cell(header_row + 1, 1)
    ws.print_title_rows = f"{header_row}:{header_row}"  # repeat the header row on every printed page

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def render_word(title: str, headers: list, rows: list) -> bytes:
    from docx import Document
    from docx.shared import Pt, RGBColor, Cm
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.section import WD_ORIENT

    doc = Document()
    for section in doc.sections:
        section.orientation = WD_ORIENT.LANDSCAPE
        section.page_width, section.page_height = section.page_height, section.page_width
        # Explicit, equal margins on every side — a printed/PDF-exported copy shouldn't
        # rely on Word's default 2.5cm-on-two-sides-only layout.
        section.left_margin = Cm(1.8)
        section.right_margin = Cm(1.8)
        section.top_margin = Cm(1.8)
        section.bottom_margin = Cm(1.8)

        footer = section.footer
        footer_para = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
        footer_para.text = "Social Solidarity Fund Management System"
        footer_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        footer_para.runs[0].font.size = Pt(8)
        footer_para.runs[0].font.color.rgb = RGBColor(0x66, 0x66, 0x66)

    h = doc.add_heading(title, level=1)
    h.runs[0].font.color.rgb = RGBColor(0x1F, 0x38, 0x64)
    meta = doc.add_paragraph(f"Generated {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · {len(rows)} record(s)")
    meta.runs[0].font.size = Pt(10)
    meta.runs[0].font.italic = True

    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    for i, htext in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = htext
        run = cell.paragraphs[0].runs[0]
        run.font.bold = True
        run.font.size = Pt(12)
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        shading = cell._tc.get_or_add_tcPr()
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement
        shd = OxmlElement("w:shd")
        shd.set(qn("w:fill"), "1F3864")
        shading.append(shd)

    for row in (rows or [["No records match the selected filters"] + [""] * (len(headers) - 1)]):
        cells = table.add_row().cells
        for i, value in enumerate(row):
            cells[i].text = str(value)
            cells[i].paragraphs[0].runs[0].font.bold = True
            cells[i].paragraphs[0].runs[0].font.size = Pt(11)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()

"""Unified inbox — merges consultations, tickets and contact requests."""

import csv
import io
import uuid
from datetime import UTC, datetime

from sqlalchemy import Select, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.consultation import ConsultationRequest
from ..models.request_ops import ContactRequest, Label, RequestLabel
from ..models.ticket import Ticket
from ..models.user import User
from ..db.base import aware

_TYPE_MODELS = {
    "consultation": ConsultationRequest,
    "ticket": Ticket,
    "contact": ContactRequest,
}

TABS = ("all", "new", "mine", "overdue", "unanswered")


def _code_col(model):
    return model.tracking_code if model is not Ticket else model.ticket_number


def _name_col(model):
    return model.requester_name if model is Ticket else model.full_name


def _phone_col(model):
    return model.requester_phone if model is Ticket else model.phone


def _subject_expr(model):
    if model is Ticket:
        return model.subject
    if model is ContactRequest:
        return model.subject
    return model.topic


async def _assignee_names(db: AsyncSession) -> dict[uuid.UUID, str]:
    rows = (await db.execute(select(User.id, User.full_name))).all()
    return {r.id: r.full_name for r in rows}


async def _labels_for(
    db: AsyncSession, request_type: str, request_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[dict]]:
    if not request_ids:
        return {}
    rows = (
        await db.execute(
            select(RequestLabel.request_id, Label.id, Label.name, Label.color)
            .join(Label, Label.id == RequestLabel.label_id)
            .where(
                RequestLabel.request_type == request_type,
                RequestLabel.request_id.in_(request_ids),
            )
        )
    ).all()
    out: dict[uuid.UUID, list[dict]] = {}
    for rid, lid, name, color in rows:
        out.setdefault(rid, []).append({"id": str(lid), "name": name, "color": color})
    return out


def _apply_filters(
    stmt: Select,
    model,
    *,
    status: str | None,
    priority: str | None,
    assignee: uuid.UUID | None,
    mine: uuid.UUID | None,
    overdue: bool,
    unanswered: bool,
    q: str | None,
    now: datetime,
):
    if status:
        stmt = stmt.where(model.status == status)
    if priority:
        stmt = stmt.where(model.priority == priority)
    if assignee:
        stmt = stmt.where(model.assigned_to == assignee)
    if mine:
        stmt = stmt.where(model.assigned_to == mine)
    if overdue:
        stmt = stmt.where(
            model.sla_due_at.is_not(None),
            model.sla_due_at < now,
            model.status.not_in(_CLOSED),
        )
    if unanswered:
        stmt = stmt.where(
            model.first_response_at.is_(None),
            model.status.not_in(_CLOSED),
        )
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                _code_col(model).ilike(like),
                _name_col(model).ilike(like),
                _phone_col(model).ilike(like),
                _subject_expr(model).ilike(like),
            )
        )
    return stmt


_CLOSED = ("completed", "resolved", "closed", "cancelled")


def _to_row(model, row, names, labels, now: datetime) -> dict:
    code = row.ticket_number if model is Ticket else row.tracking_code
    name = row.requester_name if model is Ticket else row.full_name
    phone = row.requester_phone if model is Ticket else row.phone
    subject = (
        row.subject
        if model is Ticket
        else (row.subject or "درخواست تماس")
        if model is ContactRequest
        else (row.topic or row.service_slug or "درخواست مشاوره")
    )
    overdue = bool(
        row.sla_due_at
        and aware(row.sla_due_at) < now
        and row.status not in _CLOSED
    )
    return {
        "type": {
            ConsultationRequest: "consultation",
            Ticket: "ticket",
            ContactRequest: "contact",
        }[model],
        "id": str(row.id),
        "tracking_code": code or "",
        "name": name,
        "phone": phone,
        "subject": subject,
        "status": row.status,
        "priority": row.priority,
        "assigned_to": str(row.assigned_to) if row.assigned_to else None,
        "assignee_name": names.get(row.assigned_to, "") if row.assigned_to else "",
        "labels": labels.get(row.id, []),
        "unanswered": row.first_response_at is None,
        "overdue": overdue,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "sla_due_at": row.sla_due_at,
    }


async def inbox(
    db: AsyncSession,
    *,
    types: list[str] | None = None,
    tab: str = "all",
    status: str | None = None,
    priority: str | None = None,
    assignee: uuid.UUID | None = None,
    q: str | None = None,
    user: User | None = None,
    offset: int = 0,
    limit: int = 20,
    sort: str = "updated_desc",
) -> tuple[list[dict], int]:
    """Union-style inbox. Per-type tables are queried and merged in Python —
    volumes at a law firm don't justify a materialized union view."""
    now = datetime.now(UTC)
    names = await _assignee_names(db)
    kinds = types or list(_TYPE_MODELS)
    rows: list[dict] = []
    total = 0
    for kind in kinds:
        model = _TYPE_MODELS[kind]
        stmt = select(model).order_by(model.updated_at.desc()).limit(500)
        stmt = _apply_filters(
            stmt,
            model,
            status=status,
            priority=priority,
            assignee=assignee,
            mine=user.id if tab == "mine" and user else None,
            overdue=tab == "overdue",
            unanswered=tab == "unanswered",
            q=q,
            now=now,
        )
        found = (await db.execute(stmt)).scalars().all()
        labels = await _labels_for(db, kind, [r.id for r in found])
        rows += [_to_row(model, r, names, labels, now) for r in found]
        total += len(found)
    if tab == "new":
        rows = [r for r in rows if r["status"] == "new"]
        total = len(rows)
    reverse = sort != "updated_asc"
    rows.sort(key=lambda r: r["updated_at"] or r["created_at"], reverse=reverse)
    return rows[offset : offset + limit], total


def inbox_csv(rows: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["type", "tracking_code", "name", "phone", "subject", "status",
                "priority", "assignee", "created_at"])
    for r in rows:
        w.writerow([
            r["type"], r["tracking_code"], r["name"], r["phone"], r["subject"],
            r["status"], r["priority"], r["assignee_name"],
            r["created_at"].isoformat() if r["created_at"] else "",
        ])
    return buf.getvalue()

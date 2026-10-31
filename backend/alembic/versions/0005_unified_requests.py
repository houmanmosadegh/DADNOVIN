"""Unified request operations.

- contact_requests table (public callback requests)
- shared request_messages / request_events / labels / request_labels /
  outbound_deliveries / tracking_counters / articles
- consultation_requests: +tracking_code +access_code_hash +priority
  +cancel_reason +first/last_response_at +sla_due_at
- tickets: +cancel_reason +first/last_response_at +sla_due_at
- audit_logs: +before_json +after_json
- data: normalize statuses, backfill tracking codes, copy legacy threads

Revision ID: 0005_unified_requests
Revises: 0004_audit_actor_username
Create Date: 2026-10-28
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0005_unified_requests"
down_revision = "0004_audit_actor_username"
branch_labels = None
depends_on = None

_JSON = sa.JSON().with_variant(JSONB(), "postgresql")


def _has_table(insp, name: str) -> bool:
    return name in insp.get_table_names()


def _has_col(insp, table: str, col: str) -> bool:
    return col in {c["name"] for c in insp.get_columns(table)}


def _create(insp, name: str, *cols) -> None:
    if not _has_table(insp, name):
        op.create_table(name, *cols)


def _add_col(insp, table: str, col: sa.Column) -> None:
    if not _has_col(insp, table, col.name):
        op.add_column(table, col)


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    uuid_t = sa.Uuid()

    # ---- new tables -------------------------------------------------------
    _create(
        insp,
        "contact_requests",
        sa.Column("id", uuid_t, primary_key=True),
        sa.Column(
            "tracking_code",
            sa.String(32),
            unique=True,
            index=True,
            nullable=False,
            server_default="",
        ),
        sa.Column(
            "access_code_hash", sa.String(128), nullable=False, server_default=""
        ),
        sa.Column("full_name", sa.String(120), nullable=False),
        sa.Column("phone", sa.String(40), index=True, nullable=False),
        sa.Column("email", sa.String(255), nullable=False, server_default=""),
        sa.Column("subject", sa.String(200), nullable=False, server_default=""),
        sa.Column("message", sa.Text, nullable=False, server_default=""),
        sa.Column("preferred_time", sa.String(80), nullable=False, server_default=""),
        sa.Column(
            "status", sa.String(30), index=True, nullable=False, server_default="new"
        ),
        sa.Column("priority", sa.String(20), nullable=False, server_default="normal"),
        sa.Column("source_page", sa.String(120), nullable=False, server_default=""),
        sa.Column(
            "assigned_to",
            uuid_t,
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("cancel_reason", sa.String(300), nullable=False, server_default=""),
        sa.Column("first_response_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_response_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sla_due_at", sa.DateTime(timezone=True), index=True, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    _create(
        insp,
        "request_messages",
        sa.Column("id", uuid_t, primary_key=True),
        sa.Column("request_type", sa.String(20), index=True, nullable=False),
        sa.Column("request_id", uuid_t, index=True, nullable=False),
        sa.Column("sender_type", sa.String(20), nullable=False),
        sa.Column("sender_id", uuid_t, nullable=True),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("is_note", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("attachments", _JSON, nullable=False, server_default="[]"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    _create(
        insp,
        "request_events",
        sa.Column("id", uuid_t, primary_key=True),
        sa.Column("request_type", sa.String(20), index=True, nullable=False),
        sa.Column("request_id", uuid_t, index=True, nullable=False),
        sa.Column("event_type", sa.String(40), index=True, nullable=False),
        sa.Column("actor_id", uuid_t, nullable=True),
        sa.Column("actor_username", sa.String(255), nullable=False, server_default=""),
        sa.Column("payload", _JSON, nullable=False, server_default="{}"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    _create(
        insp,
        "labels",
        sa.Column("id", uuid_t, primary_key=True),
        sa.Column("name", sa.String(60), unique=True, index=True, nullable=False),
        sa.Column("color", sa.String(16), nullable=False, server_default="gold"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    _create(
        insp,
        "request_labels",
        sa.Column("id", uuid_t, primary_key=True),
        sa.Column("request_type", sa.String(20), index=True, nullable=False),
        sa.Column("request_id", uuid_t, index=True, nullable=False),
        sa.Column(
            "label_id",
            uuid_t,
            sa.ForeignKey("labels.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "request_type", "request_id", "label_id", name="uq_request_label"
        ),
    )
    _create(
        insp,
        "outbound_deliveries",
        sa.Column("id", uuid_t, primary_key=True),
        sa.Column(
            "message_id",
            uuid_t,
            sa.ForeignKey("request_messages.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
        sa.Column("channel", sa.String(16), index=True, nullable=False),
        sa.Column("provider", sa.String(40), nullable=False, server_default="mock"),
        sa.Column("recipient", sa.String(255), nullable=False, server_default=""),
        sa.Column(
            "status", sa.String(16), index=True, nullable=False, server_default="queued"
        ),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(500), nullable=False, server_default=""),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    _create(
        insp,
        "articles",
        sa.Column("id", uuid_t, primary_key=True),
        sa.Column("slug", sa.String(120), unique=True, index=True, nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("excerpt", sa.String(500), nullable=False, server_default=""),
        sa.Column("body", sa.Text, nullable=False, server_default=""),
        sa.Column("seo_title", sa.String(200), nullable=False, server_default=""),
        sa.Column("seo_description", sa.String(300), nullable=False, server_default=""),
        sa.Column(
            "status", sa.String(20), index=True, nullable=False, server_default="draft"
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    _create(
        insp,
        "tracking_counters",
        sa.Column("id", uuid_t, primary_key=True),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("request_type", sa.String(20), nullable=False),
        sa.Column("seq", sa.Integer, nullable=False, server_default="0"),
        sa.UniqueConstraint("year", "request_type", name="uq_tracking_counter"),
    )

    # ---- alter existing tables --------------------------------------------
    insp = sa.inspect(bind)  # refresh
    for col in (
        sa.Column("tracking_code", sa.String(32), nullable=False, server_default=""),
        sa.Column(
            "access_code_hash", sa.String(128), nullable=False, server_default=""
        ),
        sa.Column("priority", sa.String(20), nullable=False, server_default="normal"),
        sa.Column("cancel_reason", sa.String(300), nullable=False, server_default=""),
        sa.Column("first_response_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_response_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sla_due_at", sa.DateTime(timezone=True), nullable=True),
    ):
        _add_col(insp, "consultation_requests", col)
    insp = sa.inspect(bind)
    idx = {i["name"] for i in insp.get_indexes("consultation_requests")}
    if "ix_consultation_requests_tracking_code" not in idx:
        op.create_index(
            "ix_consultation_requests_tracking_code",
            "consultation_requests",
            ["tracking_code"],
            unique=True,
        )
    if "ix_consultation_requests_sla_due_at" not in idx:
        op.create_index(
            "ix_consultation_requests_sla_due_at",
            "consultation_requests",
            ["sla_due_at"],
        )

    for col in (
        sa.Column("cancel_reason", sa.String(300), nullable=False, server_default=""),
        sa.Column("first_response_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_response_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sla_due_at", sa.DateTime(timezone=True), nullable=True),
    ):
        _add_col(insp, "tickets", col)
    insp = sa.inspect(bind)
    idx = {i["name"] for i in insp.get_indexes("tickets")}
    if "ix_tickets_sla_due_at" not in idx:
        op.create_index("ix_tickets_sla_due_at", "tickets", ["sla_due_at"])

    for col in (
        sa.Column("before_json", _JSON, nullable=False, server_default="{}"),
        sa.Column("after_json", _JSON, nullable=False, server_default="{}"),
    ):
        _add_col(insp, "audit_logs", col)

    # ---- data: normalize statuses ------------------------------------------
    op.execute("UPDATE tickets SET status='new' WHERE status='open'")
    op.execute("UPDATE tickets SET status='reviewing' WHERE status='in_progress'")
    op.execute(
        "UPDATE tickets SET status='waiting_reply' WHERE status='waiting_customer'"
    )
    op.execute(
        "UPDATE consultation_requests SET status='awaiting_call' "
        "WHERE status='awaiting_reply'"
    )
    op.execute(
        "UPDATE consultation_requests SET status='completed' WHERE status='done'"
    )

    # ---- data: backfill consultation tracking codes -------------------------
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, created_at FROM consultation_requests "
            "WHERE tracking_code = '' ORDER BY created_at"
        )
    ).fetchall()
    if rows:
        seq = 0
        for rid, created_at in rows:
            seq += 1
            year = _jalali_year_of(created_at)
            code = f"DN-{year}-{seq:04d}"
            conn.execute(
                sa.text(
                    "UPDATE consultation_requests SET tracking_code=:c WHERE id=:i"
                ),
                {"c": code, "i": rid},
            )
        conn.execute(
            sa.text(
                "INSERT INTO tracking_counters (id, year, request_type, seq) "
                "SELECT gen_random_uuid(), :y, 'consultation', :s "
                "WHERE NOT EXISTS (SELECT 1 FROM tracking_counters "
                "  WHERE year=:y AND request_type='consultation')"
            ),
            {"y": _jalali_year_of_now(), "s": seq},
        )

    # ---- data: copy legacy threads into request_messages --------------------
    tmsgs = conn.execute(
        sa.text(
            "SELECT id, ticket_id, sender_type, sender_id, body, created_at "
            "FROM ticket_messages"
        )
    ).fetchall()
    for mid, tid, sender, sid, body, created in tmsgs:
        exists = conn.execute(
            sa.text(
                "SELECT 1 FROM request_messages WHERE request_type='ticket' "
                "AND request_id=:r AND body=:b AND created_at=:c LIMIT 1"
            ),
            {"r": tid, "b": body, "c": created},
        ).fetchone()
        if exists:
            continue
        conn.execute(
            sa.text(
                "INSERT INTO request_messages "
                "(id, request_type, request_id, sender_type, sender_id, body, "
                " is_note, attachments, created_at) "
                "VALUES (gen_random_uuid(), 'ticket', :r, :st, :sid, :b, "
                ":note, '[]', :c)"
            ),
            {
                "r": tid,
                "st": "staff" if sender in ("staff", "note") else "customer",
                "sid": sid,
                "b": body,
                "note": sender == "note",
                "c": created,
            },
        )
    cnotes = conn.execute(
        sa.text(
            "SELECT id, request_id, author_id, body, created_at FROM consultation_notes"
        )
    ).fetchall()
    for nid, rid, aid, body, created in cnotes:
        exists = conn.execute(
            sa.text(
                "SELECT 1 FROM request_messages WHERE request_type='consultation' "
                "AND request_id=:r AND body=:b AND created_at=:c LIMIT 1"
            ),
            {"r": rid, "b": body, "c": created},
        ).fetchone()
        if exists:
            continue
        conn.execute(
            sa.text(
                "INSERT INTO request_messages "
                "(id, request_type, request_id, sender_type, sender_id, body, "
                " is_note, attachments, created_at) "
                "VALUES (gen_random_uuid(), 'consultation', :r, 'staff', :sid, "
                ":b, true, '[]', :c)"
            ),
            {"r": rid, "sid": aid, "b": body, "c": created},
        )


def _jalali_year_of(dt) -> int:
    gy = dt.year
    gm = dt.month
    gd = dt.day
    g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = (
        355666
        + (365 * gy)
        + ((gy2 + 3) // 4)
        - ((gy2 + 99) // 100)
        + ((gy2 + 399) // 400)
        + gd
        + g_d_m[gm - 1]
    )
    jy = -1595 + (33 * (days // 12053))
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
    return jy


def _jalali_year_of_now() -> int:
    from datetime import datetime

    return _jalali_year_of(datetime.now())


def downgrade() -> None:
    for t in (
        "tracking_counters",
        "articles",
        "outbound_deliveries",
        "request_labels",
        "labels",
        "request_events",
        "request_messages",
        "contact_requests",
    ):
        op.drop_table(t, if_exists=True)

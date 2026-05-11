"""
DocFlow — Recipient Reminder Service (Phase 81.24)

Schedules and sends "pending signature" reminder emails for package recipients
who have not yet completed their action. Designed as a lightweight, in-process
async loop (mirrors the existing notification + audit schedulers in this app)
so we don't introduce Celery/Redis just for this feature.

Design summary
--------------
- Each package recipient stores a `reminder_config` block (shape below) plus a
  `reminder_state` block tracking next_run_at / last_sent_at / sent_count /
  status.
- A single async background task wakes up every CHECK_INTERVAL_SECONDS, scans
  packages whose run.recipients contain at least one recipient whose
  `reminder_state.next_run_at <= now` AND whose status is still "pending"
  AND whose `reminder_state.status` is "active".
- For each due recipient it sends an email, increments sent_count, computes
  the next_run_at, and writes back to MongoDB in a single update.
- When the routing engine marks a recipient completed/declined, it also
  cancels their reminder via `cancel_recipient_reminders`.

reminder_config (per-recipient, set at send time):
  {
    "enabled": bool,
    "interval_value": int,         # numeric portion of the interval
    "interval_unit": str,          # "minutes" | "hours" | "days" | "weeks"
    "max_count": int | None,       # optional cap on total reminders sent
    "start_delay_minutes": int,    # delay before FIRST reminder (0 = immediate after send)
    "end_at": str | None,          # optional ISO8601 cutoff
  }

reminder_state (managed by this service):
  {
    "status": "active" | "completed" | "stopped" | "exhausted" | "expired",
    "next_run_at": str (ISO8601),
    "last_sent_at": str (ISO8601) | None,
    "sent_count": int,
  }
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS = int(os.environ.get("DOCFLOW_REMINDER_CHECK_INTERVAL_SECONDS", "60"))
MAX_BATCH_PER_TICK = int(os.environ.get("DOCFLOW_REMINDER_BATCH_PER_TICK", "100"))

VALID_UNITS = {"seconds", "minutes", "hours", "days", "weeks", "months", "years"}
TERMINAL_RECIPIENT_STATUSES = {"completed", "declined", "rejected", "expired"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _add_interval(base: datetime, value: int, unit: str) -> datetime:
    """Phase 81.25 — extended unit support: seconds | minutes | hours | days |
    weeks | months | years.  `months` ≈ 30 days, `years` ≈ 365 days for
    scheduler purposes (calendar-precise math isn't required here — this is a
    polling cadence, not invoice/anniversary logic)."""
    unit = (unit or "days").lower()
    value = max(1, int(value or 1))
    if unit == "seconds":
        return base + timedelta(seconds=value)
    if unit == "minutes":
        return base + timedelta(minutes=value)
    if unit == "hours":
        return base + timedelta(hours=value)
    if unit == "weeks":
        return base + timedelta(weeks=value)
    if unit == "months":
        return base + timedelta(days=value * 30)
    if unit == "years":
        return base + timedelta(days=value * 365)
    return base + timedelta(days=value)


# Phase 81.25 — Public-API frequency presets to internal (value, unit) pairs.
# Used by the public send + generate-links endpoints which expose
# `reminder_frequency` (`daily | weekly | monthly | custom`) instead of the
# raw value/unit pair the UI uses.
PUBLIC_FREQUENCY_MAP = {
    "daily":   (1, "days"),
    "weekly":  (1, "weeks"),
    "monthly": (1, "months"),
}


def normalize_reminder_config(cfg: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Validate + normalize an inbound reminder config from the API. Returns
    `None` when reminders are disabled or the config is invalid.  Accepts both
    UI-style (`enabled / interval_value / interval_unit / max_count`) and
    public-API style (`reminder_enabled / reminder_frequency /
    reminder_custom_value / reminder_custom_unit / max_reminders`)."""
    if not cfg or not isinstance(cfg, dict):
        return None

    # Public-API style → translate first.
    if "reminder_enabled" in cfg or "reminder_frequency" in cfg:
        if not cfg.get("reminder_enabled"):
            return None
        freq = (cfg.get("reminder_frequency") or "").lower().strip()
        if freq == "custom":
            value = cfg.get("reminder_custom_value")
            unit = (cfg.get("reminder_custom_unit") or "").lower().strip()
            if not value or int(value) < 1:
                raise ValueError("reminder_custom_value must be greater than 0")
            if unit not in VALID_UNITS:
                raise ValueError("reminder_custom_unit required when frequency is custom")
            value = int(value)
        elif freq in PUBLIC_FREQUENCY_MAP:
            value, unit = PUBLIC_FREQUENCY_MAP[freq]
        else:
            raise ValueError("reminder_frequency must be one of: daily, weekly, monthly, custom")
        max_count = cfg.get("max_reminders")
    else:
        if not cfg.get("enabled"):
            return None
        unit = (cfg.get("interval_unit") or "days").lower()
        if unit not in VALID_UNITS:
            unit = "days"
        try:
            value = int(cfg.get("interval_value") or 1)
        except Exception:
            value = 1
        if value < 1:
            raise ValueError("reminder interval_value must be greater than 0")
        max_count = cfg.get("max_count")

    try:
        max_count = int(max_count) if max_count not in (None, "") else None
    except Exception:
        max_count = None
    end_at = cfg.get("end_at")
    return {
        "enabled": True,
        "interval_value": value,
        "interval_unit": unit,
        "max_count": max_count,
        "end_at": end_at if isinstance(end_at, str) else None,
    }


def initial_reminder_state(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Compute the initial reminder_state at send-time. First reminder fires
    one full interval after send."""
    now = _utcnow()
    first_at = _add_interval(now, cfg["interval_value"], cfg["interval_unit"])
    return {
        "status": "active",
        "next_run_at": _iso(first_at),
        "last_sent_at": None,
        "sent_count": 0,
    }


class ReminderScheduler:
    """Background loop that processes due reminders.  One global instance per
    backend process."""

    _instance: Optional["ReminderScheduler"] = None

    def __init__(self, db):
        self.db = db
        self._task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()

    @classmethod
    def get_instance(cls, db) -> "ReminderScheduler":
        if cls._instance is None:
            cls._instance = ReminderScheduler(db)
        return cls._instance

    async def start(self):
        if self._task and not self._task.done():
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run_loop(), name="docflow-reminder-scheduler")
        logger.info(f"[ReminderScheduler] started; tick={CHECK_INTERVAL_SECONDS}s")

    async def stop(self):
        self._stop_event.set()
        if self._task:
            try:
                await asyncio.wait_for(self._task, timeout=5)
            except asyncio.TimeoutError:
                self._task.cancel()
        logger.info("[ReminderScheduler] stopped")

    async def _run_loop(self):
        # Stagger initial run by a few seconds so all schedulers don't fire at
        # boot.
        await asyncio.sleep(15)
        while not self._stop_event.is_set():
            try:
                processed = await self.tick()
                if processed:
                    logger.info(f"[ReminderScheduler] processed {processed} due reminder(s)")
            except Exception as e:
                logger.exception(f"[ReminderScheduler] tick failed: {e}")
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=CHECK_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                pass

    async def tick(self) -> int:
        """Find due recipients across all active package runs AND template
        documents and process them. Returns the number of reminders sent (or
        attempted)."""
        now_iso = _iso(_utcnow())
        sent = 0

        # ── Package runs (Send Package flow) ──
        cursor = self.db.docflow_package_runs.find({
            "status": {"$nin": ["completed", "voided", "expired", "declined", "cancelled"]},
            "recipients.reminder_state.status": "active",
            "recipients.reminder_state.next_run_at": {"$lte": now_iso},
        }).limit(MAX_BATCH_PER_TICK)
        async for run in cursor:
            try:
                sent += await self._process_run(run, source="package_run")
            except Exception as e:
                logger.exception(f"[ReminderScheduler] failed run {run.get('id')}: {e}")

        # ── Template-flow documents (Generate Document → /api/v1/documents/generate-links) ──
        # Phase 81.29 — same reminder schema lives on `docflow_documents.recipients`,
        # so we scan that collection with the same shape.
        cursor2 = self.db.docflow_documents.find({
            "status": {"$nin": ["completed", "voided", "expired", "declined", "cancelled"]},
            "recipients.reminder_state.status": "active",
            "recipients.reminder_state.next_run_at": {"$lte": now_iso},
        }).limit(MAX_BATCH_PER_TICK)
        async for doc in cursor2:
            try:
                sent += await self._process_run(doc, source="document")
            except Exception as e:
                logger.exception(f"[ReminderScheduler] failed doc {doc.get('id')}: {e}")
        return sent

    # ------- Per-run processing -------
    async def _process_run(self, run: Dict[str, Any], source: str = "package_run") -> int:
        # Phase 81.29 — `source` controls which collection we persist updates back
        # to.  "package_run" → docflow_package_runs ; "document" → docflow_documents.
        package_name = (
            run.get("package_name")
            or run.get("name")
            or run.get("document_name")
            or run.get("template_name")
            or "Document"
        )
        recipients = run.get("recipients") or []
        now = _utcnow()
        now_iso = _iso(now)

        # Identify the active recipient(s) we need to nudge:
        # - sequential: only the recipient whose status == "pending" / "in_progress"
        # - parallel: every recipient that is still pending
        # The routing engine already maintains per-recipient status, so we
        # rely on that here.
        sent = 0
        any_changed = False
        for idx, r in enumerate(recipients):
            state = (r.get("reminder_state") or {})
            cfg = (r.get("reminder_config") or {})
            if state.get("status") != "active":
                continue
            r_status = (r.get("status") or "pending").lower()
            if r_status in TERMINAL_RECIPIENT_STATUSES:
                # Soft-cancel — happens when the routing engine forgot to
                # call cancel_recipient_reminders for some reason.
                recipients[idx]["reminder_state"]["status"] = "completed"
                any_changed = True
                continue
            next_run_at = state.get("next_run_at") or now_iso
            if next_run_at > now_iso:
                continue
            # Optional end_at cutoff
            end_at = cfg.get("end_at")
            if end_at and end_at <= now_iso:
                recipients[idx]["reminder_state"]["status"] = "expired"
                any_changed = True
                continue

            ok = await self._send_reminder(run, r, package_name)
            sent_count = int(state.get("sent_count", 0)) + (1 if ok else 0)
            max_count = cfg.get("max_count")
            new_state = {
                "status": "active",
                "last_sent_at": now_iso if ok else state.get("last_sent_at"),
                "sent_count": sent_count,
                "next_run_at": _iso(_add_interval(now, cfg.get("interval_value", 1), cfg.get("interval_unit", "days"))),
            }
            # If we hit the cap, mark exhausted so we never look at this
            # recipient again until the user re-arms them.
            if max_count is not None and sent_count >= max_count:
                new_state["status"] = "exhausted"
            recipients[idx]["reminder_state"] = new_state
            any_changed = True
            if ok:
                sent += 1

        if any_changed:
            collection = (
                self.db.docflow_documents if source == "document"
                else self.db.docflow_package_runs
            )
            await collection.update_one(
                {"id": run.get("id")},
                {"$set": {"recipients": recipients}},
            )
        return sent

    # ------- Email send -------
    async def _send_reminder(self, run: Dict[str, Any], recipient: Dict[str, Any], package_name: str) -> bool:
        to_email = (recipient.get("email") or "").strip()
        if not to_email:
            return False
        try:
            from .system_email_service import SystemEmailService
            email_svc = SystemEmailService()
            frontend_url = os.environ.get("FRONTEND_URL", "")
            if not frontend_url:
                try:
                    from services.email_service import FRONTEND_URL  # type: ignore
                    frontend_url = FRONTEND_URL or ""
                except Exception:
                    pass
            # Phase 81.29 — both package recipients (`/docflow/package/{run_id}/view/{token}`)
            # and template-flow recipients (`/docflow/view/{token}`) use a public token.
            # We pick the route based on whether the parent run looks like a
            # package-run or a document.
            token = recipient.get("public_token") or ""
            view_url = ""
            if token:
                if run.get("package_id") or run.get("package_name"):
                    view_url = f"{frontend_url}/docflow/package/{run.get('id', '')}/view/{token}"
                else:
                    view_url = f"{frontend_url}/docflow/view/{token}"
            sender = run.get("sender") or {}
            sender_name = sender.get("name") or sender.get("email") or "DocFlow"
            extra = {
                "view_url": view_url,
                "sender_name": sender_name,
            }
            await email_svc.send_workflow_notification_email(
                to_email=to_email,
                to_name=recipient.get("name", ""),
                document_name=package_name,
                notification_type="reminder",
                extra=extra,
            )
            # Append an audit log row.
            await self.db.docflow_reminder_logs.insert_one({
                "id": f"rem_{run.get('id', '')}_{recipient.get('id', '')}_{int(_utcnow().timestamp())}",
                "package_id": run.get("package_id") or run.get("id"),
                "run_id": run.get("id"),
                "tenant_id": run.get("tenant_id"),
                "recipient_id": recipient.get("id"),
                "recipient_email": to_email,
                "recipient_name": recipient.get("name", ""),
                "package_name": package_name,
                "sent_at": _iso(_utcnow()),
                "status": "sent",
            })
            return True
        except Exception as e:
            logger.warning(f"[ReminderScheduler] send failed to={to_email} pkg={package_name}: {e}")
            try:
                await self.db.docflow_reminder_logs.insert_one({
                    "id": f"rem_{run.get('id', '')}_{recipient.get('id', '')}_{int(_utcnow().timestamp())}",
                    "package_id": run.get("package_id") or run.get("id"),
                    "run_id": run.get("id"),
                    "tenant_id": run.get("tenant_id"),
                    "recipient_id": recipient.get("id"),
                    "recipient_email": to_email,
                    "recipient_name": recipient.get("name", ""),
                    "package_name": package_name,
                    "sent_at": _iso(_utcnow()),
                    "status": "failed",
                    "error": str(e)[:500],
                })
            except Exception:
                pass
            return False


# ----------------- module-level helpers -----------------

async def cancel_recipient_reminders(db, run_id: str, recipient_id: str, reason: str = "completed") -> None:
    """Stop reminders for one recipient inside a run.  Called by the routing
    engine the moment a recipient signs / declines / is removed.  Phase 81.27 —
    filters on `reminder_state: {$type: 'object'}` so recipients with
    reminder_state=null (no reminder configured) don't blow up the write.
    Phase 81.29 — also looks in docflow_documents (template flow) since reminder
    state now lives there too."""
    new_status = reason if reason in {"completed", "stopped", "expired"} else "stopped"
    for collection in (db.docflow_package_runs, db.docflow_documents):
        await collection.update_one(
            {
                "id": run_id,
                "recipients": {"$elemMatch": {"id": recipient_id, "reminder_state": {"$type": "object"}}},
            },
            {"$set": {"recipients.$.reminder_state.status": new_status}},
        )


async def cancel_run_reminders(db, run_id: str, reason: str = "stopped") -> None:
    """Stop ALL reminders inside a run (used for void / expire). Uses an array
    filter so we only touch elements where reminder_state is an object.
    Phase 81.29 — also clears template-flow document reminders."""
    for collection in (db.docflow_package_runs, db.docflow_documents):
        await collection.update_one(
            {"id": run_id},
            {"$set": {"recipients.$[r].reminder_state.status": reason}},
            array_filters=[{"r.reminder_state": {"$type": "object"}}],
        )


def get_scheduler(db) -> ReminderScheduler:
    return ReminderScheduler.get_instance(db)

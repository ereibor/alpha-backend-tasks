"""
Briefing service layer.

Responsible for:
- persisting briefings and their child records
- building a report view model from stored ORM objects
- rendering the HTML report via Jinja2
- orchestrating the generate flow
"""
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.briefing import Briefing, BriefingKeyPoint, BriefingRisk, BriefingMetric
from app.schemas.briefing import BriefingCreate, BriefingRead, PointRead, BriefingMetricRead
from app.services.report_formatter import ReportFormatter

_formatter = ReportFormatter()

class BriefingNotFoundError(Exception):
    """Raised when a requested briefing does not exist."""
    pass


# --------------------------------------------------------------------------- #
# Persistence                                                                  #
# --------------------------------------------------------------------------- #

def create_briefing(db: Session, payload: BriefingCreate) -> Briefing:
    briefing = Briefing(
        company_name=payload.companyName,
        ticker=payload.ticker,       
        sector=payload.sector,
        analyst_name=payload.analystName,
        summary=payload.summary,
        recommendation=payload.recommendation,
    )
    db.add(briefing)
    db.flush()   # get the id before committing so we can attach children

    for order, text in enumerate(payload.keyPoints):
        db.add(BriefingKeyPoint(
            briefing_id=briefing.id,
            text=text,
            display_order=order,
        ))

    for order, text in enumerate(payload.risks):
        db.add(BriefingRisk(
            briefing_id=briefing.id,
            text=text,
            display_order=order,
        ))

    if payload.metrics:
        for order, metric in enumerate(payload.metrics):
            db.add(BriefingMetric(
                briefing_id=briefing.id,
                name=metric.name.strip(),
                value=metric.value.strip(),
                display_order=order,
            ))

    db.commit()
    db.refresh(briefing)
    return briefing


def get_briefing(db: Session, briefing_id: int) -> Optional[Briefing]:
    query = select(Briefing).where(Briefing.id == briefing_id)
    return db.scalars(query).first()


# --------------------------------------------------------------------------- #
# View model construction                                                      #
# --------------------------------------------------------------------------- #

def _build_view_model(briefing: Briefing) -> dict:
    """
    Transform ORM records into a display-ready dict for the Jinja2 template.
    This is the formatting/transformation layer — raw DB data is NOT passed
    directly to the template.
    """
    key_points = sorted(briefing.key_points, key=lambda p: p.display_order)
    risks = sorted(briefing.risks, key=lambda r: r.display_order)
    metrics = sorted(briefing.metrics, key=lambda m: m.display_order)

    report_title = f"{briefing.company_name} ({briefing.ticker}) — Analyst Briefing"

    return {
        "report_title": report_title,
        "company_name": briefing.company_name,
        "ticker": briefing.ticker,
        "sector": briefing.sector,
        "analyst_name": briefing.analyst_name,
        "summary": briefing.summary,
        "recommendation": briefing.recommendation,
        "key_points": [p.text for p in key_points],
        "risks": [r.text for r in risks],
        "metrics": [{"name": _normalize_label(m.name), "value": m.value} for m in metrics],
        "has_metrics": len(metrics) > 0,
        "generated_at": _formatter.generated_timestamp(),
    }


def _normalize_label(label: str) -> str:
    """Title-case a metric label and strip extra whitespace."""
    return " ".join(word.capitalize() for word in label.strip().split())


# --------------------------------------------------------------------------- #
# Report generation                                                            #
# --------------------------------------------------------------------------- #

def generate_report(db: Session, briefing: Briefing) -> Briefing:
    """Render the HTML report and persist it, marking the briefing as generated."""
    view_model = _build_view_model(briefing)
    html = _formatter.render_briefing(view_model)

    briefing.generated_html = html
    briefing.is_generated = True

    db.commit()
    db.refresh(briefing)
    return briefing


# --------------------------------------------------------------------------- #
# Schema projection helpers                                                    #
# --------------------------------------------------------------------------- #

def briefing_to_schema(briefing: Briefing) -> BriefingRead:
    key_points = [
        PointRead(id=p.id, text=p.text, display_order=p.display_order)
        for p in sorted(briefing.key_points, key=lambda p: p.display_order)
    ]
    risks = [
        PointRead(id=r.id, text=r.text, display_order=r.display_order)
        for r in sorted(briefing.risks, key=lambda r: r.display_order)
    ]
    metrics = [
        BriefingMetricRead(id=m.id, name=m.name, value=m.value, display_order=m.display_order)
        for m in sorted(briefing.metrics, key=lambda m: m.display_order)
    ]
    return BriefingRead(
        id=briefing.id,
        company_name=briefing.company_name,
        ticker=briefing.ticker,
        sector=briefing.sector,
        analyst_name=briefing.analyst_name,
        summary=briefing.summary,
        recommendation=briefing.recommendation,
        is_generated=briefing.is_generated,
        key_points=key_points,
        risks=risks,
        metrics=metrics,
        created_at=briefing.created_at,
        updated_at=briefing.updated_at,
    )
# --------------------------------------------------------------------------- #
# HTML retrieval
# --------------------------------------------------------------------------- #


def get_briefing_html(db: Session, briefing_id: int) -> str:
    briefing = get_briefing(db, briefing_id)

    if not briefing:
        raise BriefingNotFoundError("Briefing not found")

    if not briefing.generated_html:
        raise ValueError("Briefing has not been generated yet")

    return briefing.generated_html
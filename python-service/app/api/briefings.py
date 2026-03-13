from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.briefing import BriefingCreate, BriefingHtmlRead, BriefingRead
from app.services.briefing_service import (
    BriefingNotFoundError,
    create_briefing,
    generate_report,
    get_briefing,
    get_briefing_html,
)
from app.services.report_formatter import ReportFormatter

router = APIRouter(prefix="/briefings", tags=["briefings"])


@router.post("", response_model=BriefingRead, status_code=status.HTTP_201_CREATED)
def create_briefing_endpoint(
    payload: BriefingCreate, db: Annotated[Session, Depends(get_db)]
) -> BriefingRead:
    try:
        briefing = create_briefing(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return _to_briefing_read(briefing)


@router.get("/{briefing_id}", response_model=BriefingRead)
def get_briefing_endpoint(briefing_id: int, db: Annotated[Session, Depends(get_db)]) -> BriefingRead:
    try:
        briefing = get_briefing(db, briefing_id)
    except BriefingNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _to_briefing_read(briefing)


@router.post("/{briefing_id}/generate", response_model=BriefingRead)
def generate_briefing_endpoint(
    briefing_id: int, db: Annotated[Session, Depends(get_db)]
) -> BriefingRead:

    briefing = get_briefing(db, briefing_id)

    if not briefing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Briefing not found",
        )

    briefing = generate_report(db, briefing)

    return _to_briefing_read(briefing)


@router.get("/{briefing_id}/html", response_class=HTMLResponse, responses={200: {"content": {"text/html": {}}}})
def get_briefing_html_endpoint(briefing_id: int, db: Annotated[Session, Depends(get_db)]) -> HTMLResponse:
    try:
        html = get_briefing_html(db, briefing_id)
    except BriefingNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    return HTMLResponse(content=html)


def _to_briefing_read(briefing) -> BriefingRead:
    return BriefingRead.model_validate(
        {
            "id": briefing.id,
            "company_name": briefing.company_name,
            "ticker": briefing.ticker,
            "sector": briefing.sector,
            "analyst_name": briefing.analyst_name,
            "summary": briefing.summary,
            "recommendation": briefing.recommendation,
            "key_points": [
                {"id": p.id, "text": p.text, "display_order": p.display_order}
                for p in sorted(briefing.key_points, key=lambda p: (p.display_order, p.id))
            ],
            "risks": [
                {"id": r.id, "text": r.text, "display_order": r.display_order}
                for r in sorted(briefing.risks, key=lambda r: (r.display_order, r.id))
            ],
            "metrics": [
                {
                    "id": m.id,
                    "name": m.name,
                    "value": m.value,
                    "display_order": m.display_order,
                }
                for m in sorted(briefing.metrics, key=lambda m: (m.display_order, m.id))
            ],
            "is_generated": briefing.is_generated,
            "created_at": briefing.created_at,
            "updated_at": briefing.updated_at,
        }
    )


from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import Briefing 


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    Base.metadata.create_all(bind=engine)

    def override_get_db() -> Generator[Session, None, None]:
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _valid_payload() -> dict:
    return {
        "companyName": "Acme Holdings",
        "ticker": "acme",
        "sector": "Industrial Technology",
        "analystName": "Jane Doe",
        "summary": "Acme is benefiting from strong enterprise demand.",
        "recommendation": "Monitor for margin expansion.",
        "keyPoints": [
            "Revenue grew 18% year-over-year in the latest quarter.",
            "Management raised full-year guidance.",
        ],
        "risks": [
            "Top two customers account for 41% of total revenue.",
        ],
        "metrics": [
            {"name": "Revenue Growth", "value": "18%"},
            {"name": "Operating Margin", "value": "22.4%"},
        ],
    }


def test_create_and_get_briefing(client: TestClient) -> None:
    create_response = client.post("/briefings", json=_valid_payload())
    assert create_response.status_code == 201, create_response.text

    created = create_response.json()
    assert created["companyName"] == "Acme Holdings"
    assert created["ticker"] == "ACME"  
    assert created["isGenerated"] is False
    assert len(created["keyPoints"]) == 2
    assert len(created["risks"]) == 1
    assert len(created["metrics"]) == 2

    briefing_id = created["id"]

    get_response = client.get(f"/briefings/{briefing_id}")
    assert get_response.status_code == 200
    fetched = get_response.json()
    assert fetched["id"] == briefing_id


def test_create_briefing_requires_minimum_points_and_risks(client: TestClient) -> None:
    payload = _valid_payload()
    payload["keyPoints"] = ["Only one point"]

    response = client.post("/briefings", json=payload)
    assert response.status_code == 422

    payload = _valid_payload()
    payload["risks"] = []

    response = client.post("/briefings", json=payload)
    assert response.status_code == 422


def test_create_briefing_rejects_duplicate_metric_names(client: TestClient) -> None:
    payload = _valid_payload()
    payload["metrics"] = [
        {"name": "Revenue Growth", "value": "18%"},
        {"name": "revenue growth", "value": "20%"},
    ]

    response = client.post("/briefings", json=payload)
    assert response.status_code == 422


def test_generate_and_fetch_html(client: TestClient) -> None:
    create_response = client.post("/briefings", json=_valid_payload())
    assert create_response.status_code == 201
    briefing_id = create_response.json()["id"]

    generate_response = client.post(f"/briefings/{briefing_id}/generate")
    assert generate_response.status_code == 200
    generated = generate_response.json()
    assert generated["isGenerated"] is True

    html_response = client.get(f"/briefings/{briefing_id}/html")
    assert html_response.status_code == 200
    assert html_response.headers["content-type"].startswith("text/html")
    html_body = html_response.text
    assert "Acme Holdings" in html_body
    assert "Company Briefing" in html_body


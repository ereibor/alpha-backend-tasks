from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


# --------------------------------------------------------------------------- #
# Sub-schemas                                                                  #
# --------------------------------------------------------------------------- #

class BriefingMetricInput(BaseModel):
    """Input shape for a single metric when creating a briefing."""
    name: str = Field(..., min_length=1)
    value: str = Field(..., min_length=1)


class BriefingMetricRead(BaseModel):
    """Serialised metric returned in API responses."""
    id: int
    name: str
    value: str
    display_order: int

    model_config = {"from_attributes": True}


class PointRead(BaseModel):
    id: int
    text: str
    display_order: int

    model_config = {"from_attributes": True}


# --------------------------------------------------------------------------- #
# Request schema                                                               #
# --------------------------------------------------------------------------- #

class BriefingCreate(BaseModel):
    companyName: str = Field(..., min_length=1)
    ticker: str = Field(..., min_length=1, max_length=20)
    sector: str = Field(..., min_length=1)
    analystName: str = Field(..., min_length=1)
    summary: str = Field(..., min_length=1)
    recommendation: str = Field(..., min_length=1)
    keyPoints: List[str] = Field(..., min_length=2)
    risks: List[str] = Field(..., min_length=1)
    metrics: Optional[List[BriefingMetricInput]] = Field(default=None)

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("keyPoints")
    @classmethod
    def validate_key_points(cls, v: List[str]) -> List[str]:
        if len(v) < 2:
            raise ValueError("At least 2 key points are required.")
        stripped = [p.strip() for p in v]
        if any(p == "" for p in stripped):
            raise ValueError("Key points must not be blank.")
        return stripped

    @field_validator("risks")
    @classmethod
    def validate_risks(cls, v: List[str]) -> List[str]:
        if len(v) < 1:
            raise ValueError("At least 1 risk is required.")
        stripped = [r.strip() for r in v]
        if any(r == "" for r in stripped):
            raise ValueError("Risks must not be blank.")
        return stripped

    @model_validator(mode="after")
    def validate_unique_metric_names(self) -> "BriefingCreate":
        if self.metrics:
            names = [m.name.strip().lower() for m in self.metrics]
            if len(names) != len(set(names)):
                raise ValueError("Metric names must be unique within the same briefing.")
        return self


# --------------------------------------------------------------------------- #
# Response schemas                                                             #
# --------------------------------------------------------------------------- #

class BriefingRead(BaseModel):
    """Full briefing record returned by GET /briefings/{id} and POST /briefings."""
    id: int
    company_name: str
    ticker: str
    sector: Optional[str]
    analyst_name: Optional[str]
    summary: str
    recommendation: str
    is_generated: bool
    key_points: List[PointRead]
    risks: List[PointRead]
    metrics: List[BriefingMetricRead]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BriefingGenerateRead(BaseModel):
    """Response returned by POST /briefings/{id}/generate."""
    id: int
    is_generated: bool
    message: str


class BriefingHtmlRead(BaseModel):
    """
    Not used directly as a response_model (the HTML endpoint returns
    a raw Response), but exported so the __init__.py import resolves
    and it can be reused in tests or docs.
    """
    id: int
    html_content: str
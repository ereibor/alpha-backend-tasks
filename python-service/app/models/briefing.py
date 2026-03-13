from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.db.base import Base


class Briefing(Base):
    __tablename__ = "briefings"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, nullable=False)
    ticker = Column(String, nullable=False)
    sector = Column(String)
    analyst_name = Column(String)
    summary = Column(String, nullable=False)
    recommendation = Column(String, nullable=False)

    is_generated = Column(Boolean, default=False)
    generated_html = Column(String)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    key_points = relationship("BriefingKeyPoint", back_populates="briefing")
    risks = relationship("BriefingRisk", back_populates="briefing")
    metrics = relationship("BriefingMetric", back_populates="briefing")


class BriefingKeyPoint(Base):
    __tablename__ = "briefing_key_points"

    id = Column(Integer, primary_key=True)
    briefing_id = Column(Integer, ForeignKey("briefings.id"))
    text = Column(String)
    display_order = Column(Integer)

    briefing = relationship("Briefing", back_populates="key_points")


class BriefingRisk(Base):
    __tablename__ = "briefing_risks"

    id = Column(Integer, primary_key=True)
    briefing_id = Column(Integer, ForeignKey("briefings.id"))
    text = Column(String)
    display_order = Column(Integer)

    briefing = relationship("Briefing", back_populates="risks")


class BriefingMetric(Base):
    __tablename__ = "briefing_metrics"

    id = Column(Integer, primary_key=True)
    briefing_id = Column(Integer, ForeignKey("briefings.id"))
    name = Column(String)
    value = Column(String)
    display_order = Column(Integer)

    briefing = relationship("Briefing", back_populates="metrics")
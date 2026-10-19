"""SQLAlchemy models for SkillPulse Intelligence.

Defines the relational schema across regions, occupations, canonical skills,
skill mappings, empirical employment time series (PLFS), job posting skill signals,
model forecasts, evidence grades, and evaluation run provenance.
"""

from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class Region(Base):
    """Standardized geographic region (Indian States / UTs)."""

    __tablename__ = "regions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    state_code = Column(String(10), unique=True, nullable=False, index=True)
    state_name = Column(String(100), nullable=False)
    zone = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())

    # Relationships
    employment_series = relationship("EmploymentSeries", back_populates="region", cascade="all, delete-orphan")
    forecasts = relationship("Forecast", back_populates="region", cascade="all, delete-orphan")
    evidence_grades = relationship("EvidenceGrade", back_populates="region", cascade="all, delete-orphan")


class Occupation(Base):
    """Standardized occupational profile mapped to NCO-2015 trade subset."""

    __tablename__ = "occupations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    nco_code = Column(Float, nullable=False, index=True)
    nco_code_str = Column(String(20), nullable=False, index=True)
    title = Column(String(255), nullable=False, index=True)
    trade_category = Column(String(100), nullable=False, index=True)
    division = Column(Integer, nullable=True)
    sub_division = Column(Integer, nullable=True)
    group_code = Column(Integer, nullable=True)
    family = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("nco_code", "title", name="uq_occupation_code_title"),
    )

    # Relationships
    skills = relationship("OccupationSkillMap", back_populates="occupation", cascade="all, delete-orphan")
    employment_series = relationship("EmploymentSeries", back_populates="occupation", cascade="all, delete-orphan")
    forecasts = relationship("Forecast", back_populates="occupation", cascade="all, delete-orphan")
    evidence_grades = relationship("EvidenceGrade", back_populates="occupation", cascade="all, delete-orphan")
    postings_signals = relationship("PostingsSkillSignal", back_populates="occupation", cascade="all, delete-orphan")


class Skill(Base):
    """Canonical skill taxonomy entry from O*NET / ESCO."""

    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    skill_id = Column(String(100), unique=True, nullable=False, index=True)
    skill_name = Column(String(255), nullable=False, index=True)
    category = Column(String(100), nullable=False)  # essential_skill, software_tool, knowledge_domain
    source = Column(String(50), default="ONET_31_0")
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())

    # Relationships
    occupations = relationship("OccupationSkillMap", back_populates="skill", cascade="all, delete-orphan")
    postings_signals = relationship("PostingsSkillSignal", back_populates="skill", cascade="all, delete-orphan")


class OccupationSkillMap(Base):
    """Crosswalk mapping between occupations and requisite skills."""

    __tablename__ = "occupation_skill_map"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    occupation_id = Column(Integer, ForeignKey("occupations.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_id = Column(Integer, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True)
    importance_score = Column(Float, default=1.0, nullable=False)
    source = Column(String(50), default="ONET_CROSSWALK")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("occupation_id", "skill_id", name="uq_occ_skill"),
    )

    # Relationships
    occupation = relationship("Occupation", back_populates="skills")
    skill = relationship("Skill", back_populates="occupations")


class EmploymentSeries(Base):
    """Empirical historical monthly employment time series (PLFS supply & job vacancy demand)."""

    __tablename__ = "employment_series"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    region_id = Column(Integer, ForeignKey("regions.id"), nullable=False, index=True)
    occupation_id = Column(Integer, ForeignKey("occupations.id"), nullable=False, index=True)
    year_month = Column(String(7), nullable=False, index=True)  # YYYY-MM
    date = Column(DateTime, nullable=False, index=True)
    supply_index = Column(Float, nullable=False)  # PLFS supply proxy base rate
    demand_index = Column(Float, nullable=False)  # Job vacancies demand signal
    net_gap = Column(Float, nullable=False)  # demand_index - supply_index
    data_vintage = Column(String(20), nullable=False)  # Historical observation vintage date
    supply_data_source = Column(String(30), nullable=False, default="unavailable")  # 'verified_real' | 'unavailable'
    supply_source_citation = Column(Text, nullable=True)  # full citation for supply_index, when verified_real
    demand_data_source = Column(String(30), nullable=False, default="synthetic_demo")  # 'verified_real' | 'synthetic_demo'
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("region_id", "occupation_id", "year_month", name="uq_emp_series_region_occ_month"),
        Index("ix_emp_series_lookup", "region_id", "occupation_id", "date"),
    )

    # Relationships
    region = relationship("Region", back_populates="employment_series")
    occupation = relationship("Occupation", back_populates="employment_series")


class PostingsSkillSignal(Base):
    """Aggregated skill frequency signal extracted from postings."""

    __tablename__ = "postings_skill_signal"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    occupation_id = Column(Integer, ForeignKey("occupations.id"), nullable=False, index=True)
    region_id = Column(Integer, ForeignKey("regions.id"), nullable=True, index=True)
    skill_id = Column(Integer, ForeignKey("skills.id"), nullable=False, index=True)
    year_month = Column(String(7), nullable=False, index=True)
    mention_count = Column(Integer, default=1, nullable=False)
    frequency_pct = Column(Float, default=0.0, nullable=False)
    data_vintage = Column(String(20), default="2023-12-31")
    data_source = Column(String(30), nullable=False, default="unavailable")  # 'verified_real' | 'unavailable'
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("occupation_id", "region_id", "skill_id", "year_month", name="uq_postings_signal"),
    )

    # Relationships
    occupation = relationship("Occupation", back_populates="postings_signals")
    region = relationship("Region")
    skill = relationship("Skill", back_populates="postings_signals")


class Forecast(Base):
    """Monthly forecasted demand and statistical confidence bounds."""

    __tablename__ = "forecasts"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    region_id = Column(Integer, ForeignKey("regions.id"), nullable=False, index=True)
    occupation_id = Column(Integer, ForeignKey("occupations.id"), nullable=False, index=True)
    model_name = Column(String(100), nullable=False)  # e.g. 'Holt-Winters Exponential Smoothing'
    forecast_year_month = Column(String(7), nullable=False, index=True)  # YYYY-MM
    forecast_date = Column(DateTime, nullable=False, index=True)
    predicted_demand = Column(Float, nullable=True)
    lower_bound = Column(Float, nullable=True)
    upper_bound = Column(Float, nullable=True)
    is_sufficient = Column(Boolean, default=True, nullable=False)
    gating_reason = Column(String(255), nullable=True)
    data_vintage = Column(String(20), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("region_id", "occupation_id", "model_name", "forecast_year_month", name="uq_forecast_reg_occ_model_month"),
    )

    # Relationships
    region = relationship("Region", back_populates="forecasts")
    occupation = relationship("Occupation", back_populates="forecasts")


class EvidenceGrade(Base):
    """Deterministic evidence grade assessing data sufficiency and cross-source concordance."""

    __tablename__ = "evidence_grades"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    region_id = Column(Integer, ForeignKey("regions.id"), nullable=False, index=True)
    occupation_id = Column(Integer, ForeignKey("occupations.id"), nullable=False, index=True)
    grade = Column(String(20), nullable=False)  # 'A', 'B', 'C', 'Insufficient'
    score = Column(Float, nullable=False)  # 0 to 100
    volume_score = Column(Float, nullable=False)  # max 40
    agreement_score = Column(Float, nullable=False)  # max 35
    recency_score = Column(Float, nullable=False)  # max 25
    observations_count = Column(Integer, nullable=False)
    agreement_drift_pct = Column(Float, default=0.0)
    is_sufficient = Column(Boolean, default=True, nullable=False)
    gating_reason = Column(String(255), nullable=True)
    data_vintage = Column(String(20), default="2023-12-31")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("region_id", "occupation_id", name="uq_evidence_reg_occ"),
    )

    # Relationships
    region = relationship("Region", back_populates="evidence_grades")
    occupation = relationship("Occupation", back_populates="evidence_grades")


class ModelRun(Base):
    """Provenance and walk-forward validation metrics record for pipeline evaluation."""

    __tablename__ = "model_runs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    run_id = Column(String(100), unique=True, nullable=False, index=True)
    pipeline_version = Column(String(50), nullable=False)
    data_version = Column(String(50), nullable=False)
    training_start = Column(String(10), nullable=False)
    training_end = Column(String(10), nullable=False)
    baseline_model = Column(String(100), nullable=False)
    candidate_model = Column(String(100), nullable=False)
    overall_mae = Column(Float, nullable=False)
    overall_rmse = Column(Float, nullable=False)
    overall_mape = Column(Float, nullable=False)
    baseline_mae = Column(Float, nullable=False)
    baseline_rmse = Column(Float, nullable=False)
    baseline_mape = Column(Float, nullable=False)
    total_evaluated_segments = Column(Integer, nullable=False)
    candidate_losses_to_baseline_count = Column(Integer, nullable=False)
    excluded_segments_count = Column(Integer, nullable=False)
    grade_distribution = Column(Text, nullable=False)  # JSON-serialized dict
    category_metrics = Column(Text, nullable=False)  # JSON-serialized dict
    artifact_path = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now())

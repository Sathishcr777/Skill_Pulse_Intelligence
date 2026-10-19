"""Validates that PostingsSkillSignal rows are computed from real postings,
never randomly generated. Regression guard for the fix documented in
docs/data_integrity_audit.md (random np.random signal replaced with a real
keyword-presence computation over the actual 10-record Naukri sample)."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from backend.app.models.entities import PostingsSkillSignal

TEST_DB_PATH = os.path.abspath("data/test_api_skillpulse.db")
TEST_DB_URL = f"sqlite:///{TEST_DB_PATH}"


def test_all_postings_signals_are_verified_real():
    """Every row in postings_skill_signal must be tagged verified_real -
    there is no synthetic fallback path for this table; absence of a row
    IS the 'unavailable' signal for untested occupation/skill combinations."""
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        rows = db.scalars(select(PostingsSkillSignal)).all()
        assert len(rows) > 0, "Expected at least one real signal from the matched sample postings"
        for row in rows:
            assert row.data_source == "verified_real"
            assert row.mention_count >= 1
            assert 0 < row.frequency_pct <= 100
    finally:
        db.close()


def test_postings_signal_coverage_is_sparse_and_honestly_small():
    """With only 10 real sample postings (2 crosswalk-matched), the real
    signal table must stay small - a large count here would indicate a
    regression back toward fabricated/bulk-generated rows."""
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        rows = db.scalars(select(PostingsSkillSignal)).all()
        assert len(rows) <= 20, (
            f"Found {len(rows)} postings-signal rows from only 10 real sample postings - "
            "this looks like fabricated/bulk data, not a real per-posting keyword match."
        )
    finally:
        db.close()

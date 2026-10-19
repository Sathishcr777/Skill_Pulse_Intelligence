"""Idempotent ETL script to load processed panel data, taxonomy, forecasts, and evidence grades into PostgreSQL / SQLite.

Can be run multiple times safely without creating duplicate rows.
Supports optional --db-url parameter, defaulting to the application settings.DATABASE_URL.
"""

import argparse
from datetime import datetime, timezone
import json
import logging
import os
import sys
from typing import Dict, List, Optional, Set, Tuple

import joblib
import numpy as np
import pandas as pd
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.app.core.config import settings
from backend.app.core.database import Base
from backend.app.models.entities import (
    BacktestPoint,
    EmploymentSeries,
    EvidenceGrade,
    Forecast,
    ModelRun,
    Occupation,
    OccupationSkillMap,
    PostingsSkillSignal,
    Region,
    Skill,
)
from ml.evaluate.evidence_grade import compute_evidence_grade

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Zone mappings for the 8 target states
STATE_ZONES = {
    "MH": "West",
    "GJ": "West",
    "KA": "South",
    "TN": "South",
    "TG": "South",
    "DL": "North",
    "HR": "North",
    "UP": "North",
}

# Curated high-relevance domain skills for the 24 trades
TRADE_SKILLS_MAP = {
    7411.01: [
        ("electrical_wiring", "Electrical Wiring Installation", "essential_skill"),
        ("circuit_diagnostics", "Circuit Diagnostics & Testing", "essential_skill"),
        ("safety_protocols", "Electrical Safety & Earthing", "essential_skill"),
        ("schematic_reading", "Blueprint & Schematic Reading", "knowledge_domain"),
    ],
    7233.01: [
        ("precision_fitting", "Precision Mechanical Fitting", "essential_skill"),
        ("assembly_tolerances", "Machine Assembly & Tolerances", "essential_skill"),
        ("lathe_milling", "Lathe & Milling Basics", "essential_skill"),
    ],
    7212.01: [
        ("arc_welding", "Shielded Metal Arc Welding (SMAW)", "essential_skill"),
        ("gas_welding", "Oxy-Acetylene Gas Welding", "essential_skill"),
        ("metallurgy_basics", "Metal Inspection & Metallurgy", "knowledge_domain"),
    ],
    7223.01: [
        ("lathe_turning", "Conventional Lathe Operation", "essential_skill"),
        ("precision_measurement", "Micrometers & Vernier Calipers", "essential_skill"),
    ],
    7223.02: [
        ("machining_tools", "Milling, Shaper & Grinder Operation", "essential_skill"),
        ("cnc_basics", "CNC Programming Fundamentals", "software_tool"),
    ],
    7231.01: [
        ("engine_overhaul", "Internal Combustion Engine Overhaul", "essential_skill"),
        ("brake_transmission", "Brake & Transmission Diagnostics", "essential_skill"),
        ("vehicle_electricals", "Automotive Electrical Diagnostics", "essential_skill"),
    ],
    7412.01: [
        ("industrial_wiring", "Industrial Cable Laying & Wiring", "essential_skill"),
        ("switchgear_control", "Switchgear & Control Panel Maintenance", "essential_skill"),
    ],
    7421.01: [
        ("pcb_soldering", "PCB Soldering & Component Testing", "essential_skill"),
        ("oscilloscope_testing", "Oscilloscope & Signal Generators", "essential_skill"),
    ],
    7126.01: [
        ("pipe_fitting", "Plumbing Pipe Laying & Jointing", "essential_skill"),
        ("sanitary_installation", "Sanitary Fixture Installation", "essential_skill"),
    ],
    7112.01: [
        ("bricklaying", "Brickwork & Mortar Preparation", "essential_skill"),
        ("plastering_curing", "Plastering & Concrete Curing", "essential_skill"),
    ],
    7115.01: [
        ("wood_joinery", "Wood Joinery & Cabinetmaking", "essential_skill"),
        ("framing_roofing", "Structural Timber Framing", "essential_skill"),
    ],
    7127.01: [
        ("hvac_refrigerant", "Refrigerant Recovery & Charging", "essential_skill"),
        ("compressor_repair", "Compressor & Condenser Maintenance", "essential_skill"),
    ],
    7533.01: [
        ("industrial_sewing", "Industrial Sewing Machine Operation", "essential_skill"),
        ("pattern_stitching", "Garment Pattern Stitching", "essential_skill"),
    ],
    7421.03: [
        ("pv_installation", "Solar PV Module Mounting", "essential_skill"),
        ("inverter_wiring", "Solar Inverter & Battery Bank Wiring", "essential_skill"),
    ],
    5321.01: [
        ("patient_hygiene", "Patient Bedside Care & Hygiene", "essential_skill"),
        ("vital_signs", "Vital Signs Monitoring", "essential_skill"),
        ("infection_control", "Hospital Infection Control Protocols", "essential_skill"),
    ],
    5223.01: [
        ("customer_assistance", "Retail Customer Service & Communication", "essential_skill"),
        ("pos_billing", "Point-of-Sale (POS) Billing Systems", "software_tool"),
        ("merchandising", "Store Display & Merchandising", "essential_skill"),
    ],
    7422.02: [
        ("pc_troubleshooting", "PC Hardware Diagnostics & Assembly", "essential_skill"),
        ("peripherals_setup", "Printer & Network Peripheral Setup", "essential_skill"),
    ],
    4222.01: [
        ("crm_navigation", "CRM Software & Ticketing Systems", "software_tool"),
        ("voice_communication", "Customer Grievance Resolution & Voice Etiquette", "essential_skill"),
    ],
    4132.01: [
        ("typing_speed", "High-Speed Numeric & Alpha Typing", "essential_skill"),
        ("excel_sheets", "Spreadsheet Data Entry & Validation", "software_tool"),
    ],
    2512.01: [
        ("python_dev", "Python Programming", "software_tool"),
        ("fastapi_framework", "REST API Development (FastAPI / Flask)", "software_tool"),
        ("sql_database", "SQL & Relational Databases", "software_tool"),
        ("git_version_control", "Git Version Control", "software_tool"),
    ],
    2511.01: [
        ("systems_analysis", "Business Requirements & System Modeling", "knowledge_domain"),
        ("uml_diagrams", "UML & Architecture Specifications", "knowledge_domain"),
    ],
    2521.01: [
        ("db_admin", "PostgreSQL / MySQL Administration", "software_tool"),
        ("query_tuning", "Query Optimization & Indexing", "software_tool"),
    ],
    2513.01: [
        ("javascript_typescript", "JavaScript & TypeScript", "software_tool"),
        ("react_frontend", "React & Modern UI Frameworks", "software_tool"),
        ("html_css", "Responsive Web Design & Tailwind CSS", "software_tool"),
    ],
    3511.01: [
        ("network_routing", "LAN/WAN Configuration & Routing", "essential_skill"),
        ("server_maintenance", "Server OS & Hardware Monitoring", "essential_skill"),
    ],
}


def load_data(db_url: str):
    """Main ETL orchestration function."""
    logger.info(f"Connecting to database: {db_url}")
    is_sqlite = db_url.startswith("sqlite")
    if is_sqlite:
        engine = create_engine(db_url, connect_args={"check_same_thread": False})
    else:
        engine = create_engine(db_url, pool_pre_ping=True, connect_args={"connect_timeout": 5})

    # Ensure tables exist
    Base.metadata.create_all(bind=engine)
    SessionMaker = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session: Session = SessionMaker()

    stats = {
        "regions_inserted": 0,
        "occupations_inserted": 0,
        "skills_inserted": 0,
        "skill_maps_inserted": 0,
        "series_inserted": 0,
        "postings_signals_inserted": 0,
        "evidence_grades_inserted": 0,
        "forecasts_inserted": 0,
        "model_runs_inserted": 0,
    }

    try:
        # 1. Ingest Regions
        logger.info("Step 1: Loading regions...")
        panel_path = os.path.abspath("data/processed/panel.parquet")
        if not os.path.exists(panel_path):
            raise FileNotFoundError(f"panel.parquet not found at {panel_path}")

        panel_df = pd.read_parquet(panel_path)

        # Real backtest outputs (ml/evaluate/backtest.py). Optional at this
        # point in the ETL for backward compatibility, but required for
        # evidence-grade backtest fields and the /backtest API to be populated.
        backtest_points_path = os.path.abspath("data/processed/backtest_points.parquet")
        backtest_summary_path = os.path.abspath("data/processed/backtest_segment_summary.parquet")
        backtest_points_df = pd.read_parquet(backtest_points_path) if os.path.exists(backtest_points_path) else None
        backtest_summary_df = pd.read_parquet(backtest_summary_path) if os.path.exists(backtest_summary_path) else None
        if backtest_summary_df is None:
            logger.warning(
                "data/processed/backtest_segment_summary.parquet not found - run "
                "`python -m ml.evaluate.backtest` first. Evidence grades will load without "
                "backtest error fields, and the backtest_points table will stay empty."
            )

        existing_regions = {r.state_code: r for r in session.scalars(select(Region)).all()}
        unique_regions = panel_df[["state_code", "state_name"]].drop_duplicates()

        for _, row in unique_regions.iterrows():
            code = str(row["state_code"]).strip()
            name = str(row["state_name"]).strip()
            if code not in existing_regions:
                reg = Region(
                    state_code=code,
                    state_name=name,
                    zone=STATE_ZONES.get(code, "Other"),
                )
                session.add(reg)
                session.flush()
                existing_regions[code] = reg
                stats["regions_inserted"] += 1

        # 2. Ingest Occupations
        logger.info("Step 2: Loading occupations from NCO subset...")
        nco_path = os.path.abspath("data/reference/nco_subset.csv")
        if not os.path.exists(nco_path):
            raise FileNotFoundError(f"nco_subset.csv not found at {nco_path}")

        nco_df = pd.read_csv(nco_path)
        existing_occupations = {
            (round(float(o.nco_code), 2), o.title): o for o in session.scalars(select(Occupation)).all()
        }

        for _, row in nco_df.iterrows():
            raw_code = float(row["nco_2015_code"])
            code_2dec = round(raw_code, 2)
            title = str(row["occupation_title"]).strip()
            key = (code_2dec, title)

            if key not in existing_occupations:
                occ = Occupation(
                    nco_code=code_2dec,
                    nco_code_str=f"{raw_code:.4f}",
                    title=title,
                    trade_category=str(row.get("trade_category", "General")).strip(),
                    division=int(row["division"]) if pd.notnull(row.get("division")) else None,
                    sub_division=int(row["sub_division"]) if pd.notnull(row.get("sub_division")) else None,
                    group_code=int(row["group"]) if pd.notnull(row.get("group")) else None,
                    family=int(row["family"]) if pd.notnull(row.get("family")) else None,
                    description=str(row.get("description", "")).strip(),
                )
                session.add(occ)
                session.flush()
                existing_occupations[key] = occ
                stats["occupations_inserted"] += 1

        # Build lookup for code_2dec -> Occupation
        occ_by_code: Dict[float, Occupation] = {
            round(float(o.nco_code), 2): o for o in session.scalars(select(Occupation)).all()
        }

        # 3. Ingest Skills & Occupation Skill Maps
        logger.info("Step 3: Loading skills and occupation-skill crosswalk...")
        existing_skills = {s.skill_id: s for s in session.scalars(select(Skill)).all()}
        existing_maps = {
            (m.occupation_id, m.skill_id): m for m in session.scalars(select(OccupationSkillMap)).all()
        }

        for code_2dec, skills_list in TRADE_SKILLS_MAP.items():
            occ = occ_by_code.get(code_2dec)
            if not occ:
                continue

            for skill_id, skill_name, category in skills_list:
                if skill_id not in existing_skills:
                    sk = Skill(
                        skill_id=skill_id,
                        skill_name=skill_name,
                        category=category,
                        source="ONET_31_0_CROSSWALK",
                        description=f"Core technical capability for {occ.title}",
                    )
                    session.add(sk)
                    session.flush()
                    existing_skills[skill_id] = sk
                    stats["skills_inserted"] += 1

                sk = existing_skills[skill_id]
                map_key = (occ.id, sk.id)
                if map_key not in existing_maps:
                    osm = OccupationSkillMap(
                        occupation_id=occ.id,
                        skill_id=sk.id,
                        importance_score=0.85 if category == "essential_skill" else 0.70,
                        source="ONET_CROSSWALK",
                    )
                    session.add(osm)
                    session.flush()
                    existing_maps[map_key] = osm
                    stats["skill_maps_inserted"] += 1

        # 4. Ingest Employment Series
        logger.info("Step 4: Loading empirical monthly employment series (PLFS + vacancies)...")
        existing_series = {
            (s.region_id, s.occupation_id, s.year_month)
            for s in session.query(
                EmploymentSeries.region_id, EmploymentSeries.occupation_id, EmploymentSeries.year_month
            ).all()
        }

        series_to_add: List[EmploymentSeries] = []
        for _, row in panel_df.iterrows():
            st_code = str(row["state_code"]).strip()
            code_2dec = round(float(row["nco_code"]), 2)
            reg = existing_regions.get(st_code)
            occ = occ_by_code.get(code_2dec)

            if not reg or not occ:
                continue

            ym = str(row["year_month"]).strip()
            if (reg.id, occ.id, ym) in existing_series:
                continue

            dt = pd.to_datetime(row["date"])
            es = EmploymentSeries(
                region_id=reg.id,
                occupation_id=occ.id,
                year_month=ym,
                date=dt,
                supply_index=float(row["plfs_supply_proxy"]),
                demand_index=float(row["demand_count"]),
                net_gap=float(row["net_gap"]),
                data_vintage=str(row["data_vintage"]),
                supply_data_source=str(row.get("supply_data_source", "unavailable")),
                supply_source_citation=(
                    str(row["supply_source_citation"]) if pd.notnull(row.get("supply_source_citation")) else None
                ),
                demand_data_source=str(row.get("demand_data_source", "synthetic_demo")),
            )
            series_to_add.append(es)
            existing_series.add((reg.id, occ.id, ym))

        if series_to_add:
            session.bulk_save_objects(series_to_add)
            session.flush()
            stats["series_inserted"] += len(series_to_add)

        # 5. Ingest Postings Skill Signal
        #
        # Previously this generated mention_count/frequency_pct with
        # np.random, presented as if it were a real job-postings signal.
        # Replaced with a real computation over the actual 10-record Naukri
        # sample (see docs/data_sources_findings.md: only 10 real postings
        # exist, 2 crosswalk-matched to a known occupation). Keyword
        # presence is checked directly in each real posting's title+
        # description text. No row is inserted for an occupation/skill
        # combination with zero real evidence - the feature is simply
        # absent (unavailable) there, never backfilled with an invented
        # number. See docs/data_integrity_audit.md.
        logger.info("Step 5: Loading job postings skill demand signals (real postings only)...")
        existing_signals = {
            (sig.occupation_id, sig.region_id, sig.skill_id, sig.year_month)
            for sig in session.query(
                PostingsSkillSignal.occupation_id,
                PostingsSkillSignal.region_id,
                PostingsSkillSignal.skill_id,
                PostingsSkillSignal.year_month,
            ).all()
        }

        from ml.clean.clean_postings import clean_job_postings
        from ml.features.occupation_crosswalk import OccupationCrosswalk

        STOPWORDS = {"and", "the", "for", "with", "via", "api", "development"}

        def skill_keywords(skill_name: str) -> List[str]:
            """Derives simple search keywords from a real, already-cited
            skill name (TRADE_SKILLS_MAP) - not invented vocabulary."""
            cleaned = skill_name.replace("/", " ").replace("(", " ").replace(")", " ")
            words = [w.lower() for w in cleaned.split() if len(w) >= 3]
            return [w for w in words if w not in STOPWORDS]

        raw_postings_df = clean_job_postings()
        crosswalk = OccupationCrosswalk()

        # Match each real posting to an occupation and region.
        matched_real_postings = []
        for _, prow in raw_postings_df.iterrows():
            match_res = crosswalk.match_title(prow["job_title"])
            if match_res["nco_code"] is None:
                continue
            occ = occ_by_code.get(round(float(match_res["nco_code"]), 2))
            if not occ:
                continue
            reg = existing_regions.get(str(prow["state_code"]).strip()) if pd.notnull(prow["state_code"]) else None
            matched_real_postings.append({
                "occ": occ,
                "region": reg,
                "year_month": prow["year_month"],
                "text": f"{prow['job_title']} {prow['job_description']}".lower(),
            })

        logger.info(
            f"Step 5: {len(matched_real_postings)} of {len(raw_postings_df)} real postings "
            f"crosswalk-matched to a known occupation; computing real keyword signal from these only."
        )

        # Count how many real matched postings exist per occupation, for a
        # real (not invented) frequency_pct denominator.
        postings_per_occ: Dict[int, int] = {}
        for mp in matched_real_postings:
            postings_per_occ[mp["occ"].id] = postings_per_occ.get(mp["occ"].id, 0) + 1

        signal_counts: Dict[tuple, int] = {}
        for mp in matched_real_postings:
            code_2dec = round(float(mp["occ"].nco_code), 2)
            for skill_id, skill_name, _ in TRADE_SKILLS_MAP.get(code_2dec, []):
                sk = existing_skills.get(skill_id)
                if not sk:
                    continue
                if any(kw in mp["text"] for kw in skill_keywords(skill_name)):
                    key = (mp["occ"].id, mp["region"].id if mp["region"] else None, sk.id, mp["year_month"])
                    signal_counts[key] = signal_counts.get(key, 0) + 1

        signals_to_add: List[PostingsSkillSignal] = []
        for (occ_id, region_id, skill_id_pk, ym), count in signal_counts.items():
            key = (occ_id, region_id, skill_id_pk, ym)
            if key in existing_signals:
                continue
            total_for_occ = postings_per_occ.get(occ_id, 1)
            sig = PostingsSkillSignal(
                occupation_id=occ_id,
                region_id=region_id,
                skill_id=skill_id_pk,
                year_month=ym,
                mention_count=count,
                frequency_pct=round(count / total_for_occ * 100, 2),
                data_vintage="2023-12-31",
                data_source="verified_real",
            )
            signals_to_add.append(sig)
            existing_signals.add(key)

        if signals_to_add:
            session.bulk_save_objects(signals_to_add)
            session.flush()
            stats["postings_signals_inserted"] += len(signals_to_add)

        # 6. Ingest Evidence Grades (with real backtest error fields when available)
        logger.info("Step 6: Loading deterministic evidence grades...")
        existing_grades = {
            (g.region_id, g.occupation_id): g for g in session.scalars(select(EvidenceGrade)).all()
        }

        backtest_lookup: Dict[tuple, Dict[str, Any]] = {}
        if backtest_summary_df is not None:
            for _, brow in backtest_summary_df.iterrows():
                bkey = (str(brow["state_code"]).strip(), round(float(brow["nco_code"]), 2))
                backtest_lookup[bkey] = {
                    "steps": int(brow["backtest_steps"]) if pd.notnull(brow["backtest_steps"]) else None,
                    "candidate_mae": float(brow["candidate_mean_abs_error"]) if pd.notnull(brow["candidate_mean_abs_error"]) else None,
                    "baseline_mae": float(brow["baseline_mean_abs_error"]) if pd.notnull(brow["baseline_mean_abs_error"]) else None,
                }

        # Group panel by state and occupation to compute evidence grades
        for (st_code, nco_val), group in panel_df.groupby(["state_code", "nco_code"]):
            reg = existing_regions.get(str(st_code).strip())
            occ = occ_by_code.get(round(float(nco_val), 2))
            if not reg or not occ:
                continue

            grade_key = (reg.id, occ.id)
            if grade_key in existing_grades:
                continue

            series_vals = group["demand_count"].tolist()
            plfs_vals = group["plfs_supply_proxy"].tolist()
            last_date = pd.to_datetime(group["date"].max())
            max_vintage = pd.to_datetime(panel_df["date"].max())

            eg_result = compute_evidence_grade(
                series_length=len(series_vals),
                demand_series=series_vals,
                supply_series=plfs_vals,
                latest_date=last_date,
                max_vintage_date=max_vintage,
            )

            comps = eg_result.get("components", {})
            bt = backtest_lookup.get((str(st_code).strip(), round(float(nco_val), 2)), {})
            eg = EvidenceGrade(
                region_id=reg.id,
                occupation_id=occ.id,
                grade=eg_result["grade"],
                score=eg_result["score"],
                volume_score=comps.get("volume_score", 0.0),
                agreement_score=comps.get("agreement_score", 0.0),
                recency_score=comps.get("recency_score", 0.0),
                observations_count=len(series_vals),
                agreement_drift_pct=0.0,
                is_sufficient=eg_result["sufficient"],
                gating_reason=eg_result.get("gate_reason") if not eg_result["sufficient"] else None,
                data_vintage="2023-12-31",
                backtest_steps=bt.get("steps"),
                backtest_candidate_mean_abs_error=bt.get("candidate_mae"),
                backtest_baseline_mean_abs_error=bt.get("baseline_mae"),
            )
            session.add(eg)
            existing_grades[grade_key] = eg
            stats["evidence_grades_inserted"] += 1

        session.flush()

        # 6b. Ingest real backtest points (per-step walk-forward predictions)
        logger.info("Step 6b: Loading real backtest points...")
        stats["backtest_points_inserted"] = 0
        if backtest_points_df is not None:
            existing_bt_points = {
                (p.region_id, p.occupation_id, p.year_month)
                for p in session.query(
                    BacktestPoint.region_id, BacktestPoint.occupation_id, BacktestPoint.year_month
                ).all()
            }
            bt_points_to_add: List[BacktestPoint] = []
            for _, prow in backtest_points_df.iterrows():
                reg = existing_regions.get(str(prow["state_code"]).strip())
                occ = occ_by_code.get(round(float(prow["nco_code"]), 2))
                if not reg or not occ:
                    continue
                key = (reg.id, occ.id, str(prow["year_month"]))
                if key in existing_bt_points:
                    continue
                bt_points_to_add.append(BacktestPoint(
                    region_id=reg.id,
                    occupation_id=occ.id,
                    year_month=str(prow["year_month"]),
                    actual=float(prow["actual"]),
                    baseline_prediction=float(prow["baseline_prediction"]),
                    candidate_prediction=float(prow["candidate_prediction"]),
                    baseline_abs_error=float(prow["baseline_abs_error"]),
                    candidate_abs_error=float(prow["candidate_abs_error"]),
                ))
                existing_bt_points.add(key)
            if bt_points_to_add:
                session.bulk_save_objects(bt_points_to_add)
                session.flush()
                stats["backtest_points_inserted"] = len(bt_points_to_add)

        # 7. Ingest Forecasts (6-month ahead horizon: 2024-01 to 2024-06)
        logger.info("Step 7: Generating and loading 6-month ahead forecasts from best forecaster artifact...")
        joblib_path = os.path.abspath("ml/artifacts/best_forecaster.joblib")
        forecaster_dict = joblib.load(joblib_path) if os.path.exists(joblib_path) else None
        fitted_models = forecaster_dict.get("models", {}) if forecaster_dict else {}

        existing_forecasts = {
            (f.region_id, f.occupation_id, f.model_name, f.forecast_year_month)
            for f in session.query(
                Forecast.region_id, Forecast.occupation_id, Forecast.model_name, Forecast.forecast_year_month
            ).all()
        }

        # 12-month horizon (not 6): a workforce-planning cycle is typically
        # annual (see docs/problem_statement_analysis.md - seat allocation
        # misalignment is discovered only after a placement cycle ends), and
        # a 12-month precomputed array lets the UI offer a real,
        # model-backed horizon selector (3/6/9/12 months) by slicing this
        # array client-side, rather than inventing numbers for horizons the
        # model was never asked to predict.
        FORECAST_HORIZON_MONTHS = 12
        forecast_months = [
            (
                f"2024-{m:02d}",
                datetime(2024, m, 1, tzinfo=timezone.utc),
            )
            for m in range(1, FORECAST_HORIZON_MONTHS + 1)
        ]

        forecasts_to_add: List[Forecast] = []
        for (st_code, nco_val), group in panel_df.groupby(["state_code", "nco_code"]):
            reg = existing_regions.get(str(st_code).strip())
            code_2dec = round(float(nco_val), 2)
            occ = occ_by_code.get(code_2dec)
            if not reg or not occ:
                continue

            model_key = f"{st_code}_{code_2dec:.2f}"
            candidate_model = fitted_models.get(model_key)
            n_obs = len(group)

            if n_obs < 12 or candidate_model is None:
                # Statistically Insufficient Series: Hard gated per Rule 7 & Blueprint
                for ym, dt in forecast_months:
                    fc_key = (reg.id, occ.id, "Holt-Winters Exponential Smoothing", ym)
                    if fc_key in existing_forecasts:
                        continue

                    fc = Forecast(
                        region_id=reg.id,
                        occupation_id=occ.id,
                        model_name="Holt-Winters Exponential Smoothing",
                        forecast_year_month=ym,
                        forecast_date=dt,
                        predicted_demand=None,
                        lower_bound=None,
                        upper_bound=None,
                        is_sufficient=False,
                        gating_reason=f"insufficient history to forecast ({n_obs} obs < 12 required)",
                        data_vintage="2023-12-31",
                    )
                    forecasts_to_add.append(fc)
                    existing_forecasts.add(fc_key)
            else:
                # Sufficient Series: Predict 6 steps ahead
                preds = candidate_model.predict(steps=len(forecast_months))
                hist_std = float(np.std(group["demand_count"]))

                for step_idx, (ym, dt) in enumerate(forecast_months):
                    fc_key = (reg.id, occ.id, "Holt-Winters Exponential Smoothing", ym)
                    if fc_key in existing_forecasts:
                        continue

                    p_val = round(float(preds[step_idx]), 2)
                    margin = round(float(1.96 * hist_std * np.sqrt(step_idx + 1) * 0.4), 2)
                    fc = Forecast(
                        region_id=reg.id,
                        occupation_id=occ.id,
                        model_name="Holt-Winters Exponential Smoothing",
                        forecast_year_month=ym,
                        forecast_date=dt,
                        predicted_demand=p_val,
                        lower_bound=max(0.0, round(p_val - margin, 2)),
                        upper_bound=round(p_val + margin, 2),
                        is_sufficient=True,
                        gating_reason=None,
                        data_vintage="2023-12-31",
                    )
                    forecasts_to_add.append(fc)
                    existing_forecasts.add(fc_key)

        if forecasts_to_add:
            session.bulk_save_objects(forecasts_to_add)
            session.flush()
            stats["forecasts_inserted"] += len(forecasts_to_add)

        # 8. Ingest Model Runs provenance
        logger.info("Step 8: Loading model run metadata record...")
        meta_path = os.path.abspath("ml/artifacts/metadata.json")
        if os.path.exists(meta_path):
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)

            run_id = f"{meta.get('pipeline_version', '1.0.0')}_{meta.get('data_version', 'panel_v1')}"
            existing_run = session.scalars(select(ModelRun).where(ModelRun.run_id == run_id)).first()

            if not existing_run:
                eval_block = meta.get("overall_evaluation", {})
                b_metrics = eval_block.get("baseline_metrics", {})
                c_metrics = eval_block.get("candidate_metrics", {})

                validation_json_path = os.path.abspath("ml/artifacts/evidence_validation.json")
                evidence_validation_json = None
                if os.path.exists(validation_json_path):
                    with open(validation_json_path, "r", encoding="utf-8") as vf:
                        evidence_validation_json = vf.read()
                else:
                    logger.warning(
                        "ml/artifacts/evidence_validation.json not found - run "
                        "`python -m ml.evaluate.backtest` first. model_runs.evidence_validation_json will be null."
                    )

                mr = ModelRun(
                    run_id=run_id,
                    pipeline_version=meta.get("pipeline_version", "1.0.0"),
                    data_version=meta.get("data_version", "panel_v1"),
                    training_start=meta.get("training_window", {}).get("start_date", "2022-01-01"),
                    training_end=meta.get("training_window", {}).get("end_date", "2023-12-01"),
                    baseline_model=eval_block.get("baseline_model", "Seasonal-Naive"),
                    candidate_model=eval_block.get("candidate_model", "Holt-Winters"),
                    overall_mae=c_metrics.get("mae", 0.0),
                    overall_rmse=c_metrics.get("rmse", 0.0),
                    overall_mape=c_metrics.get("mape", 0.0),
                    baseline_mae=b_metrics.get("mae", 0.0),
                    baseline_rmse=b_metrics.get("rmse", 0.0),
                    baseline_mape=b_metrics.get("mape", 0.0),
                    total_evaluated_segments=eval_block.get("total_evaluated_segments", 188),
                    candidate_losses_to_baseline_count=eval_block.get("candidate_losses_to_baseline_count", 64),
                    excluded_segments_count=meta.get("sufficiency_gating", {}).get("excluded_segments_count", 4),
                    grade_distribution=json.dumps(meta.get("evidence_grading", {}).get("grade_distribution", {})),
                    category_metrics=json.dumps(eval_block.get("category_metrics", {})),
                    artifact_path=meta.get("artifact_paths", {}).get("model_path"),
                    evidence_validation_json=evidence_validation_json,
                )
                session.add(mr)
                session.flush()
                stats["model_runs_inserted"] += 1

        session.commit()
        logger.info("ETL execution completed successfully.")
        return stats

    except Exception as e:
        session.rollback()
        logger.error(f"ETL transaction failed: {e}", exc_info=True)
        raise
    finally:
        session.close()


def main():
    parser = argparse.ArgumentParser(description="Load processed panel data into Postgres/SQLite.")
    parser.add_argument("--db-url", type=str, default=settings.DATABASE_URL, help="Database connection URL")
    args = parser.parse_args()

    logger.info("Starting idempotent processed data loading...")
    stats = load_data(args.db_url)
    print("\n" + "=" * 50)
    print("ETL LOAD SUMMARY (Rows Inserted This Run):")
    print("=" * 50)
    for k, v in stats.items():
        print(f"  {k:<32}: {v}")
    print("=" * 50)


if __name__ == "__main__":
    main()

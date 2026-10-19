"""Builds the real occupation<->skill relationship graph for the Skill
Relationship Universe (3D + 2D views).

IMPORTANT HONESTY NOTE: this graph contains only occupation-to-skill edges,
sourced from OccupationSkillMap (O*NET-derived importance scores, curated
for this project's 24-occupation subset - see TRADE_SKILLS_MAP in
backend/scripts/load_processed_data.py). It does NOT contain skill-to-skill
co-occurrence edges observed in real job postings, because the real
postings sample (10 records, 2 crosswalk-matched) is far too sparse to
support a meaningful co-occurrence signal - fabricating such edges would
violate this project's data-integrity rules. Any skill-to-skill adjacency
in the UI is explicitly computed as "skills that share a required
occupation in this curated mapping," which is disclosed as a weaker,
derived relationship, not an observed one.
"""

from typing import Any, Dict, List

from sqlalchemy.orm import Session, selectinload

from backend.app.models.entities import Occupation, OccupationSkillMap


def build_skill_graph(db: Session) -> Dict[str, Any]:
    occupations = db.query(Occupation).options(
        selectinload(Occupation.skills).selectinload(OccupationSkillMap.skill)
    ).all()

    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    seen_skill_ids: set[int] = set()

    for occ in occupations:
        nodes.append({
            "id": f"occ-{occ.id}",
            "label": occ.title,
            "type": "occupation",
            "category": occ.trade_category,
            "size": max(1, len(occ.skills)),  # real measure: number of real mapped skills
            "meta": {"nco_code": occ.nco_code, "nco_code_str": occ.nco_code_str},
        })
        for mapping in occ.skills:
            sk = mapping.skill
            if sk is None:
                continue
            if sk.id not in seen_skill_ids:
                nodes.append({
                    "id": f"skill-{sk.id}",
                    "label": sk.skill_name,
                    "type": "skill",
                    "category": sk.category,
                    "size": 1,  # updated below once all edges are known
                    "meta": {"source": sk.source},
                })
                seen_skill_ids.add(sk.id)
            edges.append({
                "source": f"occ-{occ.id}",
                "target": f"skill-{sk.id}",
                "weight": mapping.importance_score,
                "relationship": "requires_skill",
            })

    # Real measure for skill node size: how many of our 24 curated
    # occupations require it (a genuine, if small-sample, frequency count).
    skill_edge_counts: Dict[str, int] = {}
    for e in edges:
        skill_edge_counts[e["target"]] = skill_edge_counts.get(e["target"], 0) + 1
    for n in nodes:
        if n["type"] == "skill":
            n["size"] = skill_edge_counts.get(n["id"], 1)

    return {
        "nodes": nodes,
        "edges": edges,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "occupation_count": len(occupations),
        "skill_count": len(seen_skill_ids),
        "data_note": (
            "Edges represent real occupation-requires-skill relationships from the "
            "O*NET-derived curated mapping (OccupationSkillMap), weighted by real "
            "importance scores. This graph does NOT include skill-to-skill "
            "co-occurrence observed in job postings - the real postings sample is too "
            "sparse (10 records, 2 matched) to support that signal honestly."
        ),
    }

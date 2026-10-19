"""Occupation crosswalk feature module.

Maps unstructured job titles to canonical NCO-2015 occupations using a curated
domain lookup table for ambiguous cases and a fuzzy token similarity matcher.
"""

import csv
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple
import pandas as pd

logger = logging.getLogger(__name__)

REFERENCE_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../data/reference/nco_subset.csv")
)

# Curated lookup table for common abbreviations, industry titles, and ambiguous cases
MANUAL_LOOKUP_TABLE: Dict[str, str] = {
    # IT & ITES
    "software developer": "2512.0100",
    "software engineer": "2512.0100",
    "senior software engineer": "2512.0100",
    "python developer": "2512.0100",
    "java developer": "2512.0100",
    "full stack developer": "2512.0100",
    "backend developer": "2512.0100",
    "frontend developer": "2512.0100",
    "sde": "2512.0100",
    "sde 1": "2512.0100",
    "sde 2": "2512.0100",
    
    "systems analyst": "2511.0100",
    "system analyst": "2511.0100",
    "business systems analyst": "2511.0100",
    "system engineer": "2511.0100",
    "it analyst": "2511.0100",
    
    "database administrator": "2521.0100",
    "dba": "2521.0100",
    "sql dba": "2521.0100",
    "database engineer": "2521.0100",
    
    "web developer": "2513.0100",
    "web designer": "2513.0100",
    "copywriter": "2513.0100",  # Content creator / multimedia developer
    "content writer": "2513.0100",
    "multimedia developer": "2513.0100",
    "ui/ux designer": "2513.0100",
    
    "network technician": "3511.0100",
    "system administrator": "3511.0100",
    "desktop support engineer": "7422.0200",
    "hardware engineer": "7422.0200",
    "field technician": "7422.0200",
    "computer technician": "7422.0200",
    
    "customer care executive": "4222.0100",
    "customer support executive": "4222.0100",
    "bpo executive": "4222.0100",
    "telecaller": "4222.0100",
    "call center agent": "4222.0100",
    
    "data entry operator": "4132.0100",
    "deo": "4132.0100",
    "data entry clerk": "4132.0100",
    "computer operator": "4132.0100",

    # ITI / Engineering Trades
    "electrician": "7411.0100",
    "electrician general": "7411.0100",
    "maintenance electrician": "7411.0100",
    "industrial electrician": "7411.0100",
    "wireman": "7412.0100",
    
    "fitter": "7233.0100",
    "fitter general": "7233.0100",
    "mechanical fitter": "7233.0100",
    "assembly fitter": "7233.0100",
    
    "welder": "7212.0100",
    "gas welder": "7212.0100",
    "arc welder": "7212.0100",
    "tig welder": "7212.0100",
    "mig welder": "7212.0100",
    
    "turner": "7223.0100",
    "lathe operator": "7223.0100",
    "cnc lathe operator": "7223.0100",
    
    "machinist": "7223.0200",
    "cnc machinist": "7223.0200",
    "vmc operator": "7223.0200",
    
    "motor mechanic": "7231.0100",
    "mechanic motor vehicle": "7231.0100",
    "auto mechanic": "7231.0100",
    "diesel mechanic": "7231.0100",
    
    "electronics mechanic": "7421.0100",
    "electronic technician": "7421.0100",
    
    "plumber": "7126.0100",
    "plumber general": "7126.0100",
    "pipe fitter": "7126.0100",
    
    "mason": "7112.0100",
    "bricklayer": "7112.0100",
    
    "carpenter": "7115.0100",
    "carpenter general": "7115.0100",
    
    "ac technician": "7127.0100",
    "refrigeration mechanic": "7127.0100",
    "hvac technician": "7127.0100",
    "hvac": "7127.0100",
    "cooling technician": "7127.0100",
    
    "sewing machine operator": "7533.0100",
    "tailor": "7533.0100",
    
    "solar technician": "7421.0300",
    "solar panel installer": "7421.0300",
    
    "general duty assistant": "5321.0100",
    "patient care attendant": "5321.0100",
    "nursing assistant": "5321.0100",
    "gda": "5321.0100",
    
    "retail sales associate": "5223.0100",
    "store executive": "5223.0100",
    "sales associate": "5223.0100",
    "cashier": "5223.0100",
}


class OccupationCrosswalk:
    """Crosswalk engine mapping job titles to canonical NCO-2015 occupations."""

    def __init__(self, ref_path: str = REFERENCE_PATH):
        self.ref_path = ref_path
        self.occupations_by_code: Dict[str, Dict[str, Any]] = {}
        self.occupations_list: List[Dict[str, Any]] = []
        self._load_reference()

    def _load_reference(self):
        """Loads canonical reference occupations."""
        if not os.path.exists(self.ref_path):
            raise FileNotFoundError(f"Reference file not found: {self.ref_path}")

        with open(self.ref_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                code = row["nco_2015_code"]
                self.occupations_by_code[code] = row
                self.occupations_list.append(row)

    @staticmethod
    def _tokenize(text: str) -> Set[str]:
        cleaned = re.sub(r"[^\w\s]", " ", text.lower())
        stopwords = {"general", "and", "or", "of", "the", "in", "for", "with", "a", "an"}
        return {w for w in cleaned.split() if w not in stopwords and len(w) > 1}

    def match_title(self, raw_title: str, threshold: float = 0.40) -> Dict[str, Any]:
        """Matches a raw job title to the closest canonical NCO-2015 occupation."""
        if not raw_title or not isinstance(raw_title, str):
            return {
                "nco_code": None,
                "occupation_title": "Unmatched",
                "trade_category": None,
                "match_type": "none",
                "confidence": 0.0,
            }

        title_clean = raw_title.strip().lower()

        # 1. Exact Manual Lookup
        if title_clean in MANUAL_LOOKUP_TABLE:
            code = MANUAL_LOOKUP_TABLE[title_clean]
            occ = self.occupations_by_code[code]
            return {
                "nco_code": code,
                "occupation_title": occ["occupation_title"],
                "trade_category": occ["trade_category"],
                "match_type": "manual_exact",
                "confidence": 1.0,
            }

        # Check partial phrase in manual lookup
        for phrase, code in MANUAL_LOOKUP_TABLE.items():
            if phrase in title_clean:
                occ = self.occupations_by_code[code]
                return {
                    "nco_code": code,
                    "occupation_title": occ["occupation_title"],
                    "trade_category": occ["trade_category"],
                    "match_type": "manual_phrase",
                    "confidence": 0.90,
                }

        # 2. Fuzzy Token Similarity
        input_tokens = self._tokenize(title_clean)
        if not input_tokens:
            return {
                "nco_code": None,
                "occupation_title": "Unmatched",
                "trade_category": None,
                "match_type": "none",
                "confidence": 0.0,
            }

        best_score = 0.0
        best_occ = None

        for occ in self.occupations_list:
            target_tokens = self._tokenize(occ["occupation_title"])
            if not target_tokens:
                continue

            intersection = len(input_tokens.intersection(target_tokens))
            union = len(input_tokens.union(target_tokens))
            jaccard = intersection / union if union > 0 else 0.0

            # Weight overlap relative to target tokens
            overlap_score = intersection / len(target_tokens)
            score = 0.6 * overlap_score + 0.4 * jaccard

            if score > best_score:
                best_score = score
                best_occ = occ

        if best_score >= threshold and best_occ is not None:
            return {
                "nco_code": best_occ["nco_2015_code"],
                "occupation_title": best_occ["occupation_title"],
                "trade_category": best_occ["trade_category"],
                "match_type": "fuzzy_token",
                "confidence": round(best_score, 3),
            }

        return {
            "nco_code": None,
            "occupation_title": "Unmatched",
            "trade_category": None,
            "match_type": "unmatched",
            "confidence": round(best_score, 3),
        }


if __name__ == "__main__":
    crosswalk = OccupationCrosswalk()
    test_titles = [
        "Copywriter",
        "Senior Python Developer",
        "Industrial Arc Welder",
        "General Duty Hospital Attendant",
        "HVAC Cooling Technician",
        "Random Unrelated Title XYZ",
    ]
    for t in test_titles:
        m = crosswalk.match_title(t)
        print(f"'{t}' -> {m['occupation_title']} [{m['nco_code']}] ({m['match_type']}, conf={m['confidence']})")

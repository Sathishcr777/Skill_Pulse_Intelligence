"""Clean and index O*NET taxonomy tables.

Extracts canonical occupation and skill vocabularies from raw O*NET data.
"""

import csv
import logging
import os
from typing import Dict, List, Set
import pandas as pd

logger = logging.getLogger(__name__)

ONET_RAW_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../data/raw/onet_esco/onet")
)


def load_onet_occupations() -> pd.DataFrame:
    """Loads standardized O*NET occupations."""
    path = os.path.join(ONET_RAW_DIR, "Occupation Data.txt")
    if not os.path.exists(path):
        logger.warning(f"O*NET occupations file not found at {path}")
        return pd.DataFrame()

    df = pd.read_csv(path, sep="\t", encoding="utf-8")
    df.rename(
        columns={
            "O*NET-SOC Code": "onet_soc_code",
            "Title": "title",
            "Description": "description",
        },
        inplace=True,
    )
    return df


def load_onet_skills_vocabulary() -> Dict[str, Dict[str, str]]:
    """Loads canonical skill and software tool vocabulary from O*NET tables.
    
    Returns a mapping of normalized skill term -> metadata {original_term, category, element_id}.
    """
    vocab: Dict[str, Dict[str, str]] = {}

    # 1. Essential Skills
    skills_path = os.path.join(ONET_RAW_DIR, "Essential Skills.txt")
    if os.path.exists(skills_path):
        with open(skills_path, "r", encoding="utf-8", errors="ignore") as f:
            reader = csv.DictReader(f, delimiter="\t")
            for row in reader:
                name = row.get("Element Name", "").strip()
                if name:
                    key = name.lower()
                    if key not in vocab:
                        vocab[key] = {
                            "original_term": name,
                            "category": "essential_skill",
                            "element_id": row.get("Element ID", ""),
                        }

    # 2. Software Skills
    software_path = os.path.join(ONET_RAW_DIR, "Software Skills.txt")
    if os.path.exists(software_path):
        with open(software_path, "r", encoding="utf-8", errors="ignore") as f:
            reader = csv.DictReader(f, delimiter="\t")
            for row in reader:
                example = row.get("Workplace Example", "").strip()
                if example:
                    key = example.lower()
                    if key not in vocab:
                        vocab[key] = {
                            "original_term": example,
                            "category": "software_tool",
                            "element_id": row.get("Element ID", ""),
                        }

    # 3. Knowledge Areas
    knowledge_path = os.path.join(ONET_RAW_DIR, "Knowledge.txt")
    if os.path.exists(knowledge_path):
        with open(knowledge_path, "r", encoding="utf-8", errors="ignore") as f:
            reader = csv.DictReader(f, delimiter="\t")
            for row in reader:
                name = row.get("Element Name", "").strip()
                if name:
                    key = name.lower()
                    if key not in vocab:
                        vocab[key] = {
                            "original_term": name,
                            "category": "knowledge_domain",
                            "element_id": row.get("Element ID", ""),
                        }

    logger.info(f"Loaded {len(vocab)} unique O*NET skill vocabulary terms")
    return vocab


if __name__ == "__main__":
    v = load_onet_skills_vocabulary()
    print(f"Total vocabulary terms: {len(v)}")
    sample_keys = list(v.keys())[:10]
    for sk in sample_keys:
        print(f"  {sk} -> {v[sk]}")

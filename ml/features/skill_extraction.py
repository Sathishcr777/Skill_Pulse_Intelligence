"""Skill extraction feature module.

Extracts occupational skills and software tools from job posting text against
the canonical O*NET/ESCO vocabulary using exact dictionary token matching and
a free local sentence-transformers embedding fallback (no paid APIs).
"""

import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from ml.clean.clean_onet import load_onet_skills_vocabulary

logger = logging.getLogger(__name__)


class SkillExtractor:
    """Extracts skills from text using dictionary lookup and local embedding similarity."""

    def __init__(self, vocab: Optional[Dict[str, Dict[str, str]]] = None, use_embeddings: bool = True):
        self.vocab = vocab or load_onet_skills_vocabulary()
        self.use_embeddings = use_embeddings
        self._embedder = None
        self._vocab_embeddings = None
        self._embedding_terms: List[str] = []

    def _lazy_load_embedder(self):
        """Lazily load local sentence-transformers model without external API calls."""
        if self._embedder is None and self.use_embeddings:
            try:
                from sentence_transformers import SentenceTransformer
                # Use lightweight, fast local MiniLM model
                logger.info("Initializing local SentenceTransformer('all-MiniLM-L6-v2')...")
                self._embedder = SentenceTransformer("all-MiniLM-L6-v2")
                # Precompute embeddings for top essential skills and domains
                self._embedding_terms = [
                    k for k, v in self.vocab.items()
                    if v.get("category") in ["essential_skill", "knowledge_domain"]
                ][:150]
                if self._embedding_terms:
                    self._vocab_embeddings = self._embedder.encode(
                        self._embedding_terms, convert_to_tensor=True, show_progress_bar=False
                    )
            except Exception as e:
                logger.warning(f"Local embedding fallback unavailable: {e}. Relying on dictionary matching.")
                self._embedder = None

    def extract_skills_dictionary(self, text: str) -> List[Dict[str, Any]]:
        """Extracts skills via fast dictionary multi-word token matching."""
        if not text or not isinstance(text, str):
            return []

        text_lower = text.lower()
        # Clean punctuation except hyphens and slashes
        clean_text = re.sub(r"[^\w\s\-/]", " ", text_lower)
        words = clean_text.split()

        extracted: List[Dict[str, Any]] = []
        matched_keys: Set[str] = set()

        # Check n-grams up to 4 words
        n_words = len(words)
        for n in range(4, 0, -1):
            for i in range(n_words - n + 1):
                phrase = " ".join(words[i : i + n])
                if phrase in self.vocab and phrase not in matched_keys:
                    meta = self.vocab[phrase]
                    # Filter out overly generic 1-word terms (e.g. 'a', 'in', 'to')
                    if len(phrase) < 3 and phrase not in ["c", "r", "go", "ui"]:
                        continue
                    matched_keys.add(phrase)
                    extracted.append({
                        "term": meta.get("original_term", phrase),
                        "normalized_key": phrase,
                        "category": meta.get("category", "skill"),
                        "element_id": meta.get("element_id", ""),
                        "match_type": "exact_dictionary",
                        "confidence": 1.0,
                    })

        return extracted

    def extract_skills_semantic(self, text: str, threshold: float = 0.65) -> List[Dict[str, Any]]:
        """Semantic fallback: finds high-similarity skills for sentence snippets."""
        self._lazy_load_embedder()
        if self._embedder is None or self._vocab_embeddings is None:
            return []

        # Split into sentences or key bullet points
        sentences = [s.strip() for s in re.split(r"[\n\.;]", text) if len(s.strip()) > 15][:5]
        if not sentences:
            return []

        try:
            from sentence_transformers import util
            sent_embs = self._embedder.encode(sentences, convert_to_tensor=True, show_progress_bar=False)
            cos_scores = util.cos_sim(sent_embs, self._vocab_embeddings)

            results = []
            for s_idx, scores in enumerate(cos_scores):
                top_match_idx = int(scores.argmax().item())
                score = float(scores[top_match_idx].item())
                if score >= threshold:
                    term = self._embedding_terms[top_match_idx]
                    meta = self.vocab[term]
                    results.append({
                        "term": meta.get("original_term", term),
                        "normalized_key": term,
                        "category": meta.get("category", "skill"),
                        "element_id": meta.get("element_id", ""),
                        "match_type": "semantic_embedding",
                        "confidence": round(score, 3),
                        "source_phrase": sentences[s_idx][:80],
                    })
            return results
        except Exception as e:
            logger.debug(f"Semantic match error: {e}")
            return []

    def extract_skills(self, text: str) -> List[Dict[str, Any]]:
        """Full extraction pipeline: dictionary matching + semantic embedding fallback."""
        dict_matches = self.extract_skills_dictionary(text)
        matched_keys = {m["normalized_key"] for m in dict_matches}

        if len(dict_matches) < 2 and self.use_embeddings:
            semantic_matches = self.extract_skills_semantic(text)
            for sm in semantic_matches:
                if sm["normalized_key"] not in matched_keys:
                    dict_matches.append(sm)
                    matched_keys.add(sm["normalized_key"])

        return dict_matches


if __name__ == "__main__":
    extractor = SkillExtractor(use_embeddings=False)
    sample_text = (
        "Seeking an Electrician with hands-on experience in electrical wiring, PLC programming, "
        "circuit maintenance, troubleshooting, and critical thinking."
    )
    skills = extractor.extract_skills(sample_text)
    print(f"Extracted {len(skills)} skills:")
    for s in skills:
        print(f" - {s['term']} ({s['category']}, confidence={s['confidence']})")

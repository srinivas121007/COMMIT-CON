"""
Deduplication and Entity Resolution module.
- Blocking on people (last name prefix OR birth year) and places (name prefix OR country).
- Scoring:
  - People: 0.50 name_sim + 0.30 dob_sim + 0.15 birthplace_sim + 0.05 occupation_sim
  - Veto (score 0): if both DOB years differ by > 2 and name_sim < 0.97
  - Places: 0.70 name_sim + 0.30 country_sim
- Thresholds: >=0.90 auto-merge, 0.70-0.90 review.
- Union-Find clustering with cluster verification (split if any internal pair < 0.50).
Never mutates input DataFrames.
"""

from collections import defaultdict
from itertools import combinations
from typing import Dict, List, Tuple, Set, Any, Optional
import pandas as pd
from rapidfuzz import fuzz
from rapidfuzz.distance import JaroWinkler


class UnionFind:
    """Disjoint-set / Union-Find data structure."""
    def __init__(self, elements: List[str]):
        self.parent = {x: x for x in elements}
        self.rank = {x: 0 for x in elements}

    def find(self, x: str) -> str:
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, x: str, y: str):
        root_x = self.find(x)
        root_y = self.find(y)
        if root_x == root_y:
            return
        if self.rank[root_x] < self.rank[root_y]:
            self.parent[root_x] = root_y
        elif self.rank[root_x] > self.rank[root_y]:
            self.parent[root_y] = root_x
        else:
            self.parent[root_y] = root_x
            self.rank[root_x] += 1

    def get_clusters(self) -> Dict[str, List[str]]:
        clusters = defaultdict(list)
        for elem in self.parent:
            root = self.find(elem)
            clusters[root].append(elem)
        return dict(clusters)


def compute_string_sim(s1: Optional[str], s2: Optional[str]) -> float:
    """Max of Jaro-Winkler similarity and token_sort_ratio / 100."""
    if not s1 or not s2:
        return 0.0
    str1, str2 = str(s1).strip().lower(), str(s2).strip().lower()
    if not str1 or not str2:
        return 0.0
    if str1 == str2:
        return 1.0

    jw = JaroWinkler.similarity(str1, str2)
    tsr = fuzz.token_sort_ratio(str1, str2) / 100.0
    return max(jw, tsr)


def compute_people_pair_score(r1: Dict[str, Any], r2: Dict[str, Any]) -> Tuple[float, Dict[str, float]]:
    """
    Compute people match score:
    - 0.50 name_sim (max JaroWinkler, token_sort_ratio)
    - 0.30 dob_sim (1.0 exact, 0.7 same year-month, 0.5 same year, 0 else, 0.5 neutral if missing)
    - 0.15 birthplace_sim (1.0 match, 0.5 missing, 0 else)
    - 0.05 occupation_sim (1.0 match, 0.8 similar, 0.5 missing, 0 else)
    Veto (score 0) if both DOB years differ by > 2 and name_sim < 0.97.
    """
    name1 = r1.get("norm_full_name") or r1.get("full_name") or ""
    name2 = r2.get("norm_full_name") or r2.get("full_name") or ""
    name_sim = compute_string_sim(name1, name2)

    # Also compare raw full names in case normalization smoothed differences
    raw_name_sim = compute_string_sim(r1.get("full_name", ""), r2.get("full_name", ""))
    effective_name_sim = max(name_sim, raw_name_sim)

    # DOB similarity
    dob1 = str(r1.get("norm_dob") or r1.get("dob") or "").strip()
    dob2 = str(r2.get("norm_dob") or r2.get("dob") or "").strip()

    dob_year1: Optional[int] = None
    dob_year2: Optional[int] = None

    if not dob1 or not dob2 or dob1.lower() in ("none", "nan") or dob2.lower() in ("none", "nan"):
        dob_sim = 0.5  # Neutral if missing
    elif dob1 == dob2:
        dob_sim = 1.0
        try:
            dob_year1 = int(dob1[:4])
            dob_year2 = int(dob2[:4])
        except Exception:
            pass
    elif len(dob1) >= 7 and len(dob2) >= 7 and dob1[:7] == dob2[:7]:
        dob_sim = 0.7
        try:
            dob_year1 = int(dob1[:4])
            dob_year2 = int(dob2[:4])
        except Exception:
            pass
    elif len(dob1) >= 4 and len(dob2) >= 4 and dob1[:4] == dob2[:4]:
        dob_sim = 0.5
        try:
            dob_year1 = int(dob1[:4])
            dob_year2 = int(dob2[:4])
        except Exception:
            pass
    else:
        dob_sim = 0.0
        try:
            dob_year1 = int(dob1[:4])
            dob_year2 = int(dob2[:4])
        except Exception:
            pass

    # VETO RULE: if both DOB years differ by more than 2 and name_sim < 0.97 -> score 0
    if dob_year1 is not None and dob_year2 is not None:
        if abs(dob_year1 - dob_year2) > 2 and effective_name_sim < 0.97:
            return 0.0, {
                "name_sim": effective_name_sim,
                "dob_sim": dob_sim,
                "birthplace_sim": 0.0,
                "occupation_sim": 0.0,
                "vetoed": 1.0,
            }

    # Birthplace similarity
    bp1 = str(r1.get("birth_place_id") or "").strip()
    bp2 = str(r2.get("birth_place_id") or "").strip()
    if not bp1 or not bp2 or bp1.lower() in ("none", "nan") or bp2.lower() in ("none", "nan"):
        birthplace_sim = 0.5
    elif bp1 == bp2:
        birthplace_sim = 1.0
    else:
        birthplace_sim = 0.0

    # Occupation similarity
    occ1 = str(r1.get("norm_occupation") or r1.get("occupation") or "").strip()
    occ2 = str(r2.get("norm_occupation") or r2.get("occupation") or "").strip()
    if not occ1 or not occ2 or occ1.lower() in ("none", "nan") or occ2.lower() in ("none", "nan"):
        occupation_sim = 0.5
    elif occ1 == occ2:
        occupation_sim = 1.0
    else:
        sim = compute_string_sim(occ1, occ2)
        occupation_sim = 0.8 if sim > 0.8 else 0.0

    total_score = (
        0.50 * effective_name_sim
        + 0.30 * dob_sim
        + 0.15 * birthplace_sim
        + 0.05 * occupation_sim
    )

    return total_score, {
        "name_sim": effective_name_sim,
        "dob_sim": dob_sim,
        "birthplace_sim": birthplace_sim,
        "occupation_sim": occupation_sim,
        "vetoed": 0.0,
    }


def compute_places_pair_score(r1: Dict[str, Any], r2: Dict[str, Any]) -> Tuple[float, Dict[str, float]]:
    """
    Compute places match score:
    - 0.70 name_sim (max JaroWinkler, token_sort_ratio)
    - 0.30 country_sim
    """
    n1 = r1.get("norm_name") or r1.get("name") or ""
    n2 = r2.get("norm_name") or r2.get("name") or ""
    name_sim = compute_string_sim(n1, n2)

    c1 = r1.get("norm_country") or r1.get("country") or ""
    c2 = r2.get("norm_country") or r2.get("country") or ""
    if not c1 or not c2:
        country_sim = 0.5
    elif c1 == c2 or compute_string_sim(c1, c2) > 0.85:
        country_sim = 1.0
    else:
        country_sim = 0.0

    total_score = 0.70 * name_sim + 0.30 * country_sim
    return total_score, {"name_sim": name_sim, "country_sim": country_sim}


def generate_people_candidate_pairs(records: List[Dict[str, Any]]) -> Set[Tuple[int, int]]:
    """
    Blocking: first 3 chars of last name OR birth year.
    Never compare all pairs.
    """
    blocks = defaultdict(list)
    for idx, r in enumerate(records):
        # Last name blocking key
        ln = str(r.get("norm_last_name") or "").strip()
        if len(ln) >= 3:
            blocks[f"ln_{ln[:3]}"].append(idx)
        else:
            fn = str(r.get("norm_first_name") or r.get("norm_full_name") or "").strip()
            if len(fn) >= 3:
                blocks[f"fn_{fn[:3]}"].append(idx)

        # Birth year blocking key
        dob = str(r.get("norm_dob") or r.get("dob") or "").strip()
        if len(dob) >= 4 and dob[:4].isdigit():
            blocks[f"by_{dob[:4]}"].append(idx)

    candidate_pairs = set()
    for b_key, indices in blocks.items():
        if len(indices) < 2:
            continue
        # Within block, add pairs
        for i in range(len(indices)):
            for j in range(i + 1, len(indices)):
                idx1, idx2 = sorted((indices[i], indices[j]))
                candidate_pairs.add((idx1, idx2))

    return candidate_pairs


def generate_places_candidate_pairs(records: List[Dict[str, Any]]) -> Set[Tuple[int, int]]:
    """
    Blocking: first 3 chars of name OR country.
    Never compare all pairs.
    """
    blocks = defaultdict(list)
    for idx, r in enumerate(records):
        name = str(r.get("norm_name") or r.get("name") or "").strip()
        if len(name) >= 3:
            blocks[f"nm_{name[:3]}"].append(idx)
        country = str(r.get("norm_country") or r.get("country") or "").strip()
        if country:
            blocks[f"ct_{country}"].append(idx)

    candidate_pairs = set()
    for b_key, indices in blocks.items():
        if len(indices) < 2:
            continue
        for i in range(len(indices)):
            for j in range(i + 1, len(indices)):
                idx1, idx2 = sorted((indices[i], indices[j]))
                candidate_pairs.add((idx1, idx2))

    return candidate_pairs


def deduplicate_dataset(
    people_df: pd.DataFrame,
    places_df: pd.DataFrame,
) -> Dict[str, Any]:
    """
    Performs blocking, pairwise scoring, and cluster validation.
    Returns:
    {
      "people": {
        "auto_merge_clusters": List[List[str]],
        "review_pairs": List[Dict[str, Any]],
        "pairwise_scores": Dict[Tuple[str, str], float],
        "split_clusters": List[Dict[str, Any]],
      },
      "places": {
        "auto_merge_clusters": List[List[str]],
        "review_pairs": List[Dict[str, Any]],
        "pairwise_scores": Dict[Tuple[str, str], float],
        "split_clusters": List[Dict[str, Any]],
      }
    }
    """
    results: Dict[str, Any] = {}

    for entity_type, df, id_col, cand_func, score_func in [
        ("people", people_df, "person_id", generate_people_candidate_pairs, compute_people_pair_score),
        ("places", places_df, "place_id", generate_places_candidate_pairs, compute_places_pair_score),
    ]:
        records = df.to_dict(orient="records")
        all_ids = [r[id_col] for r in records]
        id_to_record = {r[id_col]: r for r in records}

        candidate_pairs = cand_func(records)
        pairwise_scores: Dict[Tuple[str, str], float] = {}
        high_sim_pairs: List[Tuple[str, str, float]] = []
        review_pairs: List[Dict[str, Any]] = []

        for idx1, idx2 in candidate_pairs:
            r1 = records[idx1]
            r2 = records[idx2]
            id1, id2 = r1[id_col], r2[id_col]
            pair_key = (min(id1, id2), max(id1, id2))

            score, components = score_func(r1, r2)
            pairwise_scores[pair_key] = score

            if score >= 0.90:
                high_sim_pairs.append((pair_key[0], pair_key[1], score))
            elif score >= 0.70:
                review_pairs.append({
                    "id1": pair_key[0],
                    "id2": pair_key[1],
                    "score": round(score, 4),
                    "components": components,
                    "reason": f"Similarity {score:.2f} in review band [0.70, 0.90)",
                })

        # Union-Find for high similarity pairs
        uf = UnionFind(all_ids)
        for id1, id2, _ in high_sim_pairs:
            uf.union(id1, id2)

        raw_clusters = uf.get_clusters()
        auto_merge_clusters: List[List[str]] = []
        split_clusters: List[Dict[str, Any]] = []

        for root, cluster_members in raw_clusters.items():
            if len(cluster_members) <= 1:
                continue

            # Verify cluster: if ANY pair inside cluster scores < 0.50, split it!
            has_weak_pair = False
            weak_pairs = []

            for m1, m2 in combinations(cluster_members, 2):
                p_key = (min(m1, m2), max(m1, m2))
                # If pair was not in candidates, compute score directly
                if p_key in pairwise_scores:
                    p_score = pairwise_scores[p_key]
                else:
                    rec1 = id_to_record[p_key[0]]
                    rec2 = id_to_record[p_key[1]]
                    p_score, p_comp = score_func(rec1, rec2)
                    pairwise_scores[p_key] = p_score

                if p_score < 0.50:
                    has_weak_pair = True
                    weak_pairs.append((p_key[0], p_key[1], p_score))

            if has_weak_pair:
                # Inconsistent cluster! Split it and route weak pairs / members to review
                split_clusters.append({
                    "cluster": cluster_members,
                    "weak_pairs": weak_pairs,
                    "reason": f"Cluster check triggered: internal pair score < 0.50 ({weak_pairs})",
                })
                for w1, w2, w_score in weak_pairs:
                    review_pairs.append({
                        "id1": w1,
                        "id2": w2,
                        "score": round(w_score, 4),
                        "components": {},
                        "reason": f"Weak link in cluster (score {w_score:.2f} < 0.50)",
                    })
                # Keep only pairs with score >= 0.90 that don't violate the weak link
                # Conservative strategy: split members into subclusters or individual review
                # We do not merge the conflicting members
            else:
                auto_merge_clusters.append(sorted(cluster_members))

        results[entity_type] = {
            "auto_merge_clusters": auto_merge_clusters,
            "review_pairs": review_pairs,
            "pairwise_scores": pairwise_scores,
            "split_clusters": split_clusters,
        }

    return results

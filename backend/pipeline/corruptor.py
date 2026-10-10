"""
Corruptor module.
Injects controlled corruption independent of repair logic:
- ~12% people duplicates with new IDs (nicknames, typos, swapped name order, initials, DOB format, missing field)
- ~8% places duplicates ("NYC", "New York City", etc.)
- ~6% text fields typos
- ~8% non-id fields nulled
- Contradictions:
  - ~4% dod before dob
  - ~3% parent younger than child
  - ~1% self-relationships
  - ~3% duplicate pairs with conflicting DOB
  - ~2% places with conflicting countries
  - ~3% events before participant's birth
Writes ground_truth dict with entity_map and injected_issues.
Never mutates original DataFrames.
"""

import copy
import json
import random
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Any, Optional
import pandas as pd

from backend.pipeline.schema import (
    PEOPLE_COLUMNS,
    PLACES_COLUMNS,
    EVENTS_COLUMNS,
    RELATIONSHIPS_COLUMNS,
)

NICKNAME_MAP = {
    "Robert": "Bob",
    "Bob": "Robert",
    "William": "Bill",
    "Bill": "William",
    "Richard": "Dick",
    "Dick": "Richard",
    "James": "Jim",
    "Jim": "James",
    "Thomas": "Tom",
    "Tom": "Thomas",
    "Charles": "Charlie",
    "Charlie": "Charles",
    "Elizabeth": "Liz",
    "Liz": "Elizabeth",
    "Margaret": "Maggie",
    "Maggie": "Margaret",
    "Jennifer": "Jen",
    "Jen": "Jennifer",
    "Katherine": "Kate",
    "Kate": "Katherine",
    "Michael": "Mike",
    "Mike": "Michael",
    "Christopher": "Chris",
    "Chris": "Christopher",
    "David": "Dave",
    "Dave": "David",
    "Daniel": "Dan",
    "Dan": "Daniel",
    "Matthew": "Matt",
    "Matt": "Matthew",
    "Anthony": "Tony",
    "Tony": "Anthony",
    "Donald": "Don",
    "Don": "Donald",
    "Alexander": "Alex",
    "Alex": "Alexander",
    "Joseph": "Joe",
    "Joe": "Joseph",
    "Benjamin": "Ben",
    "Ben": "Benjamin",
    "Edward": "Ted",
    "Ted": "Edward",
    "Samuel": "Sam",
    "Sam": "Samuel",
}

PLACE_ALIAS_MAP = {
    "New York City": "NYC",
    "Los Angeles": "LA",
    "San Francisco": "SF",
    "United States": "USA",
    "United Kingdom": "UK",
}


def _introduce_typo(text: str, rng: random.Random) -> str:
    """Introduce a minor keyboard or transposition typo in text."""
    if not text or len(text) < 4:
        return text
    pos = rng.randint(1, len(text) - 2)
    choice = rng.choice(["swap", "delete", "replace", "double"])
    if choice == "swap":
        return text[:pos] + text[pos+1] + text[pos] + text[pos+2:]
    elif choice == "delete":
        return text[:pos] + text[pos+1:]
    elif choice == "double":
        return text[:pos] + text[pos] + text[pos:]
    else:
        replace_char = rng.choice("aeioustn")
        return text[:pos] + replace_char + text[pos+1:]


def _reformat_dob(dob_str: str, rng: random.Random) -> str:
    """Reformat ISO YYYY-MM-DD to alternative formats."""
    try:
        dt = datetime.strptime(dob_str, "%Y-%m-%d")
        fmt = rng.choice(["%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"])
        return dt.strftime(fmt)
    except Exception:
        return dob_str


def inject_corruption(
    people_df: pd.DataFrame,
    places_df: pd.DataFrame,
    events_df: pd.DataFrame,
    relationships_df: pd.DataFrame,
    seed: int = 42,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
    """
    Inject controlled corruption into copies of the input dataframes.
    Returns:
    (corrupted_people, corrupted_places, corrupted_events, corrupted_relationships, ground_truth)
    """
    rng = random.Random(seed)

    c_people = people_df.copy().to_dict(orient="records")
    c_places = places_df.copy().to_dict(orient="records")
    c_events = events_df.copy().to_dict(orient="records")
    c_relationships = relationships_df.copy().to_dict(orient="records")

    entity_map: Dict[str, str] = {}
    injected_issues: List[Dict[str, Any]] = []

    # Initialize entity_map for canonical records
    for r in c_people:
        entity_map[r["person_id"]] = r["person_id"]
    for r in c_places:
        entity_map[r["place_id"]] = r["place_id"]
    for r in c_events:
        entity_map[r["event_id"]] = r["event_id"]
    for r in c_relationships:
        entity_map[r["rel_id"]] = r["rel_id"]

    # 1. Duplicate People (~12% get 1-2 duplicate rows)
    num_people = len(c_people)
    num_people_to_dup = max(1, int(num_people * 0.12))
    people_to_dup_indices = rng.sample(range(num_people), num_people_to_dup)

    next_person_idx = num_people + 1
    # We will reserve ~3% of duplicate pairs for conflicting DOBs
    conflicting_dob_count = 0
    target_conflicting_dob = max(2, int(num_people_to_dup * 0.04))  # ~3% of duplicate pairs

    for idx in people_to_dup_indices:
        orig = c_people[idx]
        num_dups = 1 if rng.random() < 0.7 else 2

        for _ in range(num_dups):
            new_id = f"PER_{next_person_idx:04d}"
            next_person_idx += 1
            dup_record = copy.deepcopy(orig)
            dup_record["person_id"] = new_id
            dup_record["source_system"] = rng.choice(["A", "B", "C"])
            dup_record["last_updated"] = f"2024-{rng.randint(1,12):02d}-{rng.randint(1,28):02d}T10:00:00Z"

            entity_map[new_id] = orig["person_id"]

            injected_issues.append({
                "record_id": new_id,
                "table": "people",
                "type": "DUPLICATE",
                "field": "person_id",
                "original_value": orig["person_id"],
                "corrupted_value": new_id,
                "description": f"Duplicate of {orig['person_id']} ({orig['full_name']})",
            })

            # Alter duplicate attributes
            # A) Name alteration: nickname, swapped name order, initials, typo
            name_parts = orig["full_name"].split(" ")
            var_type = rng.choice(["nickname", "swap", "initial", "typo"])
            if var_type == "nickname" and len(name_parts) >= 2 and name_parts[0] in NICKNAME_MAP:
                nick = NICKNAME_MAP[name_parts[0]]
                dup_record["full_name"] = f"{nick} {' '.join(name_parts[1:])}"
            elif var_type == "swap" and len(name_parts) >= 2:
                dup_record["full_name"] = f"{name_parts[-1]}, {' '.join(name_parts[:-1])}"
            elif var_type == "initial" and len(name_parts) >= 2:
                dup_record["full_name"] = f"{name_parts[0][0]}. {' '.join(name_parts[1:])}"
            else:
                dup_record["full_name"] = _introduce_typo(orig["full_name"], rng)

            # B) DOB alteration: format change OR conflicting DOB
            if conflicting_dob_count < target_conflicting_dob and rng.random() < 0.4:
                # Conflicting DOB contradiction (~3% duplicate pairs)
                conflicting_dob_count += 1
                try:
                    dt = datetime.strptime(orig["dob"], "%Y-%m-%d")
                    # Shift by 3 to 7 years
                    shift_years = rng.choice([-5, -4, -3, 3, 4, 5])
                    conf_dt = dt.replace(year=dt.year + shift_years)
                    dup_record["dob"] = conf_dt.strftime("%Y-%m-%d")
                    injected_issues.append({
                        "record_id": new_id,
                        "table": "people",
                        "type": "CONTRADICTION_CONFLICTING_DOB",
                        "field": "dob",
                        "original_value": orig["dob"],
                        "corrupted_value": dup_record["dob"],
                        "description": f"Conflicting DOB between duplicates {orig['person_id']} and {new_id}",
                    })
                except Exception:
                    pass
            elif rng.random() < 0.5:
                # Format change
                dup_record["dob"] = _reformat_dob(orig["dob"], rng)
                injected_issues.append({
                    "record_id": new_id,
                    "table": "people",
                    "type": "INVALID_FORMAT",
                    "field": "dob",
                    "original_value": orig["dob"],
                    "corrupted_value": dup_record["dob"],
                    "description": "DOB format changed from ISO YYYY-MM-DD",
                })

            # C) Missing field in duplicate
            if rng.random() < 0.4:
                field_to_null = rng.choice(["occupation", "birth_place_id", "dod"])
                if field_to_null in dup_record and dup_record[field_to_null] is not None:
                    old_v = dup_record[field_to_null]
                    dup_record[field_to_null] = None
                    injected_issues.append({
                        "record_id": new_id,
                        "table": "people",
                        "type": "MISSING_FIELD",
                        "field": field_to_null,
                        "original_value": old_v,
                        "corrupted_value": None,
                        "description": f"Nulled {field_to_null} in duplicate",
                    })

            c_people.append(dup_record)

    # 2. Duplicate Places (~8%)
    num_places = len(c_places)
    num_places_to_dup = max(1, int(num_places * 0.08))
    places_to_dup_indices = rng.sample(range(num_places), num_places_to_dup)
    next_place_idx = num_places + 1

    for idx in places_to_dup_indices:
        orig = c_places[idx]
        new_id = f"PLC_{next_place_idx:04d}"
        next_place_idx += 1
        dup_record = copy.deepcopy(orig)
        dup_record["place_id"] = new_id
        dup_record["source_system"] = rng.choice(["A", "B", "C"])
        dup_record["last_updated"] = f"2024-{rng.randint(1,12):02d}-{rng.randint(1,28):02d}T10:00:00Z"

        entity_map[new_id] = orig["place_id"]

        injected_issues.append({
            "record_id": new_id,
            "table": "places",
            "type": "DUPLICATE",
            "field": "place_id",
            "original_value": orig["place_id"],
            "corrupted_value": new_id,
            "description": f"Duplicate of {orig['place_id']} ({orig['name']})",
        })

        if orig["name"] in PLACE_ALIAS_MAP:
            dup_record["name"] = PLACE_ALIAS_MAP[orig["name"]]
        else:
            dup_record["name"] = _introduce_typo(orig["name"], rng)

        c_places.append(dup_record)

    # 3. Text field typos (~6% of text fields)
    for table_name, records, text_fields in [
        ("people", c_people, ["full_name", "occupation"]),
        ("places", c_places, ["name", "region"]),
        ("events", c_events, ["title", "event_type"]),
    ]:
        for r in records:
            for field in text_fields:
                val = r.get(field)
                if val and isinstance(val, str) and rng.random() < 0.06:
                    corrupted_val = _introduce_typo(val, rng)
                    if corrupted_val != val:
                        r[field] = corrupted_val
                        injected_issues.append({
                            "record_id": r.get(f"{table_name[:-1]}_id") or r.get("person_id") or r.get("place_id") or r.get("event_id"),
                            "table": table_name,
                            "type": "TYPO",
                            "field": field,
                            "original_value": val,
                            "corrupted_value": corrupted_val,
                            "description": f"Typo injected into {field}",
                        })

    # 4. Nulling non-id fields (~8% non-id fields)
    nullable_fields = {
        "people": ["birth_place_id", "gender", "occupation", "dod"],
        "places": ["region"],
        "events": ["place_id", "event_type"],
    }
    for table_name, records in [
        ("people", c_people),
        ("places", c_places),
        ("events", c_events),
    ]:
        id_field = "person_id" if table_name == "people" else ("place_id" if table_name == "places" else "event_id")
        fields_to_null = nullable_fields[table_name]
        for r in records:
            for field in fields_to_null:
                val = r.get(field)
                if val is not None and rng.random() < 0.08:
                    r[field] = None
                    injected_issues.append({
                        "record_id": r[id_field],
                        "table": table_name,
                        "type": "MISSING_FIELD",
                        "field": field,
                        "original_value": val,
                        "corrupted_value": None,
                        "description": f"Nulled field {field}",
                    })

    # 5. Contradictions
    # A) ~4% dod before dob
    num_dod_before_dob = max(2, int(len(c_people) * 0.04))
    people_candidates_for_dod = [
        r for r in c_people
        if r.get("dob") and "-" in str(r["dob"]) and len(str(r["dob"]).split("-")) == 3
    ]
    if len(people_candidates_for_dod) >= num_dod_before_dob:
        dod_corrupted = rng.sample(people_candidates_for_dod, num_dod_before_dob)
        for r in dod_corrupted:
            try:
                dt_dob = datetime.strptime(str(r["dob"]), "%Y-%m-%d")
                corrupt_dod = (dt_dob - timedelta(days=rng.randint(30, 3650))).strftime("%Y-%m-%d")
                orig_dod = r.get("dod")
                r["dod"] = corrupt_dod
                injected_issues.append({
                    "record_id": r["person_id"],
                    "table": "people",
                    "type": "CONTRADICTION_DOD_BEFORE_DOB",
                    "field": "dod",
                    "original_value": orig_dod,
                    "corrupted_value": corrupt_dod,
                    "description": f"Death date ({corrupt_dod}) set before birth date ({r['dob']})",
                })
            except Exception:
                pass

    # B) ~3% parent younger than child
    parent_rels = [r for r in c_relationships if r["rel_type"] == "parent_of"]
    num_younger_parents = max(2, int(len(parent_rels) * 0.03))
    people_dict = {p["person_id"]: p for p in c_people}

    if len(parent_rels) >= num_younger_parents:
        selected_parent_rels = rng.sample(parent_rels, num_younger_parents)
        for rel in selected_parent_rels:
            parent = people_dict.get(rel["from_id"])
            child = people_dict.get(rel["to_id"])
            if parent and child and parent.get("dob") and child.get("dob"):
                try:
                    child_dt = datetime.strptime(str(child["dob"]), "%Y-%m-%d")
                    # Set parent dob to be younger than child (e.g. 5 years after child birth)
                    new_parent_dob = (child_dt + timedelta(days=rng.randint(365, 3650))).strftime("%Y-%m-%d")
                    orig_p_dob = parent["dob"]
                    parent["dob"] = new_parent_dob
                    injected_issues.append({
                        "record_id": parent["person_id"],
                        "table": "people",
                        "type": "CONTRADICTION_PARENT_YOUNGER",
                        "field": "dob",
                        "original_value": orig_p_dob,
                        "corrupted_value": new_parent_dob,
                        "description": f"Parent {parent['person_id']} made younger than child {child['person_id']}",
                    })
                except Exception:
                    pass

    # C) ~1% self-relationships
    num_self_rels = max(2, int(len(c_relationships) * 0.01))
    rels_to_self = rng.sample(c_relationships, num_self_rels)
    for rel in rels_to_self:
        orig_to = rel["to_id"]
        rel["to_id"] = rel["from_id"]
        injected_issues.append({
            "record_id": rel["rel_id"],
            "table": "relationships",
            "type": "CONTRADICTION_SELF_RELATIONSHIP",
            "field": "to_id",
            "original_value": orig_to,
            "corrupted_value": rel["from_id"],
            "description": f"Self relationship created on {rel['rel_id']}",
        })

    # D) ~2% places with conflicting countries
    num_conflicting_places = max(1, int(len(c_places) * 0.02))
    places_to_conflict = rng.sample(c_places, num_conflicting_places)
    for p in places_to_conflict:
        orig_country = p["country"]
        new_country = "Atlantis" if orig_country != "Atlantis" else "Utopia"
        p["country"] = new_country
        injected_issues.append({
            "record_id": p["place_id"],
            "table": "places",
            "type": "CONTRADICTION_PLACE_COUNTRY",
            "field": "country",
            "original_value": orig_country,
            "corrupted_value": new_country,
            "description": f"Conflicting country for {p['name']}",
        })

    # E) ~3% events before a participant's birth
    part_rels = [r for r in c_relationships if r["rel_type"] == "participated_in"]
    events_dict = {e["event_id"]: e for e in c_events}
    num_events_before_birth = max(2, int(len(part_rels) * 0.03))
    if len(part_rels) >= num_events_before_birth:
        selected_part_rels = rng.sample(part_rels, num_events_before_birth)
        for rel in selected_part_rels:
            person = people_dict.get(rel["from_id"])
            event = events_dict.get(rel["to_id"])
            if person and event and person.get("dob") and event.get("date"):
                try:
                    p_dob = datetime.strptime(str(person["dob"]), "%Y-%m-%d")
                    # Set event date to 10-20 years before participant's birth
                    corrupted_event_date = (p_dob - timedelta(days=rng.randint(3650, 7300))).strftime("%Y-%m-%d")
                    orig_event_date = event["date"]
                    event["date"] = corrupted_event_date
                    injected_issues.append({
                        "record_id": event["event_id"],
                        "table": "events",
                        "type": "CONTRADICTION_EVENT_BEFORE_BIRTH",
                        "field": "date",
                        "original_value": orig_event_date,
                        "corrupted_value": corrupted_event_date,
                        "description": f"Event {event['event_id']} date moved before participant {person['person_id']} birth",
                    })
                except Exception:
                    pass

    # Build DataFrames
    corrupted_people_df = pd.DataFrame(c_people, columns=PEOPLE_COLUMNS)
    corrupted_places_df = pd.DataFrame(c_places, columns=PLACES_COLUMNS)
    corrupted_events_df = pd.DataFrame(c_events, columns=EVENTS_COLUMNS)
    corrupted_relationships_df = pd.DataFrame(c_relationships, columns=RELATIONSHIPS_COLUMNS)

    ground_truth = {
        "entity_map": entity_map,
        "injected_issues": injected_issues,
    }

    return (
        corrupted_people_df.copy(),
        corrupted_places_df.copy(),
        corrupted_events_df.copy(),
        corrupted_relationships_df.copy(),
        ground_truth,
    )

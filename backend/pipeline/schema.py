"""
Schema definitions and constants for the Knowledge Repair Tool.
No dependencies on FastAPI or Firebase.
"""

from typing import List, Dict, Any

PEOPLE_COLUMNS: List[str] = [
    "person_id",
    "full_name",
    "dob",
    "dod",
    "birth_place_id",
    "gender",
    "occupation",
    "source_system",
    "last_updated",
]

PLACES_COLUMNS: List[str] = [
    "place_id",
    "name",
    "country",
    "region",
    "source_system",
    "last_updated",
]

EVENTS_COLUMNS: List[str] = [
    "event_id",
    "title",
    "date",
    "place_id",
    "event_type",
    "source_system",
    "last_updated",
]

RELATIONSHIPS_COLUMNS: List[str] = [
    "rel_id",
    "from_id",
    "to_id",
    "rel_type",
    "source_system",
    "last_updated",
]

VALID_REL_TYPES: List[str] = [
    "parent_of",
    "spouse_of",
    "sibling_of",
    "participated_in",
]

TABLE_COLUMNS: Dict[str, List[str]] = {
    "people": PEOPLE_COLUMNS,
    "places": PLACES_COLUMNS,
    "events": EVENTS_COLUMNS,
    "relationships": RELATIONSHIPS_COLUMNS,
}

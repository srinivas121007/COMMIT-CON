"""
Synthetic clean dataset generator.
Produces ~400 people, ~40 real places, ~80 events, ~600 relationships.
Deterministic with seed=42, perfectly consistent logically.
Does not import FastAPI or Firebase. Returns fresh copies of DataFrames.
"""

import random
from datetime import datetime, timedelta
from typing import Dict, Tuple, List, Optional
import pandas as pd
from faker import Faker

from backend.pipeline.schema import (
    PEOPLE_COLUMNS,
    PLACES_COLUMNS,
    EVENTS_COLUMNS,
    RELATIONSHIPS_COLUMNS,
)

# 40 Real places with authentic country and region
REAL_PLACES_DATA = [
    ("New York City", "United States", "New York"),
    ("Los Angeles", "United States", "California"),
    ("Chicago", "United States", "Illinois"),
    ("Houston", "United States", "Texas"),
    ("San Francisco", "United States", "California"),
    ("Boston", "United States", "Massachusetts"),
    ("Seattle", "United States", "Washington"),
    ("Miami", "United States", "Florida"),
    ("London", "United Kingdom", "England"),
    ("Manchester", "United Kingdom", "England"),
    ("Edinburgh", "United Kingdom", "Scotland"),
    ("Paris", "France", "Île-de-France"),
    ("Lyon", "France", "Auvergne-Rhône-Alpes"),
    ("Marseille", "France", "Provence-Alpes-Côte d'Azur"),
    ("Berlin", "Germany", "Berlin"),
    ("Munich", "Germany", "Bavaria"),
    ("Hamburg", "Germany", "Hamburg"),
    ("Rome", "Italy", "Lazio"),
    ("Milan", "Italy", "Lombardy"),
    ("Madrid", "Spain", "Community of Madrid"),
    ("Barcelona", "Spain", "Catalonia"),
    ("Tokyo", "Japan", "Kanto"),
    ("Kyoto", "Japan", "Kansai"),
    ("Osaka", "Japan", "Kansai"),
    ("Toronto", "Canada", "Ontario"),
    ("Vancouver", "Canada", "British Columbia"),
    ("Montreal", "Canada", "Quebec"),
    ("Sydney", "Australia", "New South Wales"),
    ("Melbourne", "Australia", "Victoria"),
    ("Mumbai", "India", "Maharashtra"),
    ("Delhi", "India", "National Capital Region"),
    ("Bengaluru", "India", "Karnataka"),
    ("Singapore", "Singapore", "Central Region"),
    ("Seoul", "South Korea", "Seoul Capital Area"),
    ("Amsterdam", "Netherlands", "North Holland"),
    ("Stockholm", "Sweden", "Stockholm County"),
    ("Zurich", "Switzerland", "Canton of Zurich"),
    ("Vienna", "Austria", "Vienna"),
    ("Dublin", "Ireland", "Leinster"),
    ("Copenhagen", "Denmark", "Capital Region"),
]

OCCUPATIONS = [
    "Software Engineer",
    "Data Scientist",
    "Medical Doctor",
    "Architect",
    "University Professor",
    "Journalist",
    "Biologist",
    "Civil Engineer",
    "Graphic Designer",
    "Accountant",
    "Research Chemist",
    "High School Teacher",
    "Financial Analyst",
    "Historian",
    "Mechanical Engineer",
]

EVENT_TYPES = [
    ("Conference", ["Global Tech Conference", "International AI Symposium", "World Healthcare Forum"]),
    ("Exhibition", ["Contemporary Art Exhibition", "Industrial Design Showcase", "Photography Biennial"]),
    ("Summit", ["Clean Energy Summit", "Urban Planning Summit", "Economic Policy Round-table"]),
    ("Festival", ["International Literature Festival", "Film and Media Festival", "Acoustic Music Festival"]),
    ("Ceremony", ["Annual Science Laureates", "Excellence in Engineering Gala", "Heritage Preservation Awards"]),
]


def _format_date(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")


def _random_timestamp(rng: random.Random, start_year: int = 2021, end_year: int = 2024) -> str:
    start = datetime(start_year, 1, 1)
    end = datetime(end_year, 12, 31)
    delta = (end - start).total_seconds()
    res = start + timedelta(seconds=rng.uniform(0, delta))
    return res.strftime("%Y-%m-%dT%H:%M:%SZ")


def generate_clean_dataset(seed: int = 42) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Generate clean, logically consistent relational datasets:
    - ~400 people
    - ~40 real places
    - ~80 events
    - ~600 relationships
    Returns copies of (people_df, places_df, events_df, relationships_df).
    """
    rng = random.Random(seed)
    fake = Faker()
    Faker.seed(seed)

    # 1. Places (~40)
    places_records = []
    for idx, (p_name, p_country, p_region) in enumerate(REAL_PLACES_DATA):
        place_id = f"PLC_{idx + 1:04d}"
        source_system = rng.choice(["A", "B", "C"])
        last_updated = _random_timestamp(rng)
        places_records.append({
            "place_id": place_id,
            "name": p_name,
            "country": p_country,
            "region": p_region,
            "source_system": source_system,
            "last_updated": last_updated,
        })
    places_df = pd.DataFrame(places_records, columns=PLACES_COLUMNS)

    # 2. People (~400)
    # We will generate people across a realistic age distribution (born 1920 - 2010)
    people_records = []
    num_people = 400
    for idx in range(num_people):
        p_id = f"PER_{idx + 1:04d}"
        gender = "M" if rng.random() < 0.5 else "F"
        if gender == "M":
            first_name = fake.first_name_male()
        else:
            first_name = fake.first_name_female()
        last_name = fake.last_name()
        full_name = f"{first_name} {last_name}"

        # Birth date between 1930 and 2010
        birth_year = rng.randint(1930, 2010)
        birth_month = rng.randint(1, 12)
        birth_day = rng.randint(1, 28)
        dob_dt = datetime(birth_year, birth_month, birth_day)
        dob = _format_date(dob_dt)

        # Deceased? ~35% if born before 1970, otherwise ~5%
        dod = None
        if birth_year < 1970 and rng.random() < 0.40:
            lifespan_years = rng.randint(45, 90)
            dod_dt = dob_dt + timedelta(days=lifespan_years * 365 + rng.randint(0, 300))
            if dod_dt > datetime(2024, 1, 1):
                dod_dt = datetime(2023, 12, 1)
            if dod_dt > dob_dt:
                dod = _format_date(dod_dt)
        elif rng.random() < 0.05:
            lifespan_years = rng.randint(20, 50)
            dod_dt = dob_dt + timedelta(days=lifespan_years * 365 + rng.randint(0, 300))
            if dod_dt > datetime(2024, 1, 1):
                dod_dt = datetime(2023, 12, 1)
            if dod_dt > dob_dt:
                dod = _format_date(dod_dt)

        birth_place = rng.choice(places_records)["place_id"]
        occupation = rng.choice(OCCUPATIONS)
        source_system = rng.choice(["A", "B", "C"])
        last_updated = _random_timestamp(rng)

        people_records.append({
            "person_id": p_id,
            "full_name": full_name,
            "dob": dob,
            "dod": dod,
            "birth_place_id": birth_place,
            "gender": gender,
            "occupation": occupation,
            "source_system": source_system,
            "last_updated": last_updated,
        })
    people_df = pd.DataFrame(people_records, columns=PEOPLE_COLUMNS)

    # 3. Events (~80)
    events_records = []
    num_events = 80
    for idx in range(num_events):
        e_id = f"EVT_{idx + 1:04d}"
        e_cat, names = rng.choice(EVENT_TYPES)
        base_title = rng.choice(names)
        year = rng.randint(1990, 2023)
        month = rng.randint(1, 12)
        day = rng.randint(1, 28)
        event_dt = datetime(year, month, day)
        date_str = _format_date(event_dt)
        title = f"{base_title} {year}"
        place_id = rng.choice(places_records)["place_id"]
        source_system = rng.choice(["A", "B", "C"])
        last_updated = _random_timestamp(rng)

        events_records.append({
            "event_id": e_id,
            "title": title,
            "date": date_str,
            "place_id": place_id,
            "event_type": e_cat,
            "source_system": source_system,
            "last_updated": last_updated,
        })
    events_df = pd.DataFrame(events_records, columns=EVENTS_COLUMNS)

    # 4. Relationships (~600)
    # Types: parent_of, spouse_of, sibling_of, participated_in
    # Rules:
    # - parent_of: parent is 18-50 years older than child. dod > child dob.
    # - spouse_of: spouses born within +/- 15 years, both alive during overlap, no self.
    # - sibling_of: born within +/- 12 years, no self.
    # - participated_in: from_id is person, to_id is event_id, event date > person dob (and < dod if deceased).
    rel_records = []
    rel_counter = 1
    existing_pairs = set()

    # Pre-parse people dates
    people_by_id = {r["person_id"]: r for r in people_records}
    people_ids = [r["person_id"] for r in people_records]
    events_by_id = {r["event_id"]: r for r in events_records}
    event_ids = [r["event_id"] for r in events_records]

    # A) Parent-of relationships (~150)
    for _ in range(300):
        if len([r for r in rel_records if r["rel_type"] == "parent_of"]) >= 150:
            break
        p1_id = rng.choice(people_ids)
        p2_id = rng.choice(people_ids)
        if p1_id == p2_id:
            continue
        p1 = people_by_id[p1_id]
        p2 = people_by_id[p2_id]
        dob1 = datetime.strptime(p1["dob"], "%Y-%m-%d")
        dob2 = datetime.strptime(p2["dob"], "%Y-%m-%d")
        age_diff = (dob2.year - dob1.year)
        if 18 <= age_diff <= 50:
            # Check p1 was alive when p2 was born
            if p1["dod"]:
                dod1 = datetime.strptime(p1["dod"], "%Y-%m-%d")
                if dod1 < dob2:
                    continue
            pair_key = (p1_id, p2_id, "parent_of")
            if pair_key not in existing_pairs:
                existing_pairs.add(pair_key)
                rel_records.append({
                    "rel_id": f"REL_{rel_counter:04d}",
                    "from_id": p1_id,
                    "to_id": p2_id,
                    "rel_type": "parent_of",
                    "source_system": rng.choice(["A", "B", "C"]),
                    "last_updated": _random_timestamp(rng),
                })
                rel_counter += 1

    # B) Spouse-of relationships (~120)
    for _ in range(400):
        if len([r for r in rel_records if r["rel_type"] == "spouse_of"]) >= 120:
            break
        p1_id = rng.choice(people_ids)
        p2_id = rng.choice(people_ids)
        if p1_id == p2_id:
            continue
        p1 = people_by_id[p1_id]
        p2 = people_by_id[p2_id]
        dob1 = datetime.strptime(p1["dob"], "%Y-%m-%d")
        dob2 = datetime.strptime(p2["dob"], "%Y-%m-%d")
        if abs(dob1.year - dob2.year) <= 15:
            # Check life overlap
            dod1 = datetime.strptime(p1["dod"], "%Y-%m-%d") if p1["dod"] else datetime(2099, 1, 1)
            dod2 = datetime.strptime(p2["dod"], "%Y-%m-%d") if p2["dod"] else datetime(2099, 1, 1)
            start_overlap = max(dob1 + timedelta(days=18*365), dob2 + timedelta(days=18*365))
            end_overlap = min(dod1, dod2)
            if start_overlap < end_overlap:
                pair_key1 = (p1_id, p2_id, "spouse_of")
                pair_key2 = (p2_id, p1_id, "spouse_of")
                if pair_key1 not in existing_pairs and pair_key2 not in existing_pairs:
                    existing_pairs.add(pair_key1)
                    rel_records.append({
                        "rel_id": f"REL_{rel_counter:04d}",
                        "from_id": p1_id,
                        "to_id": p2_id,
                        "rel_type": "spouse_of",
                        "source_system": rng.choice(["A", "B", "C"]),
                        "last_updated": _random_timestamp(rng),
                    })
                    rel_counter += 1

    # C) Sibling-of relationships (~100)
    for _ in range(300):
        if len([r for r in rel_records if r["rel_type"] == "sibling_of"]) >= 100:
            break
        p1_id = rng.choice(people_ids)
        p2_id = rng.choice(people_ids)
        if p1_id == p2_id:
            continue
        p1 = people_by_id[p1_id]
        p2 = people_by_id[p2_id]
        dob1 = datetime.strptime(p1["dob"], "%Y-%m-%d")
        dob2 = datetime.strptime(p2["dob"], "%Y-%m-%d")
        if abs(dob1.year - dob2.year) <= 12:
            pair_key1 = (p1_id, p2_id, "sibling_of")
            pair_key2 = (p2_id, p1_id, "sibling_of")
            if pair_key1 not in existing_pairs and pair_key2 not in existing_pairs:
                existing_pairs.add(pair_key1)
                rel_records.append({
                    "rel_id": f"REL_{rel_counter:04d}",
                    "from_id": p1_id,
                    "to_id": p2_id,
                    "rel_type": "sibling_of",
                    "source_system": rng.choice(["A", "B", "C"]),
                    "last_updated": _random_timestamp(rng),
                })
                rel_counter += 1

    # D) Participated-in relationships (~230 to reach ~600 total)
    for _ in range(600):
        if len(rel_records) >= 600:
            break
        p_id = rng.choice(people_ids)
        e_id = rng.choice(event_ids)
        p = people_by_id[p_id]
        ev = events_by_id[e_id]
        dob_p = datetime.strptime(p["dob"], "%Y-%m-%d")
        ev_dt = datetime.strptime(ev["date"], "%Y-%m-%d")
        dod_p = datetime.strptime(p["dod"], "%Y-%m-%d") if p["dod"] else datetime(2099, 1, 1)

        # Person must be at least 5 years old at event, and alive
        if dob_p + timedelta(days=5*365) <= ev_dt <= dod_p:
            pair_key = (p_id, e_id, "participated_in")
            if pair_key not in existing_pairs:
                existing_pairs.add(pair_key)
                rel_records.append({
                    "rel_id": f"REL_{rel_counter:04d}",
                    "from_id": p_id,
                    "to_id": e_id,
                    "rel_type": "participated_in",
                    "source_system": rng.choice(["A", "B", "C"]),
                    "last_updated": _random_timestamp(rng),
                })
                rel_counter += 1

    relationships_df = pd.DataFrame(rel_records, columns=RELATIONSHIPS_COLUMNS)

    return (
        people_df.copy(),
        places_df.copy(),
        events_df.copy(),
        relationships_df.copy(),
    )

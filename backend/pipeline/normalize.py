"""
Normalization module.
Computes norm_* columns:
- lowercase, trim, strip accents and punctuation
- parse dates to ISO format YYYY-MM-DD (flag ambiguous ones)
- nickname dictionary (40+ entries)
- place alias dictionary (15+ entries)
Does not import FastAPI or Firebase. Always copies input DataFrames.
"""

import re
import unicodedata
from datetime import datetime
from typing import Dict, Tuple, Optional, Any
import pandas as pd

# Nickname dictionary with 40+ entries mapping nickname to canonical first name
NICKNAME_DICT: Dict[str, str] = {
    "bob": "robert",
    "bobby": "robert",
    "rob": "robert",
    "robbie": "robert",
    "bill": "william",
    "billy": "william",
    "will": "william",
    "willy": "william",
    "liam": "william",
    "dick": "richard",
    "rick": "richard",
    "rich": "richard",
    "ricky": "richard",
    "jim": "james",
    "jimmy": "james",
    "jamie": "james",
    "tom": "thomas",
    "tommy": "thomas",
    "charlie": "charles",
    "chuck": "charles",
    "liz": "elizabeth",
    "lizzie": "elizabeth",
    "beth": "elizabeth",
    "betty": "elizabeth",
    "maggie": "margaret",
    "peggy": "margaret",
    "meg": "margaret",
    "jen": "jennifer",
    "jenny": "jennifer",
    "kate": "katherine",
    "katie": "katherine",
    "kathy": "katherine",
    "mike": "michael",
    "mikey": "michael",
    "chris": "christopher",
    "dave": "david",
    "davey": "david",
    "dan": "daniel",
    "danny": "daniel",
    "matt": "matthew",
    "matty": "matthew",
    "tony": "anthony",
    "don": "donald",
    "donny": "donald",
    "alex": "alexander",
    "al": "alexander",
    "joe": "joseph",
    "joey": "joseph",
    "ben": "benjamin",
    "benny": "benjamin",
    "ted": "edward",
    "teddy": "edward",
    "ned": "edward",
    "sam": "samuel",
    "sammy": "samuel",
    "pete": "peter",
    "andy": "andrew",
    "steve": "stephen",
}

# Place alias dictionary with 18+ entries mapping alias to canonical place/country name
PLACE_ALIAS_DICT: Dict[str, str] = {
    "nyc": "new york city",
    "new york": "new york city",
    "ny": "new york city",
    "la": "los angeles",
    "l.a.": "los angeles",
    "sf": "san francisco",
    "san fran": "san francisco",
    "frisco": "san francisco",
    "dc": "washington dc",
    "washington d.c.": "washington dc",
    "bombay": "mumbai",
    "calcutta": "kolkata",
    "bangalore": "bengaluru",
    "madras": "chennai",
    "usa": "united states",
    "us": "united states",
    "u.s.": "united states",
    "u.s.a.": "united states",
    "united states of america": "united states",
    "uk": "united kingdom",
    "u.k.": "united kingdom",
    "britain": "united kingdom",
    "great britain": "united kingdom",
}


def strip_accents(text: str) -> str:
    """Strip accents and diacritics from unicode string."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(text))
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def clean_text(text: Optional[str]) -> str:
    """Lowercase, trim, strip accents and non-alphanumeric punctuation."""
    if text is None or pd.isna(text):
        return ""
    s = strip_accents(str(text)).lower().strip()
    # Replace multiple spaces/punctuation with clean space
    s = re.sub(r"[^\w\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_and_normalize_date(date_val: Any) -> Tuple[Optional[str], bool]:
    """
    Parse a date value into ISO YYYY-MM-DD.
    Returns (iso_date_str, is_ambiguous).
    Flags ambiguous dates where day <= 12 and month <= 12 in slash/dash formats.
    """
    if date_val is None or pd.isna(date_val):
        return None, False

    s = str(date_val).strip()
    if not s or s.lower() in ("nan", "none", "null", "nat"):
        return None, False

    # Check already ISO: YYYY-MM-DD
    iso_match = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if iso_match:
        y, m, d = int(iso_match.group(1)), int(iso_match.group(2)), int(iso_match.group(3))
        try:
            dt = datetime(y, m, d)
            return dt.strftime("%Y-%m-%d"), False
        except ValueError:
            return None, False

    # Check formats with separators
    # Could be YYYY/MM/DD, MM/DD/YYYY, DD/MM/YYYY, MM-DD-YYYY, DD-MM-YYYY
    parts = re.split(r"[-/.]", s)
    if len(parts) == 3:
        p0, p1, p2 = parts[0].strip(), parts[1].strip(), parts[2].strip()
        if p0.isdigit() and p1.isdigit() and p2.isdigit():
            # If p0 is 4 digits -> Year first: YYYY/MM/DD or YYYY/DD/MM
            if len(p0) == 4:
                y = int(p0)
                m_candidate, d_candidate = int(p1), int(p2)
                try:
                    dt = datetime(y, m_candidate, d_candidate)
                    ambig = (1 <= m_candidate <= 12 and 1 <= d_candidate <= 12 and m_candidate != d_candidate)
                    return dt.strftime("%Y-%m-%d"), ambig
                except ValueError:
                    try:
                        dt = datetime(y, d_candidate, m_candidate)
                        return dt.strftime("%Y-%m-%d"), True
                    except ValueError:
                        return None, False

            # If p2 is 4 digits -> Year last: MM/DD/YYYY or DD/MM/YYYY
            if len(p2) == 4:
                y = int(p2)
                v1, v2 = int(p0), int(p1)
                # If v1 > 12 -> must be DD/MM/YYYY
                if v1 > 12 and 1 <= v2 <= 12:
                    try:
                        return datetime(y, v2, v1).strftime("%Y-%m-%d"), False
                    except ValueError:
                        return None, False
                # If v2 > 12 -> must be MM/DD/YYYY
                elif v2 > 12 and 1 <= v1 <= 12:
                    try:
                        return datetime(y, v1, v2).strftime("%Y-%m-%d"), False
                    except ValueError:
                        return None, False
                elif 1 <= v1 <= 12 and 1 <= v2 <= 12:
                    # Ambiguous! Default to MM/DD/YYYY (US standard) but flag ambiguous
                    try:
                        return datetime(y, v1, v2).strftime("%Y-%m-%d"), True
                    except ValueError:
                        return None, False

    # Try fallback date parsing
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y", "%m-%d-%Y"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%Y-%m-%d"), False
        except ValueError:
            pass

    return None, False


def normalize_person_name(name_str: Optional[str]) -> Tuple[str, str, str]:
    """
    Normalizes a person full name:
    Returns (norm_full_name, norm_first_name, norm_last_name).
    Handles 'Last, First' swapped order, applies nickname normalization.
    """
    if name_str is None or pd.isna(name_str):
        return "", "", ""

    raw = strip_accents(str(name_str)).lower().strip()
    
    # Handle comma: "Smith, John" -> first is "john", last is "smith"
    if "," in raw:
        parts = [p.strip() for p in raw.split(",", 1)]
        last_name_cand = parts[0]
        first_name_cand = parts[1]
    else:
        tokens = raw.split()
        if len(tokens) == 0:
            return "", "", ""
        elif len(tokens) == 1:
            first_name_cand = tokens[0]
            last_name_cand = ""
        else:
            first_name_cand = tokens[0]
            last_name_cand = tokens[-1]

    # Clean punctuation
    first_clean = re.sub(r"[^\w]", "", first_name_cand)
    last_clean = re.sub(r"[^\w]", "", last_name_cand)

    # Check nickname substitution
    canonical_first = NICKNAME_DICT.get(first_clean, first_clean)

    if last_clean:
        norm_full = f"{canonical_first} {last_clean}"
    else:
        norm_full = canonical_first

    return norm_full, canonical_first, last_clean


def normalize_place_name(place_str: Optional[str]) -> str:
    """Normalizes place or country name using alias dictionary."""
    clean = clean_text(place_str)
    return PLACE_ALIAS_DICT.get(clean, clean)


def normalize_datasets(
    people_df: pd.DataFrame,
    places_df: pd.DataFrame,
    events_df: pd.DataFrame,
    relationships_df: pd.DataFrame,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Computes and adds norm_* columns to copies of the datasets.
    """
    p_df = people_df.copy()
    pl_df = places_df.copy()
    e_df = events_df.copy()
    r_df = relationships_df.copy()

    # People normalization
    if "full_name" in p_df.columns:
        norm_full_names = []
        norm_first_names = []
        norm_last_names = []
        norm_dobs = []
        dob_ambiguous_flags = []
        norm_dods = []
        norm_occupations = []
        norm_birth_places = []
        norm_genders = []

        for _, row in p_df.iterrows():
            nf, nfirst, nlast = normalize_person_name(row.get("full_name"))
            norm_full_names.append(nf)
            norm_first_names.append(nfirst)
            norm_last_names.append(nlast)

            ndob, amb_dob = parse_and_normalize_date(row.get("dob"))
            norm_dobs.append(ndob)
            dob_ambiguous_flags.append(amb_dob)

            ndod, _ = parse_and_normalize_date(row.get("dod"))
            norm_dods.append(ndod)

            norm_occupations.append(clean_text(row.get("occupation")))
            norm_birth_places.append(clean_text(row.get("birth_place_id")))
            
            g = str(row.get("gender") or "").strip().lower()
            if g.startswith("m"):
                norm_genders.append("m")
            elif g.startswith("f"):
                norm_genders.append("f")
            else:
                norm_genders.append("")

        p_df["norm_full_name"] = norm_full_names
        p_df["norm_first_name"] = norm_first_names
        p_df["norm_last_name"] = norm_last_names
        p_df["norm_dob"] = norm_dobs
        p_df["norm_dob_ambiguous"] = dob_ambiguous_flags
        p_df["norm_dod"] = norm_dods
        p_df["norm_occupation"] = norm_occupations
        p_df["norm_birth_place_id"] = norm_birth_places
        p_df["norm_gender"] = norm_genders

    # Places normalization
    if "name" in pl_df.columns:
        pl_df["norm_name"] = [normalize_place_name(x) for x in pl_df["name"]]
    if "country" in pl_df.columns:
        pl_df["norm_country"] = [normalize_place_name(x) for x in pl_df["country"]]
    if "region" in pl_df.columns:
        pl_df["norm_region"] = [clean_text(x) for x in pl_df["region"]]

    # Events normalization
    if "title" in e_df.columns:
        e_df["norm_title"] = [clean_text(x) for x in e_df["title"]]
    if "date" in e_df.columns:
        e_dates = []
        e_ambs = []
        for d in e_df["date"]:
            nd, amb = parse_and_normalize_date(d)
            e_dates.append(nd)
            e_ambs.append(amb)
        e_df["norm_date"] = e_dates
        e_df["norm_date_ambiguous"] = e_ambs
    if "event_type" in e_df.columns:
        e_df["norm_event_type"] = [clean_text(x) for x in e_df["event_type"]]
    if "place_id" in e_df.columns:
        e_df["norm_place_id"] = [clean_text(x) for x in e_df["place_id"]]

    # Relationships normalization
    if "rel_type" in r_df.columns:
        r_df["norm_rel_type"] = [clean_text(x) for x in r_df["rel_type"]]
    if "from_id" in r_df.columns:
        r_df["norm_from_id"] = [clean_text(x) for x in r_df["from_id"]]
    if "to_id" in r_df.columns:
        r_df["norm_to_id"] = [clean_text(x) for x in r_df["to_id"]]

    return p_df, pl_df, e_df, r_df

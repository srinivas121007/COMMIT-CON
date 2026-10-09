/**
 * Knowledge Repair Tool - Dataset Generator & Ground Truth Engine
 * 
 * Generates:
 * 1. Clean Ground Truth dataset (~150 people, ~40 places, ~60 events + relationships)
 * 2. Corrupted Dataset with controlled, injected corruptions (duplicates, typos, missing values, contradictions)
 * 3. Ground Truth Ledger (registry of all injected mutations for exact precision/recall scoring)
 * 4. JSON / CSV export and import helpers.
 */

// Place templates (40 diverse locations)
const PLACE_TEMPLATES = [
  { name: "London", country: "United Kingdom", founded_year: 47 },
  { name: "New York", country: "United States", founded_year: 1624 },
  { name: "Paris", country: "France", founded_year: -250 },
  { name: "Berlin", country: "Germany", founded_year: 1237 },
  { name: "Tokyo", country: "Japan", founded_year: 1457 },
  { name: "Edinburgh", country: "United Kingdom", founded_year: 1128 },
  { name: "Cambridge", country: "United Kingdom", founded_year: 1209 },
  { name: "Vienna", country: "Austria", founded_year: 1137 },
  { name: "Rome", country: "Italy", founded_year: -753 },
  { name: "Boston", country: "United States", founded_year: 1630 },
  { name: "Zurich", country: "Switzerland", founded_year: -15 },
  { name: "Oxford", country: "United Kingdom", founded_year: 1096 },
  { name: "Chicago", country: "United States", founded_year: 1833 },
  { name: "Geneva", country: "Switzerland", founded_year: -121 },
  { name: "Stockholm", country: "Sweden", founded_year: 1252 },
  { name: "Amsterdam", country: "Netherlands", founded_year: 1275 },
  { name: "Prague", country: "Czech Republic", founded_year: 880 },
  { name: "Copenhagen", country: "Denmark", founded_year: 1167 },
  { name: "Dublin", country: "Ireland", founded_year: 988 },
  { name: "San Francisco", country: "United States", founded_year: 1776 },
  { name: "Toronto", country: "Canada", founded_year: 1793 },
  { name: "Sydney", country: "Australia", founded_year: 1788 },
  { name: "Philadelphia", country: "United States", founded_year: 1682 },
  { name: "Kyoto", country: "Japan", founded_year: 794 },
  { name: "Munich", country: "Germany", founded_year: 1158 },
  { name: "Manchester", country: "United Kingdom", founded_year: 79 },
  { name: "Brussels", country: "Belgium", founded_year: 979 },
  { name: "Warsaw", country: "Poland", founded_year: 1300 },
  { name: "Milan", country: "Italy", founded_year: -590 },
  { name: "Madrid", country: "Spain", founded_year: 865 },
  { name: "Barcelona", country: "Spain", founded_year: -230 },
  { name: "Athens", country: "Greece", founded_year: -3000 },
  { name: "Cairo", country: "Egypt", founded_year: 969 },
  { name: "Seoul", country: "South Korea", founded_year: -18 },
  { name: "Melbourne", country: "Australia", founded_year: 1835 },
  { name: "Helsinki", country: "Finland", founded_year: 1550 },
  { name: "Oslo", country: "Norway", founded_year: 1040 },
  { name: "Lisbon", country: "Portugal", founded_year: -1200 },
  { name: "Montreal", country: "Canada", founded_year: 1642 },
  { name: "Budapest", country: "Hungary", founded_year: 1873 }
];

// Historical person archetypes & name generation components
const FIRST_NAMES = [
  "Ada", "Alan", "Grace", "Charles", "Marie", "Nikola", "Albert", "Katherine", "Isaac", "Rosalind",
  "Johannes", "Margaret", "Alexander", "Dorothy", "Emmy", "George", "Enrico", "Lise", "Niels", "Barbara",
  "Claude", "John", "Richard", "Hedy", "Carl", "Henrietta", "Max", "Rachel", "Stephen", "Jane",
  "Robert", "Mary", "David", "Elizabeth", "Thomas", "Sarah", "William", "Anna", "James", "Emily",
  "Arthur", "Alice", "Edward", "Florence", "Henry", "Helen", "Joseph", "Clara", "Samuel", "Laura"
];

const LAST_NAMES = [
  "Lovelace", "Turing", "Hopper", "Babbage", "Curie", "Tesla", "Einstein", "Johnson", "Newton", "Franklin",
  "Kepler", "Hamilton", "Fleming", "Hodgkin", "Noether", "Boole", "Fermi", "Meitner", "Bohr", "McClintock",
  "Shannon", "Von Neumann", "Feynman", "Lamarr", "Sagan", "Leavitt", "Planck", "Carson", "Hawking", "Goodall",
  "Oppenheimer", "Anning", "Hilbert", "Blackwell", "Edison", "Mitchell", "Maxwell", "Somerville", "Galileo", "Wu",
  "Rutherford", "Burnell", "Pasteur", "Nightingale", "Darwin", "Keller", "Priestley", "Barton", "Morse", "Vaughan"
];

const OCCUPATIONS = [
  "Mathematician", "Computer Scientist", "Physicist", "Chemist", "Astronomer",
  "Biologist", "Engineer", "Philosopher", "Geneticist", "Logician",
  "Historian", "Cryptographer", "Archivist", "Geologist", "Physician"
];

// Event title templates
const EVENT_NAMES = [
  "Solvay Physics Council", "Royal Society Colloquium", "International Math Congress",
  "Computing Machinery Symposium", "Cybernetics Forum", "Quantum Mechanics Summit",
  "Philosophical Society Meeting", "World Science Exposition", "Astronomical Union Assembly",
  "Genetics Research Conference", "Biochemical Congress", "Historical Archives Convocation",
  "Telegraphy Conference", "Atomic Energy Symposium", "Deep Space Colloquium"
];

/**
 * Seeded pseudo-random number generator for reproducibility
 */
function createRng(seed = 123456789) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Formats date as ISO YYYY-MM-DD
 */
function formatDate(year, month, day) {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Generates the Clean Ground Truth Dataset
 */
export function generateCleanDataset(seed = 42) {
  const rng = createRng(seed);

  // 1. Generate Places (~40 places)
  const places = PLACE_TEMPLATES.map((tmpl, idx) => {
    const id = `place_${String(idx + 1).padStart(3, "0")}`;
    return {
      id,
      type: "place",
      attributes: {
        name: tmpl.name,
        country: tmpl.country,
        founded_year: tmpl.founded_year
      },
      relationships: [],
      source: "World_Gazetteer_1980"
    };
  });

  // 2. Generate People (~150 people)
  const people = [];
  const usedNames = new Set();

  for (let i = 1; i <= 150; i++) {
    const id = `person_${String(i).padStart(3, "0")}`;
    let firstName, lastName, fullName;
    let attempts = 0;
    do {
      firstName = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
      lastName = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
      fullName = `${firstName} ${lastName}`;
      attempts++;
    } while (usedNames.has(fullName) && attempts < 50);

    usedNames.add(fullName);

    const birthYear = 1800 + Math.floor(rng() * 160); // 1800 to 1960
    const birthMonth = 1 + Math.floor(rng() * 12);
    const birthDay = 1 + Math.floor(rng() * 28);
    const birthDate = formatDate(birthYear, birthMonth, birthDay);

    const lifespan = 45 + Math.floor(rng() * 45); // 45 to 90 years
    const deathYear = birthYear + lifespan;
    const isDeceased = deathYear < 2024;
    const deathDate = isDeceased ? formatDate(deathYear, 1 + Math.floor(rng() * 12), 1 + Math.floor(rng() * 28)) : null;

    const birthPlaceObj = places[Math.floor(rng() * places.length)];
    const birthPlace = birthPlaceObj.attributes.name;
    const occupation = OCCUPATIONS[Math.floor(rng() * OCCUPATIONS.length)];

    const person = {
      id,
      type: "person",
      attributes: {
        name: fullName,
        birth_date: birthDate,
        death_date: deathDate,
        birth_place: birthPlace,
        occupation: occupation
      },
      relationships: [
        { type: "born_in", targetId: birthPlaceObj.id }
      ],
      source: "National_Biographical_Registry"
    };

    people.push(person);
  }

  // Interlink People relationships: spouse_of, parent_of, lived_in
  for (let i = 0; i < people.length - 1; i += 2) {
    if (rng() > 0.4) {
      const p1 = people[i];
      const p2 = people[i + 1];
      p1.relationships.push({ type: "spouse_of", targetId: p2.id });
      p2.relationships.push({ type: "spouse_of", targetId: p1.id });
    }
  }

  // Parent-child relationships (ensure strictly acyclic and age-appropriate)
  for (let i = 0; i < 40; i++) {
    const parentIdx = Math.floor(rng() * 70); // older cohort
    const childIdx = 70 + Math.floor(rng() * 70); // younger cohort
    const parent = people[parentIdx];
    const child = people[childIdx];

    const parentYear = parseInt(parent.attributes.birth_date.split("-")[0], 10);
    const childYear = parseInt(child.attributes.birth_date.split("-")[0], 10);

    if (childYear - parentYear >= 18) {
      parent.relationships.push({ type: "parent_of", targetId: child.id });
    }
  }

  // Lived-in relationships
  for (const person of people) {
    if (rng() > 0.5) {
      const randomPlace = places[Math.floor(rng() * places.length)];
      person.relationships.push({ type: "lived_in", targetId: randomPlace.id });
    }
  }

  // 3. Generate Events (~60 events)
  const events = [];
  for (let i = 1; i <= 60; i++) {
    const id = `event_${String(i).padStart(3, "0")}`;
    const baseName = EVENT_NAMES[Math.floor(rng() * EVENT_NAMES.length)];
    const year = 1880 + Math.floor(rng() * 110); // 1880 - 1990
    const month = 1 + Math.floor(rng() * 12);
    const day = 1 + Math.floor(rng() * 28);
    const eventDate = formatDate(year, month, day);
    const place = places[Math.floor(rng() * places.length)];

    const event = {
      id,
      type: "event",
      attributes: {
        name: `${baseName} ${year}`,
        date: eventDate,
        location: place.attributes.name
      },
      relationships: [
        { type: "held_in", targetId: place.id }
      ],
      source: "Scientific_Conferences_Index"
    };

    events.push(event);
  }

  // Add event attendees
  for (const event of events) {
    const eventYear = parseInt(event.attributes.date.split("-")[0], 10);
    // Find people alive during this event
    const eligiblePeople = people.filter(p => {
      const bYear = parseInt(p.attributes.birth_date.split("-")[0], 10);
      const dYear = p.attributes.death_date ? parseInt(p.attributes.death_date.split("-")[0], 10) : 2024;
      return bYear <= eventYear - 16 && dYear >= eventYear;
    });

    const attendeeCount = Math.min(eligiblePeople.length, 2 + Math.floor(rng() * 4));
    for (let k = 0; k < attendeeCount; k++) {
      const attendee = eligiblePeople[Math.floor(rng() * eligiblePeople.length)];
      if (!attendee.relationships.some(r => r.type === "attended" && r.targetId === event.id)) {
        attendee.relationships.push({ type: "attended", targetId: event.id });
      }
    }
  }

  return { people, places, events };
}

/**
 * Deep clones object
 */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Generates Corrupted Dataset with a Ground Truth mutation registry
 */
export function generateCorruptedDataset(cleanData, seed = 99) {
  const rng = createRng(seed);

  const corruptedPeople = clone(cleanData.people);
  const corruptedPlaces = clone(cleanData.places);
  const corruptedEvents = clone(cleanData.events);

  const groundTruthMutations = [];
  let mutationCounter = 1;

  function recordMutation(category, severity, details) {
    const mut = {
      mutationId: `mut_${String(mutationCounter++).padStart(3, "0")}`,
      category, // 'duplicate' | 'typo' | 'missing' | 'contradiction'
      severity, // 'critical' | 'warning' | 'info'
      ...details
    };
    groundTruthMutations.push(mut);
    return mut;
  }

  // ==========================================
  // 1. INJECT DUPLICATES (18 duplicate pairs)
  // ==========================================
  const duplicateCandidates = corruptedPeople.slice(0, 18);
  for (let i = 0; i < duplicateCandidates.length; i++) {
    const original = duplicateCandidates[i];
    const dupId = `${original.id}_dup`;
    const origName = original.attributes.name;
    const [first, ...rest] = origName.split(" ");
    const last = rest.join(" ");

    let variantName = origName;
    let strategy = "";

    if (i % 4 === 0) {
      // Phonetic typo in last name (e.g. Smith -> Smyth)
      variantName = `${first} ${last.replace(/i/g, "y").replace(/e$/, "")}`;
      strategy = "Phonetic surname misspelling";
    } else if (i % 4 === 1) {
      // Nickname variation
      const nicknames = {
        Alan: "Al", Robert: "Bob", William: "Bill", Katherine: "Kathy",
        Elizabeth: "Beth", James: "Jim", Thomas: "Tom", Edward: "Ed",
        Charles: "Charlie", Margaret: "Peggy"
      };
      const nick = nicknames[first] || `${first[0]}.`;
      variantName = `${nick} ${last}`;
      strategy = "Nickname / Abbreviated first name";
    } else if (i % 4 === 2) {
      // Initial variant
      variantName = `${first[0]}. ${last}`;
      strategy = "First initial variant";
    } else {
      // Transposed letter typo
      if (last.length > 3) {
        const arr = last.split("");
        const tmp = arr[1]; arr[1] = arr[2]; arr[2] = tmp;
        variantName = `${first} ${arr.join("")}`;
      } else {
        variantName = `${first} ${last}e`;
      }
      strategy = "Character transposition typo";
    }

    const dupRecord = {
      id: dupId,
      type: "person",
      attributes: {
        name: variantName,
        birth_date: original.attributes.birth_date,
        death_date: original.attributes.death_date,
        birth_place: original.attributes.birth_place,
        occupation: original.attributes.occupation
      },
      relationships: clone(original.relationships),
      source: "County_Census_Records_1910"
    };

    // Sometimes duplicate has one missing field to test imputation
    if (i % 2 === 0) {
      dupRecord.attributes.occupation = null;
    } else {
      original.attributes.birth_place = null;
    }

    corruptedPeople.push(dupRecord);

    recordMutation("duplicate", "critical", {
      originalId: original.id,
      duplicateId: dupId,
      canonicalId: original.id,
      originalName: origName,
      duplicateName: variantName,
      strategy,
      expectedAction: "merge_records",
      description: `Duplicate entity pair created with strategy: ${strategy}`
    });
  }

  // ==========================================
  // 2. INJECT TYPOS & FORMATTING INCONSISTENCIES (36 instances)
  // ==========================================
  for (let i = 20; i < 56; i++) {
    const target = corruptedPeople[i];
    const fieldType = i % 4;

    if (fieldType === 0) {
      // Lowercase or uppercase name
      const oldVal = target.attributes.name;
      target.attributes.name = (i % 2 === 0) ? oldVal.toLowerCase() : oldVal.toUpperCase();
      recordMutation("typo", "warning", {
        recordId: target.id,
        field: "attributes.name",
        oldValue: oldVal,
        corruptedValue: target.attributes.name,
        expectedValue: oldVal,
        rule: "NORMALIZE_CASE",
        description: "Inconsistent string case formatting in name"
      });
    } else if (fieldType === 1) {
      // Whitespace padding
      const oldVal = target.attributes.name;
      target.attributes.name = `   ${oldVal}   `;
      recordMutation("typo", "info", {
        recordId: target.id,
        field: "attributes.name",
        oldValue: oldVal,
        corruptedValue: target.attributes.name,
        expectedValue: oldVal,
        rule: "TRIM_WHITESPACE",
        description: "Leading and trailing whitespace padding"
      });
    } else if (fieldType === 2) {
      // Date format variations: YYYY/MM/DD or DD-MM-YYYY
      const oldVal = target.attributes.birth_date;
      if (oldVal) {
        const parts = oldVal.split("-");
        const corruptDate = (i % 2 === 0) ? `${parts[0]}/${parts[1]}/${parts[2]}` : `${parts[2]}-${parts[1]}-${parts[0]}`;
        target.attributes.birth_date = corruptDate;
        recordMutation("typo", "warning", {
          recordId: target.id,
          field: "attributes.birth_date",
          oldValue: oldVal,
          corruptedValue: corruptDate,
          expectedValue: oldVal,
          rule: "ISO_DATE_FORMAT",
          description: "Non-standard date format representation"
        });
      }
    } else {
      // Non-standard place spelling
      const oldVal = target.attributes.birth_place;
      const placeAliases = {
        "New York": "NYC",
        "London": "Lon, UK",
        "Paris": "Paris, FR",
        "Vienna": "Wien",
        "Tokyo": "Tokyo-to",
        "Edinburgh": "Edin."
      };
      if (oldVal && placeAliases[oldVal]) {
        target.attributes.birth_place = placeAliases[oldVal];
        recordMutation("typo", "warning", {
          recordId: target.id,
          field: "attributes.birth_place",
          oldValue: oldVal,
          corruptedValue: target.attributes.birth_place,
          expectedValue: oldVal,
          rule: "STANDARDIZE_PLACE_NAME",
          description: "Colloquial abbreviation or regional place alias"
        });
      }
    }
  }

  // ==========================================
  // 3. INJECT MISSING VALUES (30 instances)
  // ==========================================
  for (let i = 56; i < 86; i++) {
    const target = corruptedPeople[i];
    const fieldChoice = i % 3;

    if (fieldChoice === 0 && target.attributes.birth_place) {
      const oldVal = target.attributes.birth_place;
      target.attributes.birth_place = null;
      recordMutation("missing", "warning", {
        recordId: target.id,
        field: "attributes.birth_place",
        oldValue: oldVal,
        corruptedValue: null,
        expectedValue: oldVal,
        rule: "MISSING_ATTRIBUTE",
        description: "Missing birth_place attribute"
      });
    } else if (fieldChoice === 1 && target.attributes.occupation) {
      const oldVal = target.attributes.occupation;
      target.attributes.occupation = null;
      recordMutation("missing", "info", {
        recordId: target.id,
        field: "attributes.occupation",
        oldValue: oldVal,
        corruptedValue: null,
        expectedValue: oldVal,
        rule: "MISSING_ATTRIBUTE",
        description: "Missing occupation attribute"
      });
    } else if (fieldChoice === 2 && target.attributes.death_date) {
      const oldVal = target.attributes.death_date;
      target.attributes.death_date = null;
      recordMutation("missing", "warning", {
        recordId: target.id,
        field: "attributes.death_date",
        oldValue: oldVal,
        corruptedValue: null,
        expectedValue: oldVal,
        rule: "MISSING_ATTRIBUTE",
        description: "Missing death_date attribute"
      });
    }
  }

  // ==========================================
  // 4. INJECT CONTRADICTIONS (12 logical flaws)
  // ==========================================
  // Contradiction 1-3: Death date before birth date
  for (let i = 88; i <= 90; i++) {
    const target = corruptedPeople[i];
    const originalBirth = target.attributes.birth_date;
    const bYear = parseInt(originalBirth.split("-")[0], 10);
    const corruptedDeath = `${bYear - 15}-05-12`; // Died 15 years BEFORE born!
    target.attributes.death_date = corruptedDeath;
    recordMutation("contradiction", "critical", {
      recordId: target.id,
      rule: "DEATH_BEFORE_BIRTH",
      field: "attributes.death_date",
      birthDate: target.attributes.birth_date,
      corruptedDeathDate: corruptedDeath,
      expectedAction: "resolve_or_flag_manual",
      description: `Chronological violation: Death date (${corruptedDeath}) precedes birth date (${target.attributes.birth_date})`
    });
  }

  // Contradiction 4-6: Impossible age (> 125 years old)
  for (let i = 92; i <= 94; i++) {
    const target = corruptedPeople[i];
    const bYear = parseInt(target.attributes.birth_date.split("-")[0], 10);
    const corruptedDeath = `${bYear + 185}-01-01`; // Lived 185 years!
    target.attributes.death_date = corruptedDeath;
    recordMutation("contradiction", "critical", {
      recordId: target.id,
      rule: "IMPOSSIBLE_AGE",
      field: "attributes.death_date",
      birthDate: target.attributes.birth_date,
      corruptedDeathDate: corruptedDeath,
      expectedAction: "resolve_or_flag_manual",
      description: `Biological impossibility: Calculated lifespan exceeds 125 years (${185} years)`
    });
  }

  // Contradiction 7-9: Circular parentage (A is parent of B, B is parent of A)
  for (let i = 96; i <= 98; i++) {
    const pA = corruptedPeople[i];
    const pB = corruptedPeople[i + 10];
    // Add cycle
    pA.relationships = pA.relationships.filter(r => r.type !== "parent_of");
    pB.relationships = pB.relationships.filter(r => r.type !== "parent_of");
    pA.relationships.push({ type: "parent_of", targetId: pB.id });
    pB.relationships.push({ type: "parent_of", targetId: pA.id });
    recordMutation("contradiction", "critical", {
      recordId: pA.id,
      relatedRecordId: pB.id,
      rule: "CIRCULAR_PARENTAGE",
      expectedAction: "break_cycle_or_flag",
      description: `Genealogical cycle detected: ${pA.id} is parent of ${pB.id} and ${pB.id} is parent of ${pA.id}`
    });
  }

  // Contradiction 10-12: Spatiotemporal impossibility (attended 2 distinct events in different cities on same date)
  for (let i = 100; i <= 102; i++) {
    const person = corruptedPeople[i];
    const ev1 = corruptedEvents[0]; // e.g. London
    const ev2 = corruptedEvents[1]; // e.g. Tokyo
    // Set both events to the exact same date
    const clashDate = "1927-10-24";
    ev1.attributes.date = clashDate;
    ev2.attributes.date = clashDate;
    ev1.attributes.location = "London";
    ev2.attributes.location = "Tokyo";

    // Link person to both
    person.relationships.push({ type: "attended", targetId: ev1.id });
    person.relationships.push({ type: "attended", targetId: ev2.id });

    recordMutation("contradiction", "critical", {
      recordId: person.id,
      rule: "SPATIOTEMPORAL_COLLISION",
      event1: ev1.id,
      event2: ev2.id,
      clashDate,
      locations: ["London", "Tokyo"],
      expectedAction: "flag_manual_review",
      description: `Person attended two geographically distant events (London and Tokyo) on the exact same date (${clashDate})`
    });
  }

  // Assemble full records array
  const allRecords = [
    ...corruptedPeople,
    ...corruptedPlaces,
    ...corruptedEvents
  ];

  return {
    records: allRecords,
    people: corruptedPeople,
    places: corruptedPlaces,
    events: corruptedEvents,
    groundTruthMutations
  };
}

/**
 * Generates both clean and corrupted datasets and returns the package
 */
export function createDatasetPackage(seed = 42) {
  const clean = generateCleanDataset(seed);
  const corrupted = generateCorruptedDataset(clean, seed + 100);

  const cleanRecords = [
    ...clean.people,
    ...clean.places,
    ...clean.events
  ];

  return {
    datasetId: `dataset_${Date.now()}`,
    clean: {
      records: cleanRecords,
      counts: {
        people: clean.people.length,
        places: clean.places.length,
        events: clean.events.length,
        total: cleanRecords.length
      }
    },
    corrupted: {
      records: corrupted.records,
      counts: {
        people: corrupted.people.length,
        places: corrupted.places.length,
        events: corrupted.events.length,
        total: corrupted.records.length
      },
      groundTruthMutations: corrupted.groundTruthMutations
    }
  };
}

/**
 * Downloads an object as a formatted JSON file in browser
 */
export function downloadJsonFile(filename, data) {
  const jsonStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Downloads CSV content in browser
 */
export function downloadCsvFile(filename, csvContent) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parses user-uploaded JSON file
 */
export async function parseJsonUpload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse JSON file: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error("File reading error"));
    reader.readAsText(file);
  });
}

/**
 * Parses user-uploaded CSV file
 */
export async function parseCsvUpload(file) {
  return new Promise((resolve, reject) => {
    if (window.Papa) {
      window.Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (err) => reject(new Error(`PapaParse error: ${err.message}`))
      });
    } else {
      // Fallback simple line-by-line CSV parser
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length < 2) return resolve([]);
        const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        const records = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
          const row = {};
          headers.forEach((h, idx) => {
            row[h] = values[idx] || null;
          });
          records.push(row);
        }
        resolve(records);
      };
      reader.onerror = () => reject(new Error("File reading error"));
      reader.readAsText(file);
    }
  });
}

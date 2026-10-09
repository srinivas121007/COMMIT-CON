# Knowledge Repair Tool

An end-to-end autonomous system to detect and repair data corruption (duplicates, missing values, typos, format anomalies, and relational contradictions) in relational datasets of **people**, **places**, **events**, and **relationships**. Every repaired value is traceable with field-level provenance to original source records, backed by measurable quality scores before and after repair.

---

## Architecture & Tech Stack

- **Backend**: Python 3.10+, FastAPI, Pandas, RapidFuzz, Faker, Uvicorn, Python-Multipart, Pytest.
- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, Recharts, Lucide React.
- **Storage**: Pluggable storage architecture via `Store` interface:
  - `LocalJsonStore` (**Default**, zero configuration required, fully file-based)
  - `FirestoreStore` (Optional Google Cloud Firestore integration with batched writes)
- **Zero Paid Services**: Operates 100% offline and locally out-of-the-box.

---

## Directory Structure

```
D:\Venkat\COMMIT-COM\
├── backend/
│   ├── pipeline/
│   │   ├── schema.py         # Relational schema constants
│   │   ├── generator.py      # Deterministic clean dataset generator (seed 42)
│   │   ├── corruptor.py      # Independent corruption injector & ground truth generator
│   │   ├── normalize.py      # Diacritic stripping, ISO dates, nickname/alias dicts
│   │   ├── dedupe.py         # Blocking, fuzzy scoring, union-find, cluster verification
│   │   ├── detectors.py      # 10 standalone anomaly & contradiction detectors
│   │   ├── repair.py         # Survivorship voting, provenance, re-pointing, audit logger
│   │   ├── quality.py        # 4-dimensional quality scorer (C, U, C, V)
│   │   ├── evaluate.py       # Ground truth evaluation (P/R/F1, accuracies, harm rate)
│   │   └── run.py            # CLI entrypoint & pipeline orchestrator
│   ├── storage/
│   │   ├── base.py           # Store abstract interface & JSON sanitizer
│   │   ├── local_store.py    # Local file-based JSON store (Default)
│   │   └── firestore_store.py# Firestore store with <=400 doc batches
│   ├── api/
│   │   └── main.py           # FastAPI application (CORS enabled for localhost:3000)
│   └── tests/                # 32 comprehensive unit & integration tests
├── frontend/                 # Next.js App Router + TypeScript + Tailwind + Recharts
│   └── src/app/
│       ├── page.tsx          # Dashboard (quality charts, anomaly breakdown, benchmarks)
│       ├── review/page.tsx   # Human-in-the-loop review queue (approve/reject)
│       ├── audit/page.tsx    # Filterable & searchable audit trail
│       └── lineage/page.tsx  # Entity provenance & side-by-side original records comparison
├── .env                      # Environment variables
└── README.md
```

---

## Quick Start (One-Command Setup)

### 1. Prerequisites
- Python 3.10+ (or Python launcher `py`)
- Node.js v18+ and `npm`

### 2. Run Backend
In the project root directory:
```bash
# On Windows PowerShell:
$env:PYTHONPATH="D:\Venkat\COMMIT-COM"
py -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000 --reload

# On Linux / macOS:
export PYTHONPATH="."
python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000 --reload
```
The API is live at `http://localhost:8000` (docs at `http://localhost:8000/docs`).

### 3. Run Frontend
In another terminal:
```bash
cd frontend
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## Pipeline CLI

To run the full repair pipeline directly via CLI with sample data and print the benchmark report:
```bash
$env:PYTHONPATH="D:\Venkat\COMMIT-COM"
py -m backend.pipeline.run --sample
```

---

## Environment Variables & Enabling Firestore

The system comes with `STORAGE_BACKEND=local` as default:

```env
# .env
STORAGE_BACKEND=local          # Options: "local" (default) or "firestore"
FIREBASE_PROJECT_ID=           # Required only if STORAGE_BACKEND=firestore
GOOGLE_APPLICATION_CREDENTIALS=# Path to serviceAccountKey.json (if using Firestore)
PORT=8000
```

### How to Enable Firestore:
1. Create a Firebase project in the Firebase Console.
2. Generate a Service Account private key JSON file from Project Settings > Service Accounts.
3. Save the JSON file on disk and set in `.env`:
   ```env
   STORAGE_BACKEND=firestore
   FIREBASE_PROJECT_ID=your-project-id
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
   ```
4. Restart the backend. All runs, original and repaired records, audit events, and issues will be stored in Firestore collections (`runs`, `original_records`, `repaired_records`, `audit_log`, `issues`).

---

## Running the Automated Test Suite

Run all 32 pytest tests covering every detector, generator determinism, hand-made test cases, repair invariants, storage, and API endpoints:
```bash
$env:PYTHONPATH="D:\Venkat\COMMIT-COM"
py -m pytest backend/tests/ -v
```

---

## Assumptions

As instructed, where requirements were ambiguous, the simplest robust options were selected and documented below:

1. **Entity Identification**:
   - `repaired_id` preserves the lowest lexical ID in a merged cluster (e.g., `PER_0001` when merging `PER_0001` and `PER_0405`). This maintains backward compatibility for external consumers.
2. **Missing Field Survivorship**:
   - Fields that are completely absent across all cluster members remain `null` rather than generating synthetic fallback values ("never invent values").
3. **Date Formats**:
   - Ambiguous date strings where day and month are both $\le 12$ (e.g. `05/06/1980`) default to ISO format using standard US month-first parsing (`1980-05-06`) while setting `is_ambiguous_dob = True` for audit inspection.
4. **Relational Vetoes**:
   - Relationships pointing to self (`from_id == to_id`) or contradictory edges are excluded from repaired tables and logged as `FLAG` or `RESOLVE_CONFLICT` in the audit log for human review.
5. **Harm Rate Calculation**:
   - Harm rate evaluates auto-applied modifications against ground-truth clean records. An action is considered harmful if and only if it took a field whose corrupted value was already correct and replaced it with an incorrect value, or incorrectly merged distinct canonical entities.

---

## 60-Second Demo Script

1. **Start the backend and frontend** using the quick start instructions above.
2. Open `http://localhost:3000` in your web browser.
3. On the **Dashboard**:
   - Note the **"Deterministic Realistic Sample Dataset"** banner.
   - Click the **"Execute Repair Pipeline"** button.
   - Observe the real-time loading spinner as the system generates ~400 people, ~40 places, ~80 events, ~600 relationships, injects 380+ corruptions, executes normalization, blocking deduplication, 10 anomaly detectors, field survivorship, and referential integrity repair.
4. **Review Quality & Evaluation Metrics**:
   - See the **Quality Score** jump from ~97.2 to **98.2+**.
   - Inspect the **Quality Dimensions Bar Chart** comparing Completeness, Uniqueness, Consistency, and Validity.
   - Observe the **Duplicate Resolution F1 Score** of **87.6%** and **Harm Rate** of **0.00%** (&lt; 5% threshold).
5. **Inspect the Review Queue**:
   - Click **Review Queue** in the navbar (`/review`).
   - View pending borderline merge and conflict candidates with plain-English reasons.
   - Click **Approve** or **Reject** on an item to see instantaneous state transition.
6. **Inspect Audit Log**:
   - Click **Audit Log** (`/audit`) to search and filter all applied modifications.
7. **Trace Lineage**:
   - Click **Entity Lineage** (`/lineage`) and select any repaired entity (e.g. `PER_0004`).
   - See the side-by-side original duplicate records, highlighted modified fields, and field provenance badges.
8. **Export Repaired Dataset**:
   - Return to the Dashboard and click **"Export ZIP"** to download all 4 repaired CSVs plus `audit_log.csv`.

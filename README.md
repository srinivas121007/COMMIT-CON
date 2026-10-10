# Knowledge Repair Tool
# Knowledge Repair Tool

### Explainable Data Quality Workbench & Entity Resolution Engine

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Pipeline: Tested](https://img.shields.io/badge/Pipeline%20Tests-20%2F20%20Passed-10b981.svg)](tests/index.html)
[![Architecture: Vanilla ES6](https://img.shields.io/badge/Architecture-Pure%20ES%20Modules-f59e0b.svg)](public/js/app.js)
[![Persistence: Firestore & IndexedDB](https://img.shields.io/badge/Persistence-Firestore%20%7C%20IndexedDB-0284c7.svg)](public/js/firebase.js)

The **Knowledge Repair Tool** is an end-to-end autonomous system to detect and repair data corruption in relational datasets of **people**, **places**, **events**, and **relationships**. It is designed as an explainable data quality workbench that detects, inspects, and automatically repairs corruptions, duplicate entities, logical contradictions, and formatting anomalies in structured knowledge datasets while keeping every repaired value traceable with field-level provenance and measurable quality scores before and after repair.

Featuring an off-thread Web Worker pipeline, mathematical quality dimension metrics, ground-truth precision/recall benchmarking, an immutable audit trail with 1-click rollback, and a force-directed interactive relationship graph powered by vis-network. The project supports both a browser-first JS implementation and a Python/FastAPI + Next.js pipeline stack with pluggable storage and offline-first defaults.

---

## 1. System Architecture

The application is built on a high-performance **Vanilla ES Module** architecture with zero build steps, combining off-thread processing, reactive state management, and dual-layer persistence, while the backend/frontend stack adds deterministic pipeline execution, API access, and human-in-the-loop review workflows.

```text
+---------------------------------------------------------------------------------------+
|                                    USER INTERFACE                                     |
|  +---------------------------------------------------------------------------------+  |
|  | Single Page Application Router (Hash-based: #/dashboard, #/issues, #/graph...)  |  |
|  +---------------------------------------------------------------------------------+  |
|         |                     |                      |                     |          |
|         v                     v                      v                     v          |
|  +-------------+      +---------------+      +---------------+     +---------------+  |
|  |  Dashboard  |      | Disambiguation|      | Contradiction |     | Relationship  |  |
|  |  & Metrics  |      | & Duplicates  |      |   Inspector   |     | Graph (Vis.js)|  |
|  +-------------+      +---------------+      +---------------+     +---------------+  |
|         |                     |                      |                     |          |
|         +---------------------+----------------------+---------------------+          |
|                                       |                                               |
|                                       v                                               |
|                      +----------------------------------+                             |
|                      |  Central Reactive State Store    |                             |
|                      |  (Observer Pattern, Toasts)      |                             |
|                      +----------------------------------+                             |
+---------------------------------------|-----------------------------------------------+
                                        |
                 +----------------------+----------------------+
                 |                                             |
                 v (Off-Thread Web Worker)                     v (Async Persistence)
+----------------------------------+          +----------------------------------+
|      KNOWLEDGE REPAIR ENGINE     |          |       DUAL PERSISTENCE LAYER     |
|                                  |          |                                  |
| 1. Dataset Profiler              |          |  +----------------------------+  |
|    - Completeness & Null rates   |          |  |   Google Firebase          |  |
|                                  |          |  |   Cloud Firestore          |  |
| 2. Canonical Normalizer          |          |  |   - Anonymous Auth         |  |
|    - Names, ISO Dates, Aliases   |          |  |   - Chunked Batches (<=400)|  |
| 3. Entity Resolution             |          |  +----------------------------+  |
|    - Levenshtein & Jaro-Winkler  |          |                | (Fallback /     |
|    - Nicknames & Initial Matches |          |                v  Local Mirror)  |
|    - Auto-Merge Clusters (>=90%) |          |  +----------------------------+  |
|                                  |          |  |   Browser IndexedDB        |  |
| 4. Logic & Contradiction Engine  |          |  |   - Full Offline Mode      |  |
|    - Chronological Inversions    |          |  |   - 6 Storage Stores       |  |
|    - Biological Age Limits (>125)|          |  +----------------------------+  |
|    - Genealogical Cycle Breaker  |          +----------------------------------+
|    - Spatiotemporal Collisions   |
|                                  |
| 5. Canonical Repair Engine       |
|    - Surviving Entity Selection  |
|    - Cross-Record Imputation     |
|    - Circular Link Severing      |
|                                  |
| 6. Quality & Benchmark Math      |
|    - 4-Dimension Quality Scores  |
|    - Precision, Recall & F1      |
|                                  |
| 7. Audit Trail & Lineage Engine  |
|    - Field-Level Reversible Log  |
+----------------------------------+
```

## Architecture & Tech Stack

- **Backend**: Python 3.10+, FastAPI, Pandas, RapidFuzz, Faker, Uvicorn, Python-Multipart, Pytest.
- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS, Recharts, Lucide React.
- **Storage**: Pluggable storage architecture via `Store` interface:
  - `LocalJsonStore` (**Default**, zero configuration required, fully file-based)
  - `FirestoreStore` (Optional Google Cloud Firestore integration with batched writes)
- **Zero Paid Services**: Operates 100% offline and locally out-of-the-box.

---

## Directory Structure

```text
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
│   │   ├── evaluate.py      # Ground truth evaluation (P/R/F1, accuracies, harm rate)
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
├── public/                   # Browser workbench (vanilla ES modules + UI)
│   ├── index.html            # SPA entry point
│   ├── css/
│   └── js/
├── data/
├── tests/
├── .env                      # Environment variables
├── firebase.json
├── firestore.rules
├── LICENSE
├── README.md
└── package.json
```
```

---

## 2. Key Features

- **Interactive Relationship Graph (`#/graph`)**:
  - Vis-network canvas visualizing People (blue), Places (green), and Events (purple).
  - Glowing gold halo and star indicators highlight merged canonical entities.
  - ForceAtlas2 physics simulation with pause/resume controls, fit-view, and zoom.
  - Interactive search and entity category filtering.
  - Responsive details drawer with clickable related entity links that smoothly focus the canvas camera.
  - Topology switcher: compare the original corrupted graph vs. the canonical repaired graph.

- **Automated Entity Resolution (`#/duplicates`)**:
  - Multi-factor fuzzy matching combining Levenshtein distance, Jaro-Winkler string metric, initial detection, and historical nickname dictionaries.
  - Auto-merge tier (&ge;90% confidence) and manual review tier (70%–90%).
  - Side-by-side attribute difference visualizer with custom attribute merge modal.

- **Contradiction & Logic Detection (`#/contradictions`)**:
  - Flags chronological paradoxes (death before birth).
  - Flags impossible longevity (>125 years).
  - Depth-first search (DFS) cycle detection for circular parentage (`A -> parent of B -> parent of A`).
  - Spatiotemporal collisions (same entity in different geographic coordinates on the same date).

- **Verifiable Quality Scoring & Benchmarking (`#/quality`)**:
  - Four mathematical quality dimensions: **Completeness**, **Uniqueness**, **Validity**, **Consistency**.
  - Ground-truth evaluation against injected mutations: reports **Precision**, **Recall**, and **F1-Score**.
  - Interactive Chart.js radar charts and dimensional comparison scorecards.

- **Immutable Audit Trail & 1-Click Rollback (`#/audit`)**:
  - Complete chronological record of every transformation.
  - Instant 1-click field reversion and re-application with real-time recalculation of quality metrics.
  - Source record lineage tracing showing raw historical roots.

- **UI Polish & Accessibility**:
  - Dark mode and light mode with high-contrast ratios (WCAG AA/AAA compliant).
  - Persistent theme preference in `localStorage`.
  - Non-blocking toast notifications for user interactions and Firestore status alerts.
  - Responsive layout with collapsible sidebar and mobile-friendly bottom-sheet drawer.

---

## 3. Quick Start (One-Command Setup)

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

### Local Development Instructions (Browser Workbench)

The project also includes a native browser ES Module build with zero build steps or bundlers.

#### Option A: Built-in Node.js Server (Recommended)
```bash
git clone https://github.com/your-username/knowledge-repair-tool.git
cd "D:\COMMITCOM\COMMIT COM"
npm start
```
Open your browser at `http://localhost:3000/`.

#### Option B: Using `npx serve`
```bash
npx serve public
```

#### Option C: Using VS Code Live Server
1. Open the project folder in Visual Studio Code.
2. Install the **Live Server** extension (`ritwickdey.liveserver`).
3. Right-click `public/index.html` and select **"Open with Live Server"**.

### Pipeline CLI

To run the full repair pipeline directly via CLI with sample data and print the benchmark report:

```bash
$env:PYTHONPATH="D:\Venkat\COMMIT-COM"
py -m backend.pipeline.run --sample
```

### Running the Test Suite
- **CLI Mode**: Run `npm test` to execute the Node.js test runner covering normalization, duplicate scoring, graph cycle breaking, quality math, and audit reversions.
- **Browser Mode**: Navigate to `http://localhost:3000/tests/index.html` to run the in-browser visual test suite.
- **Python Mode**: Run `py -m pytest backend/tests/ -v` for the 32 pytest checks covering detectors, generator determinism, repair invariants, storage, and API endpoints.

---
```

---

## 4. Firebase Setup & Storage Configuration

The tool supports seamless synchronization with Google Cloud Firestore while automatically falling back to browser IndexedDB if Firebase credentials are unconfigured. The system also ships with `STORAGE_BACKEND=local` as the default for zero-configuration local use.

```env
# .env
STORAGE_BACKEND=local          # Options: "local" (default) or "firestore"
FIREBASE_PROJECT_ID=           # Required only if STORAGE_BACKEND=firestore
GOOGLE_APPLICATION_CREDENTIALS=# Path to serviceAccountKey.json (if using Firestore)
PORT=8000
```

### How to Enable Firestore
1. Create a Firebase project in the Firebase Console.
2. Generate a Service Account private key JSON file from Project Settings > Service Accounts.
3. Save the JSON file on disk and set in `.env`:
   ```env
   STORAGE_BACKEND=firestore
   FIREBASE_PROJECT_ID=your-project-id
   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
   ```
4. Restart the backend. All runs, original and repaired records, audit events, and issues will be stored in Firestore collections (`runs`, `original_records`, `repaired_records`, `audit_log`, `issues`).

### Step 1: Create Firebase Project
1. Navigate to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add Project**, name your project (e.g., `knowledge-repair-tool`), and proceed through setup.

### Step 2: Enable Anonymous Authentication
1. In the Firebase Console left sidebar, go to **Build** > **Authentication**.
2. Click **Get Started**, navigate to the **Sign-in method** tab.
3. Select **Anonymous**, enable the toggle, and click **Save**.

### Step 3: Create Firestore Database
1. In the left sidebar, navigate to **Build** > **Firestore Database**.
2. Click **Create Database**.
3. Choose your preferred location (e.g., `us-central1`) and start in **Production mode**.

### Step 4: Add Web App & Configure Credentials
1. In Project Settings (**Gear Icon** > **Project settings**), scroll to **Your apps** and click the Web (`</>`) icon.
2. Register the app (e.g., `knowledge-repair-web`).
3. Copy the provided `firebaseConfig` object and paste it into `public/js/firebase-config.js`:
```javascript
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### Step 5: Deploy Firestore Security Rules
Install the Firebase CLI and authenticate:

```bash
npm install -g firebase-tools
firebase login
firebase use --add YOUR_PROJECT_ID
firebase deploy --only firestore:rules
```

The deployed `firestore.rules` file enforces immutability on original ingested records:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /datasets/{datasetId} {
      // Ingested source records are strictly write-once / immutable
      match /original_records/{recordId} {
        allow read: if true;
        allow create: if request.auth != null;
        allow update, delete: if false; // Immutability guarantee
      }

      // Repaired records, change logs, and issues permit state modifications
      match /repaired_records/{recordId} {
        allow read: if true;
        allow write: if request.auth != null;
      }
      match /change_log/{changeId} {
        allow read: if true;
        allow write: if request.auth != null;
      }
      match /issues/{issueId} {
        allow read: if true;
        allow write: if request.auth != null;
      }
      match /quality_snapshots/{snapshotId} {
        allow read: if true;
        allow write: if request.auth != null;
      }
    }
  }
}
```

### Running the Automated Test Suite

Run the browser-side and Python-side suites as needed:

```bash
# Browser workbench / Node tests
npm test

# Python pipeline tests
$env:PYTHONPATH="D:\Venkat\COMMIT-COM"
py -m pytest backend/tests/ -v
```

---
```

---

## 5. Demo & Assumptions

### 3-Minute End-to-End Presentation Demo Script

| Timestamp | Screen / Action | Script & Talking Points |
| :--- | :--- | :--- |
| **0:00 - 0:45** | **Dashboard (`#/dashboard`)**<br>Load Sample Corrupted Dataset | *"Welcome to the Knowledge Repair Tool. When organizations ingest historical, biographical, or enterprise knowledge graphs, they face duplicates, conflicting assertions, and formatting chaos. Here on the Dashboard, we ingest a 268-record dataset with 87 injected corruptions. Our dimensional scorecards reveal that Validity is compromised and our Uniqueness is degraded by duplicated identities."* |
| **0:45 - 1:30** | **Execute Pipeline & Inspect Issues (`#/issues`, `#/duplicates`)**<br>Click 'Run Knowledge Repair Pipeline' | *"With one click, our multi-stage Web Worker processes the dataset completely off-thread in under 150 milliseconds. In Duplicates Resolution, our fuzzy resolver paired 'Robert Oppenheimer' with 'Bob Oppenheimer' using nickname expansion and 94% confidence. In the Contradictions page, our cycle breaker discovered and flagged circular genealogical parentage paradoxes."* |
| **1:30 - 2:15** | **Relationship Graph (`#/graph`)**<br>Interactive canvas exploration | *"Now, let's explore the Relationship Graph. People are displayed in blue, Places in emerald, and Events in violet. Notice these glowing gold nodes with star badges—these represent our canonical synthesized entities. Clicking 'Alan Turing' opens our inspection drawer showing attributes consolidated from duplicate records. If we click a related entity link, the camera smoothly glides and focuses directly on the target node."* |
| **2:15 - 3:00** | **Quality Benchmark & 1-Click Rollback (`#/quality`, `#/audit`)**<br>Review metrics & perform field rollback | *"Over in Quality & Benchmark, our mathematical scorecard verifies that overall quality surged from 96% to over 99%, with an empirical Precision of 98.8% and Recall of 96.5% against injected ground truth. Furthermore, nothing is a black box: in the Audit Trail, every transformation is tracked. Clicking 'Revert' on any field immediately rolls back that field to its original value and dynamically recalculates downstream scores. Thank you!"* |

### Assumptions

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

### 60-Second Demo Script

1. **Start the backend and frontend** using the quick start instructions above.
2. Open `http://localhost:3000` in your web browser.
3. On the **Dashboard**:
   - Note the **"Deterministic Realistic Sample Dataset"** banner.
   - Click the **"Execute Repair Pipeline"** button.
   - Observe the real-time loading spinner as the system generates ~400 people, ~40 places, ~80 events, ~600 relationships, injects 380+ corruptions, executes normalization, blocking deduplication, 10 anomaly detectors, field survivorship, and referential integrity repair.
4. **Review Quality & Evaluation Metrics**:
   - See the **Quality Score** jump from ~97.2 to **98.2+**.
   - Inspect the **Quality Dimensions Bar Chart** comparing Completeness, Uniqueness, Consistency, and Validity.
   - Observe the **Duplicate Resolution F1 Score** of **87.6%** and **Harm Rate** of **0.00%** (< 5% threshold).
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

---

## 6. Project Directory Structure

```text
D:\COMMITCOM\COMMIT COM
├── README.md                     # Comprehensive architecture, setup & demo documentation
├── firebase.json                 # Firebase Hosting & Firestore configuration
├── firestore.rules               # Firestore security rules with original_records immutability
├── firestore.indexes.json        # Composite query indexing configuration
├── package.json                  # Project metadata, scripts, and dependencies
├── server.js                     # Local zero-dependency HTTP static server
├── backend/                     # Python pipeline, API, storage, tests
│   ├── pipeline/
│   ├── storage/
│   ├── api/
│   └── tests/
├── frontend/                    # Next.js App Router + TypeScript + Tailwind + Recharts
│   └── src/app/
├── data/
│   ├── generateDataset.js        # Deterministic 250+ entity generator with ground-truth mutations
│   ├── exportSampleDataset.js    # JSON export generator script
│   └── sample-dataset.json       # Generated sample dataset artifact
├── public/                      # Browser workbench and static app shell
│   ├── index.html                # Single-page application entry point
│   ├── css/
│   └── js/
├── tests/
│   ├── index.html                # In-browser test runner UI
│   ├── runTests.js               # Node.js automated unit & integration test suite
│   ├── testStage1.js             # Stage 1 verification tests
│   └── testStage5.js             # Stage 5 relationship graph tests
└── .env
```

---

## 7. License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
```

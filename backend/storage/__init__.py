"""
Storage package initializer and store factory.
"""

import os
from dotenv import load_dotenv
from backend.storage.base import Store, to_json_safe
from backend.storage.local_store import LocalJsonStore

load_dotenv()


def get_store() -> Store:
    """Returns configured Store instance based on STORAGE_BACKEND env var."""
    backend = os.getenv("STORAGE_BACKEND", "local").strip().lower()
    if backend == "firestore":
        from backend.storage.firestore_store import FirestoreStore
        project_id = os.getenv("FIREBASE_PROJECT_ID")
        return FirestoreStore(project_id=project_id)
    return LocalJsonStore()

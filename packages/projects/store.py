"""JSON-file backed store for ADVO Projects."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from packages.projects.models import Project, ProjectCreate, ProjectDocument, ProjectUpdate, UserMode


class ProjectStore:
    """Persistent project store backed by a single JSON file.

    In production this should be replaced by a database, but the file-based
    store is enough for the MVP and keeps the backend self-contained.
    """

    def __init__(self, path: Path | str | None = None):
        repo_root = Path(__file__).resolve().parent.parent.parent
        self._path = Path(path) if path else repo_root / "data" / "projects.json"
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._projects: dict[str, Project] = {}
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            self._projects = {}
            return
        try:
            data = json.loads(self._path.read_text(encoding="utf-8"))
            self._projects = {p["id"]: Project(**p) for p in data.get("projects", [])}
        except Exception:
            self._projects = {}

    def _save(self) -> None:
        payload = {
            "projects": [p.model_dump(mode="json") for p in self._projects.values()],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self._path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    def list_projects(self, role: Optional[UserMode] = None) -> list[Project]:
        """Return projects, optionally filtered by role, newest first."""
        projects = list(self._projects.values())
        if role:
            projects = [p for p in projects if p.role == role]
        projects.sort(key=lambda p: p.updated_at, reverse=True)
        return projects

    def get_project(self, project_id: str) -> Optional[Project]:
        return self._projects.get(project_id)

    def create_project(self, payload: ProjectCreate) -> Project:
        now = datetime.now(timezone.utc).isoformat()
        project = Project(
            id=str(uuid.uuid4())[:8],
            name=payload.name,
            role=payload.role,
            description=payload.description,
            instructions=payload.instructions,
            created_at=now,
            updated_at=now,
        )
        self._projects[project.id] = project
        self._save()
        return project

    def update_project(self, project_id: str, payload: ProjectUpdate) -> Optional[Project]:
        project = self._projects.get(project_id)
        if not project:
            return None
        updates = payload.model_dump(exclude_unset=True)
        for key, value in updates.items():
            setattr(project, key, value)
        project.updated_at = datetime.now(timezone.utc).isoformat()
        self._save()
        return project

    def delete_project(self, project_id: str) -> bool:
        if project_id not in self._projects:
            return False
        del self._projects[project_id]
        self._save()
        return True

    def add_document(
        self,
        project_id: str,
        document: ProjectDocument,
    ) -> Optional[Project]:
        project = self._projects.get(project_id)
        if not project:
            return None
        project.documents.append(document)
        project.updated_at = datetime.now(timezone.utc).isoformat()
        self._save()
        return project

    def remove_document(self, project_id: str, document_id: str) -> Optional[Project]:
        project = self._projects.get(project_id)
        if not project:
            return None
        project.documents = [d for d in project.documents if d.id != document_id]
        project.updated_at = datetime.now(timezone.utc).isoformat()
        self._save()
        return project


# Singleton store instance used by the API.
project_store = ProjectStore()

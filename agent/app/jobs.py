"""JobStore interface + in-memory and Redis implementations.

The API enqueues a job, runs the pipeline in a background task, and the client
polls for status. The store is kept behind a tiny Protocol so it's swappable.
"""
from __future__ import annotations

import uuid
from typing import Optional, Protocol

from app.models import JobStatus, Moodboard


def new_job_id() -> str:
    return uuid.uuid4().hex


class JobStore(Protocol):
    async def create(self) -> str: ...
    async def get(self, job_id: str) -> Optional[JobStatus]: ...
    async def set_running(self, job_id: str) -> None: ...
    async def set_done(self, job_id: str, moodboard: Moodboard) -> None: ...
    async def set_error(self, job_id: str, error: str) -> None: ...


class InMemoryJobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, JobStatus] = {}

    async def create(self) -> str:
        job_id = new_job_id()
        self._jobs[job_id] = JobStatus(job_id=job_id, status="pending")
        return job_id

    async def get(self, job_id: str) -> Optional[JobStatus]:
        return self._jobs.get(job_id)

    async def set_running(self, job_id: str) -> None:
        if job_id in self._jobs:
            self._jobs[job_id].status = "running"

    async def set_done(self, job_id: str, moodboard: Moodboard) -> None:
        self._jobs[job_id] = JobStatus(job_id=job_id, status="done", moodboard=moodboard)

    async def set_error(self, job_id: str, error: str) -> None:
        self._jobs[job_id] = JobStatus(job_id=job_id, status="error", error=error)


class RedisJobStore:
    """Redis-backed store (used when JOB_STORE=redis). Stores JobStatus as JSON."""

    _PREFIX = "moodboard:job:"
    _TTL_S = 60 * 60 * 24

    def __init__(self, redis_url: str) -> None:
        try:
            import redis.asyncio as redis  # type: ignore
        except ImportError as e:  # pragma: no cover - optional dep
            raise RuntimeError("redis not installed; `pip install redis`") from e
        self._redis = redis.from_url(redis_url, decode_responses=True)

    def _key(self, job_id: str) -> str:
        return f"{self._PREFIX}{job_id}"

    async def _save(self, status: JobStatus) -> None:
        await self._redis.set(self._key(status.job_id), status.model_dump_json(), ex=self._TTL_S)

    async def create(self) -> str:
        job_id = new_job_id()
        await self._save(JobStatus(job_id=job_id, status="pending"))
        return job_id

    async def get(self, job_id: str) -> Optional[JobStatus]:
        raw = await self._redis.get(self._key(job_id))
        return JobStatus.model_validate_json(raw) if raw else None

    async def set_running(self, job_id: str) -> None:
        await self._save(JobStatus(job_id=job_id, status="running"))

    async def set_done(self, job_id: str, moodboard: Moodboard) -> None:
        await self._save(JobStatus(job_id=job_id, status="done", moodboard=moodboard))

    async def set_error(self, job_id: str, error: str) -> None:
        await self._save(JobStatus(job_id=job_id, status="error", error=error))


def make_job_store(kind: str, redis_url: str) -> JobStore:
    if kind == "redis":
        return RedisJobStore(redis_url)
    return InMemoryJobStore()

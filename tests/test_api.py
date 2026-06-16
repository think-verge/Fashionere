"""API: job lifecycle on mock providers, via FastAPI TestClient."""
from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:  # triggers startup (provider wiring)
        yield c


def _poll(client, job_id, timeout_s=10.0):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        resp = client.get(f"/api/moodboard/jobs/{job_id}")
        assert resp.status_code == 200
        body = resp.json()
        if body["status"] in ("done", "error"):
            return body
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not finish in time")


def test_healthz(client):
    assert client.get("/healthz").json() == {"status": "ok"}


def test_catalogue(client):
    items = client.get("/api/catalogue").json()
    ids = {i["catalogue_item_id"] for i in items}
    assert "dress_midi_01" in ids


def test_from_query_lifecycle(client):
    resp = client.post(
        "/api/moodboard/from-query",
        json={"query": "latest trends for a beachwear collection"},
    )
    assert resp.status_code == 202
    job_id = resp.json()["job_id"]

    body = _poll(client, job_id)
    assert body["status"] == "done", body
    mb = body["moodboard"]
    assert mb["target"]["category"] in ("swimwear", "beachwear")
    # all sections populated
    assert mb["narrative"]
    assert mb["keywords"]
    assert mb["name_suggestions"]
    assert mb["palette"]
    assert mb["badges"]
    for section in ("hero_images", "silhouettes", "textures", "patterns",
                    "details", "styling", "colorways"):
        assert mb[section], f"empty section: {section}"


def test_from_catalogue_lifecycle(client):
    resp = client.post(
        "/api/moodboard/from-catalogue", json={"catalogue_item_id": "dress_midi_01"}
    )
    assert resp.status_code == 202
    body = _poll(client, resp.json()["job_id"])
    assert body["status"] == "done", body
    assert body["moodboard"]["target"]["category"] == "dresses"


def test_from_image_lifecycle(client):
    resp = client.post(
        "/api/moodboard/from-image",
        json={"image_url": "https://example.com/some-denim.jpg"},
    )
    assert resp.status_code == 202
    body = _poll(client, resp.json()["job_id"])
    assert body["status"] == "done", body
    assert body["moodboard"]["target"]["category"]


def test_unknown_job_404(client):
    assert client.get("/api/moodboard/jobs/does-not-exist").status_code == 404


def test_unknown_catalogue_404(client):
    resp = client.post(
        "/api/moodboard/from-catalogue", json={"catalogue_item_id": "nope"}
    )
    assert resp.status_code == 404

import os

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_suuplan.db")
os.environ["SUUPLAN_EXTERNAL_DATA"] = "0"
os.environ.pop("ANTHROPIC_API_KEY", None)

import pytest
from fastapi.testclient import TestClient

from suuplan.geo import polygon_area_ha, validate_plot
from suuplan.main import app

# ~200 x 200 m square near Kant (Chuy)
SQUARE = {"type": "Polygon", "coordinates": [[[74.85, 42.89], [74.8524, 42.89], [74.8524, 42.8918], [74.85, 42.8918], [74.85, 42.89]]]}


@pytest.fixture(scope="module")
def client():
    if os.path.exists("test_suuplan.db"):
        os.remove("test_suuplan.db")
    with TestClient(app) as c:
        yield c
    if os.path.exists("test_suuplan.db"):
        os.remove("test_suuplan.db")


def login(c, phone="+996555123456"):
    assert c.post("/auth/otp", json={"phone": phone}).json() == {"sent": True}
    tok = c.post("/auth/verify", json={"phone": phone, "code": "1234"}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


def test_area_close_to_geodesic():
    # 0.0024 deg lon x 0.0018 deg lat at 42.89N ~ 195.8 m x 199.9 m ~ 3.91 ha
    assert abs(polygon_area_ha(SQUARE) - 3.91) / 3.91 < 0.01


def test_validation():
    assert validate_plot(SQUARE)[1] is None
    almaty = {"type": "Polygon", "coordinates": [[[76.9, 43.25], [76.902, 43.25], [76.902, 43.252], [76.9, 43.25]]]}
    assert validate_plot(almaty)[1] == "outside_kg"
    bow = {"type": "Polygon", "coordinates": [[[74.85, 42.89], [74.852, 42.892], [74.852, 42.89], [74.85, 42.892], [74.85, 42.89]]]}
    assert validate_plot(bow)[1] == "self_intersection"


def test_auth_errors(client):
    assert client.post("/auth/otp", json={"phone": "12345"}).json()["code"] == "phone_invalid"
    r = client.post("/auth/verify", json={"phone": "+996555000000", "code": "0000"})
    assert r.status_code == 400 and r.json()["code"] == "code_invalid"
    assert client.get("/plots").json()["code"] == "unauthorized"


def test_full_flow(client):
    h = login(client)
    p = client.post("/plots", json={"name": "Талаа", "geometry": SQUARE}, headers=h).json()
    assert p["area_ha"] > 3.8
    ctx = client.get(f"/plots/{p['id']}/context", headers=h).json()
    assert {"ffd", "rain", "heat", "soil", "basin", "snow"} <= ctx.keys()
    body = {"plot_id": p["id"], "prev": "wheat", "source": "river", "water": "enough", "soil": "medium", "priority": "income"}
    r = client.post("/plans", json=body, headers=h).json()
    assert len(r["plans"]) == 3
    s = client.post("/saved-plans", json={"plot_id": p["id"], "plan": r["plans"][0], "inputs": body}, headers=h).json()
    assert client.get("/saved-plans", headers=h).json()[0]["id"] == s["id"]
    assert client.get("/plots", headers=h).json()[0]["answers"]["priority"] == "income"
    # another user cannot see it
    h2 = login(client, "+996700000001")
    assert client.get("/plots", headers=h2).json() == []
    assert client.get(f"/plots/{p['id']}/context", headers=h2).status_code == 404
    assert client.delete(f"/saved-plans/{s['id']}", headers=h2).status_code == 404


def test_places_and_snow(client):
    r = client.get("/places", params={"q": "тала", "lang": "ru"}).json()
    assert r[0]["name"] == "Талас"
    assert client.get("/places", params={"q": "Өзгөн", "lang": "en"}).json()[0]["name"] == "Uzgen"
    fc = client.get("/snow/basins.geojson").json()
    assert len(fc["features"]) >= 8 and fc["features"][0]["properties"]["label"] in ("low", "normal", "high")


def test_assistant_faq_mode_and_sow_refusal(client):
    r = client.post("/assistant/chat", json={"messages": [{"role": "user", "content": "Как сохранить план?"}], "lang": "ru"})
    assert r.status_code == 503 and r.json()["code"] == "assistant_unavailable"
    r = client.post("/assistant/chat", json={"messages": [{"role": "user", "content": "Что мне посеять?"}], "lang": "ru"})
    assert r.status_code == 200 and "Планы" in r.text and '"goto": "plans"' in r.text

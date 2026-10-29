import re
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone

import jwt
from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import assistant, climate, places, scoring, snow
from .config import (ASSISTANT_DAILY_LIMIT, ASSISTANT_MAX_CHARS, CORS_ORIGINS, DEMO_OTP_CODE, JWT_DAYS,
                     JWT_SECRET)
from .db import Plot, PlotAnswers, SavedPlan, SessionLocal, User, get_db, init_db
from .geo import basin_for_point, centroid, validate_plot

PHONE_RE = re.compile(r"^\+996\d{9}$")


class ApiError(Exception):
    def __init__(self, status, code, message=""):
        self.status, self.code, self.message = status, code, message or code


@asynccontextmanager
async def lifespan(app):
    init_db()
    with SessionLocal() as db:
        snow.seed_demo(db)
        places.seed_places(db)
    yield


app = FastAPI(title="SuuPlan API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"],
                   allow_headers=["Authorization", "Content-Type"])


@app.exception_handler(ApiError)
async def api_error_handler(request, exc: ApiError):
    return JSONResponse({"code": exc.code, "message": exc.message}, status_code=exc.status)


@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc):
    return JSONResponse({"code": "bad_request", "message": str(exc)[:300]}, status_code=422)


# ---------- rate limiting (in-memory, per process: enough for the demo) ----------
_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(key, limit, window_s):
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > window_s:
        q.popleft()
    if len(q) >= limit:
        raise ApiError(429, "rate_limited")
    q.append(now)


# ---------- auth ----------
class OtpIn(BaseModel):
    phone: str


class VerifyIn(BaseModel):
    phone: str
    code: str


def make_token(user_id):
    exp = datetime.now(timezone.utc) + timedelta(days=JWT_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": exp}, JWT_SECRET, algorithm="HS256")


def user_id_from(authorization):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return int(jwt.decode(authorization[7:], JWT_SECRET, algorithms=["HS256"])["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def current_user(authorization: str | None = Header(default=None)):
    uid = user_id_from(authorization)
    if uid is None:
        raise ApiError(401, "unauthorized")
    return uid


@app.post("/auth/otp")
def auth_otp(body: OtpIn, request: Request):
    rate_limit(f"otp:{request.client.host}", 10, 60)
    if not PHONE_RE.match(body.phone):
        raise ApiError(400, "phone_invalid")
    return {"sent": True}  # MVP: no SMS, the code is always 1234


@app.post("/auth/verify")
def auth_verify(body: VerifyIn, request: Request, db: Session = Depends(get_db)):
    rate_limit(f"verify:{request.client.host}", 10, 60)
    if not PHONE_RE.match(body.phone):
        raise ApiError(400, "phone_invalid")
    if body.code != DEMO_OTP_CODE:
        raise ApiError(400, "code_invalid")
    user = db.scalar(select(User).where(User.phone == body.phone))
    if not user:
        user = User(phone=body.phone)
        db.add(user)
        db.commit()
    return {"token": make_token(user.id)}


@app.get("/me")
def me(uid: int = Depends(current_user), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise ApiError(401, "unauthorized")
    return {"id": u.id, "phone": u.phone}


# ---------- places ----------
@app.get("/places")
def get_places(q: str = "", lang: str = "ky", db: Session = Depends(get_db)):
    return places.search_places(q[:60], lang, db)


@app.get("/geocode")
async def get_geocode(q: str, db: Session = Depends(get_db)):
    if len(q.strip()) < 2:
        return []
    try:
        return await places.geocode(q[:120], db)
    except Exception:
        raise ApiError(502, "geocode_unavailable")


# ---------- plots ----------
class PlotIn(BaseModel):
    name: str = Field(default="", max_length=80)
    geometry: dict
    answers: dict | None = None


class PlotPatch(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    geometry: dict | None = None
    answers: dict | None = None


def plot_out(p: Plot, db):
    a = db.get(PlotAnswers, p.id)
    return {"id": p.id, "name": p.name, "geometry": p.geometry, "area_ha": p.area_ha,
            "answers": a.answers if a else {}, "updated_at": p.updated_at.isoformat()}


def own_plot(db, uid, plot_id):
    p = db.get(Plot, plot_id)
    if not p or p.user_id != uid:
        raise ApiError(404, "plot_not_found")
    return p


ANSWER_KEYS = {"prev", "source", "water", "soil", "priority"}


def clean_answers(a):
    return {k: v for k, v in (a or {}).items() if k in ANSWER_KEYS and isinstance(v, str) and len(v) < 30}


def set_answers(db, plot_id, answers):
    row = db.get(PlotAnswers, plot_id)
    if row:
        row.answers = {**row.answers, **clean_answers(answers)}
    else:
        db.add(PlotAnswers(plot_id=plot_id, answers=clean_answers(answers)))


@app.get("/plots")
def list_plots(uid: int = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Plot).where(Plot.user_id == uid).order_by(Plot.id)).all()
    return [plot_out(p, db) for p in rows]


@app.post("/plots")
def create_plot(body: PlotIn, uid: int = Depends(current_user), db: Session = Depends(get_db)):
    area, err = validate_plot(body.geometry)
    if err:
        raise ApiError(400, err)
    count = len(db.scalars(select(Plot.id).where(Plot.user_id == uid)).all())
    p = Plot(user_id=uid, name=body.name.strip() or f"#{count + 1}", geometry=body.geometry, area_ha=area)
    db.add(p)
    db.flush()
    set_answers(db, p.id, body.answers)
    db.commit()
    return plot_out(p, db)


@app.patch("/plots/{plot_id}")
def patch_plot(plot_id: int, body: PlotPatch, uid: int = Depends(current_user), db: Session = Depends(get_db)):
    p = own_plot(db, uid, plot_id)
    if body.geometry is not None:
        area, err = validate_plot(body.geometry)
        if err:
            raise ApiError(400, err)
        p.geometry, p.area_ha = body.geometry, area
    if body.name is not None and body.name.strip():
        p.name = body.name.strip()
    if body.answers is not None:
        set_answers(db, p.id, body.answers)
    p.updated_at = datetime.now(timezone.utc)
    db.commit()
    return plot_out(p, db)


@app.delete("/plots/{plot_id}")
def delete_plot(plot_id: int, uid: int = Depends(current_user), db: Session = Depends(get_db)):
    p = own_plot(db, uid, plot_id)
    a = db.get(PlotAnswers, p.id)
    if a:
        db.delete(a)
    db.delete(p)
    db.commit()
    return {"ok": True}


def plot_context(db, p, soil_answer=None):
    lat, lon = centroid(p.geometry)
    clim = climate.get_climate(db, lat, lon)
    if soil_answer in ("sandy", "medium", "clay"):
        soil = {"texture": soil_answer, "ph": None, "source": "farmer"}
    else:
        soil = climate.get_soil(db, lat, lon)
    b = basin_for_point(lat, lon)
    s = snow.latest(db).get(b["id"], {"label": "normal", "date": None, "demo": True, "anomaly": None})
    return {"ffd": clim["ffd"], "rain": clim["rain"], "heat": clim["heat"], "climate_source": clim["source"],
            "soil": soil, "basin": {"id": b["id"], "name": b["name"], "source": b["source"]},
            "snow": s, "area_ha": p.area_ha}


@app.get("/plots/{plot_id}/context")
def get_context(plot_id: int, uid: int = Depends(current_user), db: Session = Depends(get_db)):
    p = own_plot(db, uid, plot_id)
    a = db.get(PlotAnswers, p.id)
    return plot_context(db, p, (a.answers if a else {}).get("soil"))


# ---------- plans ----------
class PlansIn(BaseModel):
    plot_id: int
    prev: str = "none"
    source: str
    water: str = "enough"
    soil: str
    priority: str
    exclude: list[str] = Field(default_factory=list, max_length=60)


@app.post("/plans")
def post_plans(body: PlansIn, uid: int = Depends(current_user), db: Session = Depends(get_db)):
    if (body.source not in scoring.SOURCES or body.soil not in scoring.SOILS
            or body.priority not in scoring.PRIORITIES or (body.source != "none" and body.water not in scoring.WATER)):
        raise ApiError(400, "answers_invalid")
    p = own_plot(db, uid, body.plot_id)
    set_answers(db, p.id, body.model_dump(include=ANSWER_KEYS))
    db.commit()
    ctx = plot_context(db, p, body.soil)
    result = scoring.make_plans(body.model_dump(), ctx)
    result["context"] = ctx
    return result


# ---------- saved plans ----------
class SavedIn(BaseModel):
    plot_id: int | None = None
    plan: dict
    inputs: dict


def saved_out(s: SavedPlan):
    return {"id": s.id, "plot_id": s.plot_id, "plan": s.plan, "inputs": s.inputs, "created_at": s.created_at.isoformat()}


@app.get("/saved-plans")
def list_saved(uid: int = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(SavedPlan).where(SavedPlan.user_id == uid).order_by(SavedPlan.id.desc())).all()
    return [saved_out(s) for s in rows]


@app.post("/saved-plans")
def create_saved(body: SavedIn, uid: int = Depends(current_user), db: Session = Depends(get_db)):
    if body.plot_id is not None:
        own_plot(db, uid, body.plot_id)
    s = SavedPlan(user_id=uid, plot_id=body.plot_id, plan=body.plan, inputs=body.inputs)
    db.add(s)
    db.commit()
    return saved_out(s)


@app.delete("/saved-plans/{saved_id}")
def delete_saved(saved_id: int, uid: int = Depends(current_user), db: Session = Depends(get_db)):
    s = db.get(SavedPlan, saved_id)
    if not s or s.user_id != uid:
        raise ApiError(404, "saved_not_found")
    db.delete(s)
    db.commit()
    return {"ok": True}


# ---------- snow ----------
@app.get("/snow/basins.geojson")
def snow_basins(db: Session = Depends(get_db)):
    return JSONResponse(snow.basins_geojson(db), headers={"Cache-Control": "public, max-age=3600"})


# ---------- assistant ----------
class ChatIn(BaseModel):
    messages: list[dict] = Field(max_length=40)
    lang: str = "ky"
    screen: str = ""


@app.post("/assistant/chat")
def assistant_chat(body: ChatIn, request: Request, authorization: str | None = Header(default=None)):
    if not body.messages or body.messages[-1].get("role") != "user":
        raise ApiError(400, "bad_request")
    if len(str(body.messages[-1].get("content", ""))) > ASSISTANT_MAX_CHARS:
        raise ApiError(400, "question_too_long")
    who = user_id_from(authorization) or request.client.host
    rate_limit(f"chat:{who}:{date.today()}", ASSISTANT_DAILY_LIMIT, 86400)
    if not assistant.available() and not assistant.SOW_PATTERN.search(str(body.messages[-1].get("content", ""))):
        raise ApiError(503, "assistant_unavailable")
    return StreamingResponse(assistant.stream_reply(body.messages, body.lang, body.screen[:30]),
                             media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.get("/health")
def health():
    return {"ok": True, "assistant": assistant.available()}

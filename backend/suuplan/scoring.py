"""SuuPlan rules engine. Deterministic: same input -> same plans. No AI involved.

Crop values live in data/crops.csv and parameters in data/rules.json, so an agronomist
can change them without touching code.
"""
import csv
import itertools
import json
from dataclasses import dataclass
from functools import lru_cache
from statistics import mean

from .config import DATA_DIR

SOURCES = ("river", "well", "reservoir", "none")
WATER = ("enough", "sometimes", "often")
SOILS = ("sandy", "medium", "clay", "unknown")
PRIORITIES = ("water", "income", "soil")


@dataclass(frozen=True)
class Crop:
    id: str
    family: str
    legume: bool
    water_need_mm: float
    min_ffd: int
    soil: dict
    ph_min: float
    ph_max: float
    income_index: float
    heat_sensitivity: float
    drought_tolerance: float
    soil_effect: float
    once_per_plan: bool
    water_verified: bool


@lru_cache
def load_crops():
    with open(DATA_DIR / "crops.csv", encoding="utf-8") as f:
        return {r["id"]: Crop(
            id=r["id"], family=r["family"], legume=r["legume"] == "1",
            water_need_mm=float(r["water_need_mm"]), min_ffd=int(r["min_ffd"]),
            soil={"sandy": float(r["soil_sandy"]), "medium": float(r["soil_medium"]), "clay": float(r["soil_clay"])},
            ph_min=float(r["ph_min"]), ph_max=float(r["ph_max"]), income_index=float(r["income_index"]),
            heat_sensitivity=float(r["heat_sensitivity"]), drought_tolerance=float(r["drought_tolerance"]),
            soil_effect=float(r["soil_effect"]), once_per_plan=r["once_per_plan"] == "1",
            water_verified=r["water_verified"] == "1") for r in csv.DictReader(f)}


@lru_cache
def load_rules():
    with open(DATA_DIR / "rules.json", encoding="utf-8") as f:
        return json.load(f)


def clamp(x, lo=0.0, hi=100.0):
    return max(lo, min(hi, x))


def plan_key(seq):
    return "-".join(seq)


def shortage_key(source, water):
    return "rainfed" if source == "none" else water


def snow_applies(source, rules):
    return source in rules["snow_sources"]


def irrigation_mm(crop, rain, rules):
    return max(0.0, crop.water_need_mm - rules["effective_rain_share"] * rain)


def filter_crops(ctx, rules):
    """Step 1: drop crops without verified water data or with too short a frost-free period."""
    keep, excluded = [], []
    for c in load_crops().values():
        if not c.water_verified:
            excluded.append({"crop": c.id, "code": "no_water_data", "params": {}})
        elif ctx["ffd"] < c.min_ffd:
            excluded.append({"crop": c.id, "code": "short_ffd", "params": {"need": c.min_ffd, "have": ctx["ffd"]}})
        else:
            keep.append(c)
    return keep, excluded


def valid_sequence(seq, prev):
    """Step 2: rotation rules, taking last year's crop into account."""
    crops = load_crops()
    chain = ([prev] if prev in crops else []) + list(seq)
    for a, b in zip(chain, chain[1:]):
        if a == b:
            return False
        if crops[a].legume and crops[b].legume:
            return False
    if sum(crops[c].legume for c in seq) > 1:
        return False
    for c in seq:
        if crops[c].once_per_plan and seq.count(c) > 1:
            return False
    return True


def score_plan(seq, inp, ctx, rules):
    """Step 3: scores 0–100 for water, soil, income, risk, plus the weighted total."""
    crops = load_crops()
    cs = [crops[c] for c in seq]
    texture, ph = ctx["soil"]["texture"], ctx["soil"].get("ph")
    short = shortage_key(inp["source"], inp["water"])
    snow_label = ctx["snow"]["label"] if snow_applies(inp["source"], rules) else "normal"

    irr = [irrigation_mm(c, ctx["rain"], rules) for c in cs]
    water = clamp(100 - 100 * mean(irr) / rules["water_score_zero_at_mm"])

    suit = []
    for c in cs:
        s = c.soil[texture]
        if ph is not None and not (c.ph_min <= ph <= c.ph_max):
            s -= rules["ph_out_of_range_penalty"]
        suit.append(s)
    effect = sum(c.soil_effect for c in cs)
    soil = 0.6 * mean(suit) + 0.4 * (50 + 50 * clamp(effect / 1.5, -1, 1))
    chain = ([crops[inp["prev"]]] if inp.get("prev") in crops else []) + cs
    for a, b in zip(chain, chain[1:]):
        if a.legume and b.family == "cereal":
            soil += rules["after_legume_bonus"]
    soil = clamp(soil)

    income = mean((c.income_index - 1) * 25 for c in cs)

    rm, sat = rules["risk_mix"], rules["heat_days_saturation"]
    risks = []
    for c, mm in zip(cs, irr):
        water_risk = clamp(100 * mm / rules["water_score_zero_at_mm"]
                           * rules["risk_shortage_factor"][short]
                           * rules["risk_snow_factor"][snow_label]
                           * (1 - 0.5 * c.drought_tolerance))
        heat_risk = 100 * c.heat_sensitivity * min(1.0, ctx["heat"] / sat)
        margin = ctx["ffd"] - c.min_ffd
        frost_risk = clamp((rules["ffd_margin_days"] - margin) * 5)
        risks.append(rm["water"] * water_risk + rm["heat"] * heat_risk + rm["frost"] * frost_risk)
    risk = clamp(mean(risks))

    w = rules["weights"][inp["priority"]]
    m = rules["snow_multiplier"][snow_label] * rules["shortage_multiplier"][short]
    total = (w["a"] * m * water + w["b"] * soil + w["c"] * income + w["d"] * (100 - risk)) / (w["a"] * m + w["b"] + w["c"] + w["d"])

    area = ctx["area_ha"]
    m3 = round(mean(irr) * rules["m3_per_mm_ha"] * area) if inp["source"] != "none" else 0
    return {
        "key": plan_key(seq), "years": list(seq),
        "scores": {"water": round(water), "soil": round(soil), "income": round(income), "risk": round(risk)},
        "total": round(total, 2),
        "water_m3_year": m3,
        "deficit_mm": round(mean(irr)) if inp["source"] == "none" else 0,
    }


def reasons_for(plan, inp, ctx, rules):
    crops = load_crops()
    cs = [crops[c] for c in plan["years"]]
    s = plan["scores"]
    out = []
    legume = next((c for c in cs if c.legume), None)
    if inp["source"] == "none" and s["water"] < 50:
        out.append({"code": "rainfed_deficit", "params": {"mm": plan["deficit_mm"]}})
    if snow_applies(inp["source"], rules) and ctx["snow"]["label"] == "low" and s["water"] >= 55:
        out.append({"code": "snow_low_saves_water", "params": {}})
    if s["water"] >= 70:
        out.append({"code": "low_water", "params": {"m3": plan["water_m3_year"]}})
    if legume:
        out.append({"code": "legume_soil", "params": {"crop": legume.id}})
    if inp.get("prev") in crops and crops[inp["prev"]].legume and cs[0].family == "cereal":
        out.append({"code": "after_legume", "params": {"prev": inp["prev"], "crop": cs[0].id}})
    if s["income"] >= 60:
        out.append({"code": "high_income", "params": {}})
    if s["soil"] >= 75:
        out.append({"code": "fits_soil", "params": {"texture": ctx["soil"]["texture"]}})
    if ctx["heat"] >= 10 and s["risk"] <= 35:
        out.append({"code": "heat_tolerant", "params": {"days": ctx["heat"]}})
    if s["water"] < 40 and inp["source"] != "none":
        out.append({"code": "high_water", "params": {"m3": plan["water_m3_year"]}})
    if s["risk"] >= 55:
        out.append({"code": "high_risk", "params": {}})
    if not out:
        out.append({"code": "balanced", "params": {}})
    # Lead with what matters for the chosen priority.
    lead = {"water": ("snow_low_saves_water", "low_water"), "income": ("high_income",),
            "soil": ("legume_soil", "after_legume", "fits_soil")}[inp["priority"]]
    out.sort(key=lambda r: 0 if r["code"] in lead else 1)
    return out


def different_enough(a, b, rules):
    diff = sum(x != y for x, y in zip(a, b))
    return diff >= rules["min_years_different"] and sorted(a) != sorted(b)


def weakest(scores):
    dims = {"water": scores["water"], "soil": scores["soil"], "income": scores["income"], "risk": 100 - scores["risk"]}
    return min(dims, key=dims.get)


def make_plans(inp, ctx):
    """Step 4: pick the best 3 plans that are different enough from each other and from `exclude`.

    inp: prev, source, water, soil, priority, exclude
    ctx: ffd, rain, heat, soil{texture, ph}, snow{label}, area_ha
    """
    rules = load_rules()
    crops, excluded = filter_crops(ctx, rules)
    ids = sorted(c.id for c in crops)
    years = rules["years"]
    scored = [score_plan(seq, inp, ctx, rules)
              for seq in itertools.product(ids, repeat=years) if valid_sequence(list(seq), inp.get("prev"))]
    scored.sort(key=lambda p: (-p["total"], p["key"]))

    shown = [k.split("-") for k in inp.get("exclude", [])]
    shown_keys = set(inp.get("exclude", []))
    n = rules["plans_per_page"]
    picked = []
    for strict in (True, False):
        for p in scored:
            if len(picked) == n:
                break
            if p["key"] in shown_keys or any(p["key"] == q["key"] for q in picked):
                continue
            others = [q["years"] for q in picked] + (shown if strict else [])
            if all(different_enough(p["years"], o, rules) for o in others):
                picked.append(p)
    for p in picked:
        p["reasons"] = reasons_for(p, inp, ctx, rules)

    # Crops that made it through filtering but appear in none of the picked plans.
    in_plans = {c for p in picked for c in p["years"]} | {c for s in shown for c in s}
    for cid in ids:
        if cid in in_plans:
            continue
        single = [p for p in scored if cid in p["years"]]
        if single:
            excluded.append({"crop": cid, "code": f"weak_{weakest(single[0]['scores'])}", "params": {}})

    return {"plans": picked, "excluded": excluded, "has_more": len(scored) > len(shown_keys) + len(picked),
            "snow_used": snow_applies(inp["source"], rules)}

from suuplan import scoring

CTX = {"ffd": 170, "rain": 220, "heat": 8, "soil": {"texture": "medium", "ph": 7.4},
       "snow": {"label": "low"}, "area_ha": 2.0}


def inp(**kw):
    base = {"prev": "wheat", "source": "river", "water": "sometimes", "soil": "medium", "priority": "water", "exclude": []}
    return {**base, **kw}


def test_three_distinct_plans():
    r = scoring.make_plans(inp(), CTX)
    plans = r["plans"]
    assert len(plans) == 3
    for i, a in enumerate(plans):
        for b in plans[i + 1:]:
            assert scoring.different_enough(a["years"], b["years"], scoring.load_rules())


def test_rotation_rules():
    for p in scoring.make_plans(inp(prev="beans"), CTX)["plans"]:
        seq = p["years"]
        assert seq[0] != "beans"
        assert not scoring.load_crops()[seq[0]].legume  # no legume after legume
        assert sum(scoring.load_crops()[c].legume for c in seq) <= 1


def test_rice_excluded():
    r = scoring.make_plans(inp(), CTX)
    assert any(e["crop"] == "rice" and e["code"] == "no_water_data" for e in r["excluded"])
    assert all("rice" not in p["years"] for p in r["plans"])


def test_short_ffd_excludes_cotton():
    r = scoring.make_plans(inp(), {**CTX, "ffd": 120})
    assert any(e["crop"] == "cotton" and e["code"] == "short_ffd" for e in r["excluded"])


def test_deterministic():
    assert scoring.make_plans(inp(), CTX) == scoring.make_plans(inp(), CTX)


def test_snow_ignored_for_well():
    a = scoring.make_plans(inp(source="well"), {**CTX, "snow": {"label": "low"}})
    b = scoring.make_plans(inp(source="well"), {**CTX, "snow": {"label": "high"}})
    assert a["plans"] == b["plans"]


def test_snow_matters_for_river():
    a = scoring.make_plans(inp(), {**CTX, "snow": {"label": "low"}})["plans"]
    b = scoring.make_plans(inp(), {**CTX, "snow": {"label": "high"}})["plans"]
    assert [p["total"] for p in a] != [p["total"] for p in b]


def test_more_options_do_not_repeat():
    first = scoring.make_plans(inp(), CTX)["plans"]
    keys = [p["key"] for p in first]
    second = scoring.make_plans(inp(exclude=keys), CTX)["plans"]
    assert second and not set(keys) & {p["key"] for p in second}


def test_priority_changes_order():
    w = scoring.make_plans(inp(priority="water"), CTX)["plans"][0]["key"]
    i = scoring.make_plans(inp(priority="income"), CTX)["plans"][0]["key"]
    assert w != i


def test_water_volume_scales_with_area():
    a = scoring.make_plans(inp(), CTX)["plans"][0]
    b = scoring.make_plans(inp(), {**CTX, "area_ha": 4.0})["plans"][0]
    assert a["key"] == b["key"] and abs(b["water_m3_year"] - 2 * a["water_m3_year"]) <= 1


def test_baseline_is_wheat_every_year():
    r = scoring.make_plans(inp(), CTX)
    rules = scoring.load_rules()
    wheat = scoring.load_crops()["wheat"]
    expected = round(scoring.irrigation_mm(wheat, CTX["rain"], rules) * 10 * CTX["area_ha"])
    assert r["baseline"] == {"crop": "wheat", "water_m3_year": expected}
    assert scoring.make_plans(inp(source="none"), CTX)["baseline"]["water_m3_year"] == 0


def test_natural_water_rain_and_soil_at_sowing():
    gwet = {f"{m:02d}{d:02d}": 0.6 for m in range(1, 13) for d in range(1, 32)}
    plan = scoring.make_plans(inp(), {**CTX, "gwet": gwet})["plans"][0]
    nat = plan["natural"]
    assert nat["rain_m3"] == CTX["rain"] * 10 * CTX["area_ha"]
    assert nat["sow_crop"] == plan["years"][0]
    # medium soil (loam): min(0.6 * 0.463, 0.25) - 0.12 = 0.13 m3/m3 over 1 m -> 130 mm
    assert nat["soil_mm"] == 130 and nat["soil_m3"] == round(130 * 10 * CTX["area_ha"])


def test_natural_water_without_wetness_data():
    nat = scoring.make_plans(inp(), CTX)["plans"][0]["natural"]
    assert nat["soil_m3"] is None and nat["rain_m3"] > 0


def test_summarize_power_soil_wetness_by_day():
    from suuplan.climate import summarize_power
    days = [f"{y}{m:02d}{d:02d}" for y in (2023, 2024) for m in range(1, 13) for d in range(1, 29)]
    daily = {"T2M_MIN": {k: 5.0 for k in days}, "T2M_MAX": {k: 20.0 for k in days},
             "PRECTOTCORR": {k: 1.0 for k in days},
             "GWETROOT": {k: (0.4 if k.startswith("2023") else 0.6) for k in days} | {"20240415": -999.0}}
    s = summarize_power(daily, [2023, 2024])
    assert s["gwet"]["0101"] == 0.5 and s["gwet"]["0415"] == 0.4  # fill value skipped


def test_by_year_rows_add_up():
    plan = scoring.make_plans(inp(), CTX)["plans"][0]
    rows = plan["by_year"]
    assert [r["crop"] for r in rows] == plan["years"]
    assert all(r["sow_date"] for r in rows)
    crops = scoring.load_crops()
    assert all(r["sow_cited"] == bool(crops[r["crop"]].sow_source) for r in rows)
    assert abs(sum(r["water_m3"] for r in rows) - plan["water_m3_total"]) <= 3
    assert abs(plan["water_m3_total"] - 3 * plan["water_m3_year"]) <= 3
    rainfed = scoring.make_plans(inp(source="none"), CTX)["plans"][0]
    assert rainfed["water_m3_total"] == 0 and all(r["water_m3"] == 0 and r["deficit_mm"] >= 0 for r in rainfed["by_year"])


def test_every_basin_names_its_mountains():
    from suuplan.geo import basins
    assert all(b["mountains"] and set(b["mountains"]) == {"en", "ru", "ky"} for b in basins())


def test_delivery_estimate_losses_and_cap():
    from suuplan import delivery
    rules = scoring.load_rules()
    d = delivery.estimate(42.83, 74.55, 5.0, "medium", "chui", rules)  # Chui valley: more farmland than river water
    assert d["pressure_pct"] > 100 and d["per_ha_m3"] < d["avg_ha_m3"]
    assert d["intake_m3"] > d["gate_m3"] > d["useful_m3"] > 0
    assert d["useful_m3"] == round(d["gate_m3"] * rules["field_efficiency"])
    assert abs(d["basin_need_m3"] / d["river_m3"] * 100 - d["pressure_pct"]) < 1
    sandy = delivery.estimate(42.83, 74.55, 5.0, "sandy", "chui", rules)
    assert sandy["canal_eff"] < d["canal_eff"]  # leakier canal bed
    assert delivery.estimate(42.83, 74.55, 5.0, "medium", "nowhere", rules) is None


def test_short_delivery_overrides_enough_answer():
    tight = {**CTX, "delivery": {"useful_m3": 100}}  # far less than any plan needs
    plain = scoring.make_plans(inp(water="enough"), CTX)["plans"]
    short = scoring.make_plans(inp(water="enough"), tight)["plans"]
    assert all(p["supply"]["level"] == "often" for p in short)
    assert all(any(r["code"] == "delivery_short" for r in p["reasons"]) for p in short)
    assert [p["total"] for p in short] != [p["total"] for p in plain]
    assert all(p["supply"] is None for p in scoring.make_plans(inp(source="well"), tight)["plans"])


def test_plenty_of_delivery_keeps_farmer_answer():
    rich = {**CTX, "delivery": {"useful_m3": 10**9}}
    a = scoring.make_plans(inp(water="often"), CTX)["plans"]
    b = scoring.make_plans(inp(water="often"), rich)["plans"]
    assert [p["total"] for p in a] == [p["total"] for p in b]


def test_every_district_found():
    from suuplan.geo import district_for_point, districts
    assert len(districts()) == 41 and len({d["id"] for d in districts()}) == 41
    assert district_for_point(42.87, 74.59)["region"] == "chui"  # Bishkek, a gap in the district map
    assert district_for_point(40.53, 72.80)["region"] == "osh"


def test_supply_per_year_follows_each_crop():
    d = {"useful_m3": 9000}
    plan = scoring.make_plans(inp(), {**CTX, "delivery": d})["plans"][0]
    for r in plan["by_year"]:
        assert r["supply_pct"] == min(999, round(d["useful_m3"] / r["water_m3"] * 100)) if r["water_m3"] else 999
        assert r["supply_level"] in scoring.WATER
    well = scoring.make_plans(inp(source="well"), {**CTX, "delivery": d})["plans"][0]
    assert all("supply_pct" not in r for r in well["by_year"])

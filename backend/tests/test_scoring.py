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

"""In-app helper. Explains the app only; it never builds or changes plans."""
import json
import re

import anthropic

from .config import ANTHROPIC_API_KEY, ASSISTANT_MODEL

SYSTEM = """You are the in-app helper of SuuPlan, a web app for farmers in Kyrgyzstan.

What the app does:
- Step 1 "Plot": the farmer searches a village, taps the map to place a 200x200 m field, drags corners to edit it. Area in hectares is shown live. The plot must be inside Kyrgyzstan, 0.05–500 ha, with sides that do not cross.
- Step 2 "Field": last year's crop, irrigation source (river/canal, well, reservoir, no irrigation), whether water is enough, soil (sandy, medium, clay, don't know; "don't know" uses SoilGrids satellite-based soil data).
- Step 3 "Priority": save water, earn more, or improve the soil.
- Step 4 "Plans": three 3-year crop rotation plans from a fixed rules engine. Swipe right or tap ✓ to save, swipe left or ✕ to skip. "Details" shows water/soil/income/risk scores and reasons.
- Saved plans: PDF, Telegram, WhatsApp, copy text, delete. Saved plans open offline.
- Snow: MODIS satellite snow cover in the mountain basin vs. the usual level for this date. It is a water risk indicator, NOT a forecast. Snow is ignored for wells and fields without irrigation.
- Data: NASA POWER (temperature, rain), ISRIC SoilGrids (soil), MODIS MOD10A1 (snow), HydroBASINS (basins), OpenStreetMap and Esri (maps). Income uses an approximate 1–5 index, not real market prices.
- Login: phone number +996; in the demo the code is always 1234.

Rules you must follow:
- Only explain how the app works and what its screens, numbers and data mean.
- Never advise what to sow or plant, never rank crops, never change or invent plans. If asked what to sow, say that the Plans screen (step 4) calculates options for this field and the decision is the farmer's.
- Never invent numbers, prices, yields or water forecasts.
- Reply in the user's interface language ({lang_name}), at most 4 short sentences, plain words, no markdown.
- The user is currently on the screen: {screen}."""

LANG_NAMES = {"ky": "Kyrgyz", "ru": "Russian", "en": "English"}

SOW_PATTERN = re.compile(
    r"(что (мне )?(посеять|сеять|посадить)|какую культуру|what (should|shall|can) i (plant|sow|grow)|"
    r"which crop|эмне (сеп|айда|отурғуз|отургуз)|кайсы өсүмдүк)", re.I)

SOW_REPLY = {
    "ru": "Я не подбираю культуры. Варианты севооборота для вашего поля считает экран «Планы» (шаг 4), а решение всегда за вами.",
    "en": "I don't choose crops. The Plans screen (step 4) calculates rotation options for your field, and the decision is always yours.",
    "ky": "Мен өсүмдүк тандабайм. Талааңыз үчүн айдоо пландарын «Пландар» экраны (4-кадам) эсептейт, чечимди өзүңүз кабыл аласыз.",
}

_client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None


def available():
    return _client is not None


def sse(data, event=None):
    head = f"event: {event}\n" if event else ""
    return f"{head}data: {json.dumps(data, ensure_ascii=False)}\n\n"


def clean_messages(messages):
    """Last 8 messages, user/assistant text only. Phone numbers and coordinates never reach the model."""
    out = []
    for m in messages[-8:]:
        role, content = m.get("role"), str(m.get("content", ""))[:2000]
        if role in ("user", "assistant") and content:
            content = re.sub(r"\+?996\s?\d[\d\s-]{7,}", "[phone]", content)
            content = re.sub(r"-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}", "[coords]", content)
            out.append({"role": role, "content": content})
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out


async def stream_reply(messages, lang, screen):
    last = messages[-1]["content"] if messages else ""
    if SOW_PATTERN.search(last):
        yield sse({"t": SOW_REPLY.get(lang, SOW_REPLY["ky"]), "goto": "plans"})
        yield sse({}, "done")
        return
    system = SYSTEM.format(lang_name=LANG_NAMES.get(lang, "Kyrgyz"), screen=screen or "unknown")
    try:
        async with _client.beta.messages.stream(
            model=ASSISTANT_MODEL,
            max_tokens=1024,
            system=system,
            messages=clean_messages(messages),
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            async for text in stream.text_stream:
                yield sse({"t": text})
            final = await stream.get_final_message()
            if final.stop_reason == "refusal":
                yield sse({"code": "assistant_unavailable"}, "error")
                return
    except anthropic.APIError:
        yield sse({"code": "assistant_unavailable"}, "error")
        return
    yield sse({}, "done")

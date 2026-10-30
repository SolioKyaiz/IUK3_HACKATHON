import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, chatStream } from "../api";
import { setState, useStore } from "../store";
import { useT, faqFor } from "../i18n";
import Icon from "./Icons";

const MAX = 500;
const FIRST_CHUNK_MS = 15000; // a sleeping free-tier server must never leave the chat hanging
const SOW = /(что (мне )?(посеять|сеять|посадить)|какую культуру|what (should|shall|can) i (plant|sow|grow)|which crop|эмне (сеп|айда|отург)|кайсы өсүмдүк)/i;

// null = not checked yet, true/false = whether the server has an AI key. Checked once per page load.
let aiAvailable = null;
let aiCheck = null;
function checkAi() {
  if (!aiCheck) {
    aiCheck = api("/health")
      .then((h) => { aiAvailable = Boolean(h?.assistant); })
      .catch(() => { aiAvailable = false; aiCheck = null; });
  }
  return aiCheck;
}

// Words too common to say anything about the topic (ru / en / ky).
const STOP = new Set(("как что где когда это мне мой моя меня вы вас ваш на по для или и не да у в во за из от до " +
  "сколько какой какая какие почему зачем есть будет можно нужно " +
  "how what why when where which who is are the a an to of in on for my me i do does can it this that and or " +
  "кантип эмне качан кайда канча бул мен менин сиз жана үчүн").split(" "));
const words = (s) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.slice(0, 4));

// Best FAQ entry for a free-text question by shared word stems:
// keywords (faq.json "k") count 3, question words 2, answer words 1.
function matchFaq(list, text) {
  const q = new Set(words(text));
  let best = null, bestScore = 0;
  for (const item of list) {
    const inK = new Set(words(item.k || "")), inQ = new Set(words(item.q)), inA = new Set(words(item.a));
    let score = 0, topical = 0;
    for (const w of q) {
      if (inK.has(w) || inQ.has(w)) topical++;
      score += (inK.has(w) ? 3 : 0) + (inQ.has(w) ? 2 : 0) + (inA.has(w) ? 1 : 0);
    }
    // An answer is only offered when the question shares a topic word with it.
    if (topical > 0 && score > bestScore) { best = item; bestScore = score; }
  }
  return bestScore >= 3 ? best : null;
}

export default function Assistant() {
  const t = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const open = useStore((s) => s.assistantOpen);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(aiAvailable);
  const ctrl = useRef(null);
  const list = useRef(null);
  const input = useRef(null);
  const faq = faqFor(t.lang);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => {
    if (!open) return;
    checkAi().then(() => setAi(aiAvailable));
  }, [open]);
  useEffect(() => {
    const off = () => setAi(false);
    window.addEventListener("offline", off);
    return () => window.removeEventListener("offline", off);
  }, []);
  if (!open) return null;

  const close = () => { ctrl.current?.abort(); setState({ assistantOpen: false }); };
  const add = (...m) => setMsgs((prev) => [...prev, ...m]);

  const localAnswer = (q, note) => {
    if (SOW.test(q)) return add({ role: "assistant", content: t("assistant.sow"), goto: "plans", local: true });
    const hit = matchFaq(faq, q);
    add({ role: "assistant", content: hit ? hit.a : t("assistant.noMatch"), note, local: true });
  };

  // Ready questions are answered on the spot: the answers ship with the app.
  const askFaq = (item) => {
    if (busy) return;
    add({ role: "user", content: item.q, local: true }, { role: "assistant", content: item.a, local: true });
  };

  const ask = async (q) => {
    q = q.trim();
    if (!q || busy) return;
    if (q.length > MAX) return add({ role: "assistant", content: t("assistant.tooLong"), local: true });
    const history = [...msgs.filter((m) => !m.local), { role: "user", content: q }];
    add({ role: "user", content: q });
    setText("");
    if (ai !== true || !navigator.onLine) return localAnswer(q);

    setBusy(true);
    const c = new AbortController();
    ctrl.current = c;
    let timedOut = false;
    let timer = setTimeout(() => { timedOut = true; c.abort(); }, FIRST_CHUNK_MS);
    let started = false;
    try {
      const res = await chatStream({ messages: history.map(({ role, content }) => ({ role, content })), lang: t.lang, screen: loc.pathname.slice(1) }, c.signal);
      if (!res.ok || !res.body) throw new Error("unavailable");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = JSON.parse(/^data: (.*)$/m.exec(block)?.[1] || "{}");
          if (event === "error") throw new Error("unavailable");
          if (!data.t && !data.goto) continue;
          if (!started) { started = true; clearTimeout(timer); add({ role: "assistant", content: "" }); }
          setMsgs((m) => {
            const last = m[m.length - 1];
            return [...m.slice(0, -1), { ...last, content: last.content + (data.t || ""), goto: data.goto || last.goto }];
          });
        }
      }
    } catch (e) {
      const userStopped = e.name === "AbortError" && !timedOut;
      if (!userStopped) {
        aiAvailable = false;
        setAi(false);
        setMsgs((m) => (m[m.length - 1]?.role === "assistant" && !m[m.length - 1].content ? m.slice(0, -1) : m));
        if (!started) localAnswer(q, timedOut ? t("assistant.slow") : null);
      }
    } finally {
      clearTimeout(timer);
      setBusy(false);
      ctrl.current = null;
      input.current?.focus();
    }
  };

  return (
    <div className="assistant" role="dialog" aria-label={t("assistant.title")}>
      <div className="dialog-head">
        <div className="assistant-title">
          <span className="assistant-mark" aria-hidden="true"><Icon name="chat" size={18} /></span>
          <div>
            <h2>{t("assistant.title")}</h2>
            <p className="muted small">{t("assistant.note")}</p>
          </div>
        </div>
        <button className="icon-btn close" onClick={close} aria-label={t("assistant.close")}><Icon name="close" /></button>
      </div>
      <div className="chips" data-no-sheet-drag>
        {faq.map((f) => (
          <button key={f.q} className="chip" disabled={busy} onClick={() => askFaq(f)}>{f.q}</button>
        ))}
      </div>
      <div className="chat" ref={list} aria-live="polite">
        <div className="msg msg-assistant">{t("assistant.welcome")}</div>
        {msgs.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.note && <span className="msg-note">{m.note}</span>}
            {m.content}
            {m.goto === "plans" && (
              <button className="btn small secondary" onClick={() => { close(); nav("/priority"); }}>{t("assistant.goPlans")}</button>
            )}
          </div>
        ))}
        {busy && (
          <div className="msg msg-assistant typing" aria-label={t("assistant.typing")}>
            <span className="dot" /><span className="dot" /><span className="dot" />
          </div>
        )}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <input ref={input} value={text} maxLength={MAX} onChange={(e) => setText(e.target.value)} placeholder={t("assistant.placeholder")} aria-label={t("assistant.placeholder")} />
        {busy
          ? <button type="button" className="icon-btn" onClick={() => ctrl.current?.abort()} aria-label={t("assistant.stop")} title={t("assistant.stop")}><Icon name="stop" /></button>
          : <button className="icon-btn primary" disabled={!text.trim()} aria-label={t("assistant.send")} title={t("assistant.send")}><Icon name="send" /></button>}
      </form>
    </div>
  );
}

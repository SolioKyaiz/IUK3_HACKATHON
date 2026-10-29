import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { chatStream } from "../api";
import { setState, useStore } from "../store";
import { useT, faqFor } from "../i18n";
import Icon from "./Icons";

const MAX = 500;
const SOW = /(что (мне )?(посеять|сеять|посадить)|какую культуру|what (should|shall|can) i (plant|sow|grow)|which crop|эмне (сеп|айда|отург)|кайсы өсүмдүк)/i;

// Best FAQ match by shared words, used when the API is unavailable.
function matchFaq(list, text) {
  const words = (s) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));
  const q = words(text);
  let best = null, score = 0;
  for (const item of list) {
    const w = words(item.q + " " + item.a);
    const s = [...q].filter((x) => [...w].some((y) => y.startsWith(x.slice(0, 5)))).length;
    if (s > score) { best = item; score = s; }
  }
  return best;
}

export default function Assistant() {
  const t = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const open = useStore((s) => s.assistantOpen);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [faqMode, setFaqMode] = useState(!navigator.onLine);
  const ctrl = useRef(null);
  const list = useRef(null);
  const faq = faqFor(t.lang);

  useEffect(() => { list.current?.scrollTo(0, list.current.scrollHeight); }, [msgs]);
  useEffect(() => {
    const off = () => setFaqMode(true);
    window.addEventListener("offline", off);
    return () => window.removeEventListener("offline", off);
  }, []);
  if (!open) return null;

  const close = () => { ctrl.current?.abort(); setState({ assistantOpen: false }); };
  const reply = (content, extra = {}) => setMsgs((m) => [...m, { role: "assistant", content, ...extra }]);

  const localAnswer = (q) => {
    if (SOW.test(q)) return reply(t("assistant.sow"), { goto: "plans" });
    const hit = matchFaq(faq, q);
    reply(hit ? hit.a : faq.map((f) => "• " + f.q).join("\n"));
  };

  const ask = async (q) => {
    q = q.trim();
    if (!q || busy) return;
    if (q.length > MAX) return reply(t("assistant.tooLong"));
    const history = [...msgs.filter((m) => !m.local), { role: "user", content: q }];
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setText("");
    if (faqMode) return localAnswer(q);

    setBusy(true);
    ctrl.current = new AbortController();
    try {
      const res = await chatStream({ messages: history.map(({ role, content }) => ({ role, content })), lang: t.lang, screen: loc.pathname.slice(1) }, ctrl.current.signal);
      if (!res.ok || !res.body) throw new Error("unavailable");
      setMsgs((m) => [...m, { role: "assistant", content: "" }]);
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
          if (data.t || data.goto) {
            setMsgs((m) => {
              const last = m[m.length - 1];
              return [...m.slice(0, -1), { ...last, content: last.content + (data.t || ""), goto: data.goto || last.goto }];
            });
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setFaqMode(true);
        setMsgs((m) => (m[m.length - 1]?.role === "assistant" && !m[m.length - 1].content ? m.slice(0, -1) : m));
        localAnswer(q);
      }
    } finally {
      setBusy(false);
      ctrl.current = null;
    }
  };

  return (
    <div className="assistant" role="dialog" aria-label={t("assistant.title")}>
      <div className="dialog-head">
        <h2>{t("assistant.title")}</h2>
        <button className="icon-btn close" onClick={close} aria-label={t("assistant.close")}><Icon name="close" /></button>
      </div>
      <p className="muted small">{t("assistant.note")}{faqMode && ` · ${t("assistant.faqMode")}`}</p>
      <div className="chips" data-no-sheet-drag>
        {faq.map((f) => (
          <button key={f.q} className="chip" onClick={() => {
            if (faqMode) { setMsgs((m) => [...m, { role: "user", content: f.q, local: true }, { role: "assistant", content: f.a, local: true }]); }
            else ask(f.q);
          }}>{f.q}</button>
        ))}
      </div>
      <div className="chat" ref={list} aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.content || <span className="typing">…</span>}
            {m.goto === "plans" && (
              <button className="btn small" onClick={() => { close(); nav("/priority"); }}>{t("assistant.goPlans")}</button>
            )}
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <input value={text} maxLength={MAX} onChange={(e) => setText(e.target.value)} placeholder={t("assistant.placeholder")} aria-label={t("assistant.placeholder")} />
        {busy
          ? <button type="button" className="icon-btn" onClick={() => ctrl.current?.abort()} aria-label={t("assistant.stop")} title={t("assistant.stop")}><Icon name="stop" /></button>
          : <button className="icon-btn primary" disabled={!text.trim()} aria-label={t("assistant.send")} title={t("assistant.send")}><Icon name="send" /></button>}
      </form>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useT } from "../i18n";
import Icon from "./Icons";

let deferred = null;
const subs = new Set();
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e;
  subs.forEach((f) => f());
});

// "Add to home screen": Android/desktop Chrome show the native prompt; iOS Safari has no API,
// so the button explains the Share → Add to Home Screen path instead.
export function InstallButton() {
  const t = useT();
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); subs.add(f); return () => subs.delete(f); }, []);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (standalone || (!deferred && !ios)) return null;
  return (
    <div className="install">
      {deferred ? (
        <button className="btn ghost block" onClick={async () => { deferred.prompt(); await deferred.userChoice; deferred = null; force((x) => x + 1); }}>
          <Icon name="download" size={18} /> {t("app.install")}
        </button>
      ) : (
        <p className="hint"><Icon name="share" size={16} /> {t("app.install")}: {t("app.installIos")}</p>
      )}
    </div>
  );
}

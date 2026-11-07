import { useEffect, useState } from "react";
import { api } from "../api";
import { useStore } from "../store";
import { useT } from "../i18n";
import Step from "../components/Step";
import Icon from "../components/Icons";
import { centroidOf, fromGeoJSON } from "../lib/geo";

// Ministry farmer hotline (Ministry of Water Resources, Agriculture and Processing Industry, 24.kg, 16 Apr 2026).
const HOTLINE = "1210";
const REGIONS = ["batken", "chui", "issykkul", "jalalabad", "naryn", "osh", "talas"];

// District agronomist contacts: the district of the selected plot, or one the farmer picks.
// Contacts come from backend data/agronomists.csv; districts without a verified one point to the hotline.
export default function AgronomistPage() {
  const t = useT();
  const { plots, plotId } = useStore((s) => s);
  const plot = plots.find((p) => p.id === plotId);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    const [lat, lon] = plot ? centroidOf(fromGeoJSON(plot.geometry)) : [];
    const q = plot ? `?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}` : "";
    setErr(null);
    api(`/agronomists${q}`).then(setData).catch((e) => setErr(e.code));
  }, [plot?.id]);

  const name = (d) => d.name[t.lang] || d.name.ru;
  const id = picked || data?.here;
  const district = data?.districts.find((d) => d.id === id);

  return (
    <Step title={t("agro.title")}>
      <p className="lead">{t("agro.intro")}</p>

      <div className="notice-card agro-hotline">
        <Icon name="phone" />
        <div>
          <span className="notice-title">{t("agro.hotline")}: {HOTLINE}</span>
          <span className="notice-meta">{t("agro.hotlineInfo")}</span>
          <span className="muted tiny">{t("agro.hotlineSource")}</span>
          <a className="btn primary small agro-call" href={`tel:${HOTLINE}`}><Icon name="phone" size={16} /> {t("agro.call")} {HOTLINE}</a>
        </div>
      </div>

      {err && <p className="notice">{t(`err.${err}`)}</p>}
      {data && (
        <>
          <label className="agro-pick">
            <span className="small muted">{t("agro.pick")}</span>
            <select value={id || ""} onChange={(e) => setPicked(e.target.value || null)}>
              {!id && <option value="">—</option>}
              {REGIONS.map((r) => (
                <optgroup key={r} label={t(`region.${r}`)}>
                  {data.districts.filter((d) => d.region === r).map((d) => <option key={d.id} value={d.id}>{name(d)}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          {district && <DistrictCard d={district} name={name(district)} fromPlot={!picked && plot ? plot.name : null} />}
        </>
      )}
    </Step>
  );
}

function DistrictCard({ d, name, fromPlot }) {
  const t = useT();
  const tg = d.telegram?.replace(/^@/, "");
  return (
    <section className="agro-card">
      <span className="muted small">{t("agro.yourDistrict")}{fromPlot && ` · ${t("agro.fromPlot", { name: fromPlot })}`}</span>
      <strong className="agro-name">{name}</strong>
      <span className="muted small">{t(`region.${d.region}`)}</span>
      {d.phone || tg ? (
        <>
          {d.contact_name && <span>{d.contact_name}</span>}
          <div className="agro-actions">
            {d.phone && <a className="btn secondary small" href={`tel:${d.phone.replace(/[^\d+]/g, "")}`}><Icon name="phone" size={16} /> {d.phone}</a>}
            {tg && <a className="btn secondary small" href={`https://t.me/${tg}`} target="_blank" rel="noopener">Telegram @{tg}</a>}
          </div>
          {d.source && <span className="muted tiny">{t("agro.source", { source: d.source })}</span>}
        </>
      ) : (
        <p className="small">{t("agro.noContact", { district: name })}</p>
      )}
    </section>
  );
}

import { useT } from "../i18n";
import Step from "../components/Step";
import Icon from "../components/Icons";
import { InstallButton } from "../components/Install";
import { OnboardingButton } from "../components/Onboarding";

// Each source with its real status today: live API data, synthetic demo data,
// approximate values or fixed reference data.
const SOURCES = [
  ["power", "data", "live"],
  ["soilgrids", "sprout", "live"],
  ["modis", "snow", "demo"],
  ["hydrobasins", "drop", "demo"],
  ["osm", "field", "live"],
  ["border", "pin", "reference"],
  ["crops", "plans", "approx"],
];

export default function DataPage() {
  const t = useT();
  return (
    <Step title={t("data.title")}>
      <p className="lead">{t("data.intro")}</p>
      <ul className="source-list">
        {SOURCES.map(([k, icon, status]) => (
          <li key={k} className="source">
            <span className="source-icon" aria-hidden="true"><Icon name={icon} size={20} /></span>
            <div className="source-body">
              <div className="source-head">
                <strong>{t(`data.name.${k}`)}</strong>
                <span className={`status status-${status}`}>{status === "demo" ? t("app.demo") : t(`data.status.${status}`)}</span>
              </div>
              <p>{t(`data.${k}`)}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="notice">{t("data.demo")}</p>
      <p className="hint">{t("app.hint")}</p>
      <div className="section-actions">
        <OnboardingButton />
        <InstallButton />
      </div>
    </Step>
  );
}

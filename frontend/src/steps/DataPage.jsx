import { useT } from "../i18n";
import Step from "../components/Step";
import { InstallButton } from "../components/Install";
import { OnboardingButton } from "../components/Onboarding";

export default function DataPage() {
  const t = useT();
  return (
    <Step title={t("data.title")}>
      <OnboardingButton />
      <p>{t("data.intro")}</p>
      <ul className="data-list">
        {["power", "soilgrids", "modis", "hydrobasins", "osm", "border", "crops"].map((k) => <li key={k}>{t(`data.${k}`)}</li>)}
      </ul>
      <p className="notice">{t("data.demo")}</p>
      <p className="muted small">{t("app.hint")}</p>
      <InstallButton />
    </Step>
  );
}

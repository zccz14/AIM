import { Languages } from "lucide-react";

import { useI18n } from "../../lib/i18n.js";
import { Button } from "./button.js";

export const LanguageToggle = () => {
  const { locale, t, toggleLocale } = useI18n();
  const isChinese = locale === "zh";

  return (
    <Button
      aria-label={isChinese ? t("switchToEnglish") : t("switchToChinese")}
      onClick={toggleLocale}
      size="sm"
      variant="outline"
    >
      <Languages data-icon="inline-start" />
      <span>{isChinese ? "EN" : "中文"}</span>
    </Button>
  );
};

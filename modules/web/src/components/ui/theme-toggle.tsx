import { MoonStar, SunMedium } from "lucide-react";

import { useI18n } from "../../lib/i18n.js";
import { Button } from "./button.js";
import { useTheme } from "./theme-provider.js";

export const ThemeToggle = () => {
  const { locale } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark
    ? locale === "zh"
      ? "切换到浅色主题"
      : "Switch to light theme"
    : locale === "zh"
      ? "切换到深色主题"
      : "Switch to dark theme";
  const text = isDark
    ? locale === "zh"
      ? "浅色模式"
      : "Light mode"
    : locale === "zh"
      ? "深色模式"
      : "Dark mode";

  return (
    <Button
      aria-label={label}
      onClick={toggleTheme}
      size="sm"
      variant="outline"
    >
      {isDark ? (
        <SunMedium data-icon="inline-start" />
      ) : (
        <MoonStar data-icon="inline-start" />
      )}
      <span>{text}</span>
    </Button>
  );
};

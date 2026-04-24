import { MoonStar, SunMedium } from "lucide-react";

import { useTheme } from "./theme-provider.js";

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="theme-toggle"
      onClick={toggleTheme}
      type="button"
    >
      {isDark ? <SunMedium size={16} /> : <MoonStar size={16} />}
      <span>{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
};

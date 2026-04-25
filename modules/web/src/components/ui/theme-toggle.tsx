import { MoonStar, SunMedium } from "lucide-react";

import { Button } from "./button.js";
import { useTheme } from "./theme-provider.js";

export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggleTheme}
      variant="theme"
    >
      {isDark ? <SunMedium size={16} /> : <MoonStar size={16} />}
      <span>{isDark ? "Light mode" : "Dark mode"}</span>
    </Button>
  );
};

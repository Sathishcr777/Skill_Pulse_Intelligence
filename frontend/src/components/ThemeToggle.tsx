import React from "react"
import { Sun, Moon } from "lucide-react"
import { useTheme } from "@/lib/theme"

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === "dark"

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggleTheme}
      className="relative inline-flex items-center w-14 h-8 rounded-full border border-border bg-surface-sunken transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span
        className={`absolute top-0.5 left-0.5 flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground shadow-md transition-transform duration-200 ${
          isDark ? "translate-x-6" : "translate-x-0"
        }`}
      >
        {isDark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
      </span>
      <span className="sr-only">{isDark ? "Dark theme active" : "Light theme active"}</span>
    </button>
  )
}

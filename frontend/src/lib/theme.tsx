import React, { createContext, useContext, useEffect, useState, useCallback } from "react"

type Theme = "light" | "dark"

const STORAGE_KEY = "skillpulse-theme"

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "light" || saved === "dark") return saved
  } catch {
    // localStorage unavailable (private browsing, etc.) - fall through
  }
  // No saved preference: respect the OS, but keep this app's dark identity
  // as the fallback when the OS signal is unavailable or neutral.
  if (typeof window !== "undefined" && window.matchMedia) {
    if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light"
  }
  return "dark"
}

/** Wraps the app. Does NOT re-render the whole tree on theme change beyond
 * what consumers of useTheme() actually need - theme is applied via a
 * class on <html>, so most components never need to know the theme at all
 * (they just use semantic Tailwind tokens like bg-card / text-foreground). */
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignore - theme still works for this session, just won't persist
    }
  }, [theme])

  const setTheme = useCallback((t: Theme) => setThemeState(t), [])
  const toggleTheme = useCallback(() => setThemeState((t) => (t === "dark" ? "light" : "dark")), [])

  return <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}

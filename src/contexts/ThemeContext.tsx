"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  // Handle mounting and local storage
  useEffect(() => {
    setMounted(true);

    // Only run on client side
    if (typeof window !== "undefined") {
      const savedTheme = localStorage.getItem("figma-theme") as Theme;
      if (savedTheme) {
        setTheme(savedTheme);
      } else {
        // Check system preference
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
          .matches
          ? "dark"
          : "light";
        setTheme(systemTheme);
      }
    }
  }, []);

  // Apply theme to document
  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;

    const root = window.document.documentElement;

    // Remove both classes first
    root.classList.remove("light", "dark");

    // Add the current theme class
    root.classList.add(theme);

    // Also set data attribute for Figma tokens
    root.setAttribute("data-theme", theme);

    // Sync color-scheme so FigUI3's light-dark() CSS function resolves correctly
    root.style.colorScheme = theme;

    // Save to localStorage
    localStorage.setItem("figma-theme", theme);
  }, [theme, mounted]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

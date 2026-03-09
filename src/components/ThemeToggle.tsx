"use client";

import { useTheme } from "@/contexts/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useTheme();

  // Don't render anything until mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <div className="w-8 h-8 rounded flex items-center justify-center">
        <span className="text-sm">⚪</span>
      </div>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="w-8 h-8 rounded flex items-center justify-center transition-colors"
      onMouseEnter={(e) =>
        (e.currentTarget.style.backgroundColor = "var(--color-bg-hover)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = "transparent")
      }
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "light" ? (
        <span className="text-sm">🌙</span>
      ) : (
        <span className="text-sm">☀️</span>
      )}
    </button>
  );
}

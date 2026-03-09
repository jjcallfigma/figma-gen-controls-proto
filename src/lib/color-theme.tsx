import React from "react";

export interface ColorThemeProps {
  brand?: string;
  children: React.ReactNode;
}

// Simple ColorTheme implementation that just passes through children
// This replaces the missing @fpl/tokens ColorTheme component
export function ColorTheme({ brand, children }: ColorThemeProps) {
  // For now, just render children without any brand-specific styling
  // You can enhance this later to provide actual brand color variables
  return <>{children}</>;
}

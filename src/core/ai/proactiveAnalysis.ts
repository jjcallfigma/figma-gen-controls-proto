/**
 * Lightweight proactive analysis that runs client-side when the user
 * opens the AI panel with a selection. Surfaces quick findings without
 * requiring an LLM call.
 */

import type { CanvasObjectData } from "./designAnalysis";

export interface QuickInsight {
  id: string;
  type: "accessibility" | "consistency" | "structure" | "tip";
  severity: "error" | "warning" | "info";
  title: string;
  description: string;
  objectIds?: string[];
}

// ─── Color utilities (duplicated for client-side independence) ───────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (clean.length >= 6) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }
  return null;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const sRGB = c / 255;
    return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(l1: number, l2: number): number {
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function getFirstSolidColor(
  fills?: Array<{ type: string; color?: string; visible?: boolean }>
): string | null {
  if (!fills) return null;
  for (const fill of fills) {
    if (fill.visible !== false && fill.type === "solid" && fill.color) {
      return fill.color;
    }
  }
  return null;
}

function getAncestorBg(id: string, objects: Record<string, CanvasObjectData>): string {
  let cur = objects[id];
  while (cur?.parentId) {
    cur = objects[cur.parentId];
    if (!cur) break;
    const bg = getFirstSolidColor(cur.fills as any);
    if (bg) return bg;
  }
  return "#FFFFFF";
}

// ─── Quick analysis ─────────────────────────────────────────────────

export function runQuickAnalysis(
  selectedIds: string[],
  objects: Record<string, CanvasObjectData>
): QuickInsight[] {
  const insights: QuickInsight[] = [];
  if (selectedIds.length === 0) return insights;

  // Collect selected objects and descendants
  const allObjects: CanvasObjectData[] = [];
  const collect = (id: string) => {
    const obj = objects[id];
    if (!obj) return;
    allObjects.push(obj);
    obj.childIds?.forEach(collect);
  };
  selectedIds.forEach(collect);

  if (allObjects.length === 0) return insights;

  // ── Quick contrast check ──
  let contrastIssues = 0;
  for (const obj of allObjects) {
    if (obj.type !== "text") continue;
    const textColor = getFirstSolidColor(obj.fills as any) || "#000000";
    const bgColor = getAncestorBg(obj.id, objects);
    const textRgb = hexToRgb(textColor);
    const bgRgb = hexToRgb(bgColor);
    if (!textRgb || !bgRgb) continue;

    const ratio = contrastRatio(
      relativeLuminance(textRgb.r, textRgb.g, textRgb.b),
      relativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b)
    );
    const fontSize = obj.properties?.fontSize || 14;
    const threshold = fontSize >= 18 ? 3 : 4.5;
    if (ratio < threshold) contrastIssues++;
  }

  if (contrastIssues > 0) {
    insights.push({
      id: "contrast",
      type: "accessibility",
      severity: "error",
      title: `${contrastIssues} contrast issue${contrastIssues > 1 ? "s" : ""}`,
      description: "Some text may be hard to read. Ask me to check accessibility for details.",
    });
  }

  // ── Small touch targets ──
  let smallTargets = 0;
  for (const obj of allObjects) {
    if (obj.type !== "frame") continue;
    const name = obj.name.toLowerCase();
    const isInteractive = ["button", "link", "tab", "icon", "toggle", "checkbox", "radio", "input"].some(
      (k) => name.includes(k)
    );
    if (isInteractive && (obj.width < 44 || obj.height < 44)) {
      smallTargets++;
    }
  }

  if (smallTargets > 0) {
    insights.push({
      id: "touch-target",
      type: "accessibility",
      severity: "warning",
      title: `${smallTargets} small touch target${smallTargets > 1 ? "s" : ""}`,
      description: "Interactive elements should be at least 44x44px.",
    });
  }

  // ── Color variety check ──
  const colors = new Set<string>();
  for (const obj of allObjects) {
    const c = getFirstSolidColor(obj.fills as any);
    if (c) colors.add(c.toUpperCase());
  }
  if (colors.size > 8) {
    insights.push({
      id: "color-variety",
      type: "consistency",
      severity: "info",
      title: `${colors.size} different colors`,
      description: "Consider consolidating into a design system. Ask me to audit consistency.",
    });
  }

  // ── Font size variety check ──
  const fontSizes = new Set<number>();
  for (const obj of allObjects) {
    if (obj.type === "text" && obj.properties?.fontSize) {
      fontSizes.add(obj.properties.fontSize);
    }
  }
  if (fontSizes.size > 5) {
    insights.push({
      id: "font-variety",
      type: "consistency",
      severity: "info",
      title: `${fontSizes.size} font sizes`,
      description: "Many type sizes may indicate an inconsistent type scale.",
    });
  }

  // ── Auto-layout usage ──
  const frames = allObjects.filter((o) => o.type === "frame");
  const withAutoLayout = frames.filter(
    (f) => f.properties?.autoLayout?.mode && f.properties.autoLayout.mode !== "none"
  ).length;
  if (frames.length > 3 && withAutoLayout < frames.length * 0.5) {
    insights.push({
      id: "auto-layout",
      type: "structure",
      severity: "info",
      title: "Low auto-layout usage",
      description: `Only ${withAutoLayout}/${frames.length} frames use auto-layout. Consider converting for responsive layouts.`,
    });
  }

  // ── Naming check ──
  const defaultNames = allObjects.filter((o) =>
    o.name.match(/^(Frame|Rectangle|Ellipse|Text|Vector)\s*\d*$/)
  );
  if (defaultNames.length > 3) {
    insights.push({
      id: "naming",
      type: "structure",
      severity: "info",
      title: `${defaultNames.length} unnamed objects`,
      description: "Naming objects improves organization. Ask me to analyze the hierarchy.",
    });
  }

  return insights;
}

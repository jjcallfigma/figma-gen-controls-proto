/**
 * Design analysis utilities: accessibility checks, consistency auditing,
 * hierarchy analysis, and design system extraction.
 *
 * These functions operate on serialized canvas data (plain objects),
 * not the live store — so they can run both client-side and server-side.
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface CanvasObjectData {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
  childIds: string[];
  fills?: Array<{ type: string; color?: string; opacity?: number; visible?: boolean }>;
  strokes?: Array<{ type: string; color?: string; opacity?: number; visible?: boolean }>;
  strokeWidth?: number;
  opacity?: number;
  visible?: boolean;
  autoLayoutSizing?: { horizontal?: string; vertical?: string };
  properties?: any;
}

export interface AccessibilityIssue {
  severity: "error" | "warning" | "info";
  type: "contrast" | "touch-target" | "text-size" | "missing-alt";
  objectId: string;
  objectName: string;
  message: string;
  details: string;
  wcagLevel?: "A" | "AA" | "AAA";
}

export interface ConsistencyReport {
  colors: { value: string; count: number; objectIds: string[] }[];
  nearDuplicateColors: { a: string; b: string; distance: number }[];
  fontFamilies: { value: string; count: number }[];
  fontSizes: { value: number; count: number }[];
  spacings: { type: string; value: number; count: number }[];
  borderRadii: { value: number; count: number }[];
  issues: string[];
}

export interface HierarchyReport {
  totalObjects: number;
  maxDepth: number;
  autoLayoutUsage: { withAutoLayout: number; without: number };
  textSizeDistribution: { size: number; count: number; role: string }[];
  namingIssues: { objectId: string; name: string; issue: string }[];
  emptyFrames: { objectId: string; name: string }[];
  structureNotes: string[];
}

export interface DesignSystemData {
  colors: { hex: string; name: string; usage: string; count: number }[];
  typography: {
    name: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight?: number;
    usage: string;
  }[];
  spacing: { value: number; usage: string; count: number }[];
  borderRadii: { value: number; usage: string; count: number }[];
  components: { name: string; objectId: string; description: string }[];
}

// ─── Color utilities ────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16),
    };
  }
  if (clean.length === 6 || clean.length === 8) {
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
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function colorDistance(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  if (!c1 || !c2) return Infinity;
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) + Math.pow(c1.g - c2.g, 2) + Math.pow(c1.b - c2.b, 2)
  );
}

function normalizeHex(color: string): string {
  if (!color) return "";
  const c = color.replace("#", "").toUpperCase();
  if (c.length === 3) return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`;
  if (c.length === 8) return `#${c.slice(0, 6)}`; // strip alpha
  return `#${c}`;
}

// ─── Object tree traversal ──────────────────────────────────────────

function getObjectsInScope(
  objects: Record<string, CanvasObjectData>,
  scope: "selection" | "page",
  selectedIds?: string[]
): CanvasObjectData[] {
  if (scope === "selection" && selectedIds?.length) {
    // Get selected objects and all their descendants
    const result: CanvasObjectData[] = [];
    const collect = (id: string) => {
      const obj = objects[id];
      if (!obj) return;
      result.push(obj);
      obj.childIds?.forEach(collect);
    };
    selectedIds.forEach(collect);
    return result;
  }
  // Full page: all visible objects
  return Object.values(objects).filter((o) => o.visible !== false);
}

function getFirstSolidColor(
  fills?: Array<{ type: string; color?: string; opacity?: number; visible?: boolean }>
): string | null {
  if (!fills) return null;
  for (const fill of fills) {
    if (fill.visible !== false && fill.type === "solid" && fill.color) {
      return normalizeHex(fill.color);
    }
  }
  return null;
}

function getAncestorBackground(
  objId: string,
  objects: Record<string, CanvasObjectData>
): string {
  let current = objects[objId];
  while (current?.parentId) {
    current = objects[current.parentId];
    if (!current) break;
    const bg = getFirstSolidColor(current.fills);
    if (bg) return bg;
  }
  return "#FFFFFF"; // default canvas background
}

function getDepth(
  objId: string,
  objects: Record<string, CanvasObjectData>
): number {
  let depth = 0;
  let current = objects[objId];
  while (current?.parentId) {
    depth++;
    current = objects[current.parentId];
  }
  return depth;
}

// ─── Accessibility checks ───────────────────────────────────────────

export function checkAccessibility(
  objects: Record<string, CanvasObjectData>,
  scope: "selection" | "page",
  selectedIds?: string[]
): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  const scopeObjects = getObjectsInScope(objects, scope, selectedIds);

  for (const obj of scopeObjects) {
    // ── Text contrast checks ──
    if (obj.type === "text") {
      const textColor = getFirstSolidColor(obj.fills) || "#000000";
      const bgColor = getAncestorBackground(obj.id, objects);

      const textRgb = hexToRgb(textColor);
      const bgRgb = hexToRgb(bgColor);

      if (textRgb && bgRgb) {
        const textLum = relativeLuminance(textRgb.r, textRgb.g, textRgb.b);
        const bgLum = relativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b);
        const ratio = contrastRatio(textLum, bgLum);

        const fontSize = obj.properties?.fontSize || 14;
        const fontWeight = obj.properties?.fontWeight || 400;
        const isLargeText = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);

        // WCAG AA: 4.5:1 for normal text, 3:1 for large text
        const aaThreshold = isLargeText ? 3 : 4.5;
        // WCAG AAA: 7:1 for normal text, 4.5:1 for large text
        const aaaThreshold = isLargeText ? 4.5 : 7;

        if (ratio < aaThreshold) {
          issues.push({
            severity: "error",
            type: "contrast",
            objectId: obj.id,
            objectName: obj.name,
            message: `Contrast ratio ${ratio.toFixed(1)}:1 fails WCAG AA (needs ${aaThreshold}:1)`,
            details: `Text "${obj.properties?.content?.slice(0, 40) || ""}" — ${textColor} on ${bgColor}`,
            wcagLevel: "AA",
          });
        } else if (ratio < aaaThreshold) {
          issues.push({
            severity: "warning",
            type: "contrast",
            objectId: obj.id,
            objectName: obj.name,
            message: `Contrast ratio ${ratio.toFixed(1)}:1 passes AA but fails AAA (needs ${aaaThreshold}:1)`,
            details: `Text "${obj.properties?.content?.slice(0, 40) || ""}" — ${textColor} on ${bgColor}`,
            wcagLevel: "AAA",
          });
        }
      }

      // ── Minimum text size ──
      const fontSize = obj.properties?.fontSize || 14;
      if (fontSize < 12) {
        issues.push({
          severity: "warning",
          type: "text-size",
          objectId: obj.id,
          objectName: obj.name,
          message: `Font size ${fontSize}px is below recommended minimum of 12px`,
          details: `Consider increasing for readability`,
        });
      }
    }

    // ── Touch target size checks ──
    if (obj.type === "frame" && obj.width > 0 && obj.height > 0) {
      const isInteractive =
        obj.name.toLowerCase().includes("button") ||
        obj.name.toLowerCase().includes("link") ||
        obj.name.toLowerCase().includes("tab") ||
        obj.name.toLowerCase().includes("icon") ||
        obj.name.toLowerCase().includes("toggle") ||
        obj.name.toLowerCase().includes("checkbox") ||
        obj.name.toLowerCase().includes("radio") ||
        obj.name.toLowerCase().includes("input");

      if (isInteractive && (obj.width < 44 || obj.height < 44)) {
        issues.push({
          severity: "warning",
          type: "touch-target",
          objectId: obj.id,
          objectName: obj.name,
          message: `Touch target ${Math.round(obj.width)}x${Math.round(obj.height)}px is below 44x44px minimum`,
          details: `WCAG 2.5.5 Target Size: interactive elements should be at least 44x44px`,
        });
      }
    }
  }

  return issues;
}

// ─── Consistency audit ──────────────────────────────────────────────

export function auditConsistency(
  objects: Record<string, CanvasObjectData>,
  scope: "selection" | "page",
  selectedIds?: string[]
): ConsistencyReport {
  const scopeObjects = getObjectsInScope(objects, scope, selectedIds);

  const colorMap = new Map<string, { count: number; objectIds: string[] }>();
  const fontFamilyMap = new Map<string, number>();
  const fontSizeMap = new Map<number, number>();
  const spacingMap = new Map<string, number>(); // "gap:8" → count
  const borderRadiusMap = new Map<number, number>();

  for (const obj of scopeObjects) {
    // ── Colors ──
    if (obj.fills) {
      for (const fill of obj.fills) {
        if (fill.visible !== false && fill.type === "solid" && fill.color) {
          const hex = normalizeHex(fill.color);
          const entry = colorMap.get(hex) || { count: 0, objectIds: [] };
          entry.count++;
          if (entry.objectIds.length < 5) entry.objectIds.push(obj.id);
          colorMap.set(hex, entry);
        }
      }
    }

    // ── Typography ──
    if (obj.type === "text" && obj.properties) {
      const family = obj.properties.fontFamily || "Inter, sans-serif";
      fontFamilyMap.set(family, (fontFamilyMap.get(family) || 0) + 1);

      const size = obj.properties.fontSize || 14;
      fontSizeMap.set(size, (fontSizeMap.get(size) || 0) + 1);
    }

    // ── Spacing ──
    if (obj.type === "frame" && obj.properties?.autoLayout) {
      const al = obj.properties.autoLayout;
      if (al.mode !== "none") {
        if (al.gap !== undefined) {
          const key = `gap:${al.gap}`;
          spacingMap.set(key, (spacingMap.get(key) || 0) + 1);
        }
        if (al.padding) {
          const { top, right, bottom, left } = al.padding;
          const pads = [top, right, bottom, left].filter((p) => p > 0);
          for (const p of pads) {
            const key = `padding:${p}`;
            spacingMap.set(key, (spacingMap.get(key) || 0) + 1);
          }
        }
      }
    }

    // ── Border radius ──
    if (obj.properties?.borderRadius !== undefined) {
      const br = obj.properties.borderRadius;
      if (typeof br === "number" && br > 0) {
        borderRadiusMap.set(br, (borderRadiusMap.get(br) || 0) + 1);
      }
    }
  }

  // Find near-duplicate colors (distance < 15 in RGB space)
  const colorKeys = Array.from(colorMap.keys());
  const nearDuplicateColors: ConsistencyReport["nearDuplicateColors"] = [];
  for (let i = 0; i < colorKeys.length; i++) {
    for (let j = i + 1; j < colorKeys.length; j++) {
      const dist = colorDistance(colorKeys[i], colorKeys[j]);
      if (dist > 0 && dist < 15) {
        nearDuplicateColors.push({
          a: colorKeys[i],
          b: colorKeys[j],
          distance: Math.round(dist),
        });
      }
    }
  }

  // Build issues summary
  const issues: string[] = [];
  if (nearDuplicateColors.length > 0) {
    issues.push(
      `Found ${nearDuplicateColors.length} near-duplicate color pair(s) that could be consolidated`
    );
  }
  if (fontFamilyMap.size > 3) {
    issues.push(`Using ${fontFamilyMap.size} different font families — consider reducing to 2-3`);
  }
  if (fontSizeMap.size > 8) {
    issues.push(
      `Using ${fontSizeMap.size} different font sizes — consider a type scale with fewer steps`
    );
  }

  return {
    colors: Array.from(colorMap.entries())
      .map(([value, data]) => ({ value, count: data.count, objectIds: data.objectIds }))
      .sort((a, b) => b.count - a.count),
    nearDuplicateColors,
    fontFamilies: Array.from(fontFamilyMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
    fontSizes: Array.from(fontSizeMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
    spacings: Array.from(spacingMap.entries())
      .map(([key, count]) => {
        const [type, val] = key.split(":");
        return { type, value: parseFloat(val), count };
      })
      .sort((a, b) => b.count - a.count),
    borderRadii: Array.from(borderRadiusMap.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count),
    issues,
  };
}

// ─── Hierarchy analysis ─────────────────────────────────────────────

export function analyzeHierarchy(
  objects: Record<string, CanvasObjectData>,
  scope: "selection" | "page",
  selectedIds?: string[]
): HierarchyReport {
  const scopeObjects = getObjectsInScope(objects, scope, selectedIds);

  let maxDepth = 0;
  let withAutoLayout = 0;
  let withoutAutoLayout = 0;
  const textSizes: { size: number; weight: number; count: number }[] = [];
  const namingIssues: HierarchyReport["namingIssues"] = [];
  const emptyFrames: HierarchyReport["emptyFrames"] = [];
  const structureNotes: string[] = [];

  for (const obj of scopeObjects) {
    const depth = getDepth(obj.id, objects);
    if (depth > maxDepth) maxDepth = depth;

    if (obj.type === "frame") {
      const al = obj.properties?.autoLayout;
      if (al && al.mode !== "none") {
        withAutoLayout++;
      } else {
        withoutAutoLayout++;
      }

      // Check for empty frames
      if (!obj.childIds || obj.childIds.length === 0) {
        emptyFrames.push({ objectId: obj.id, name: obj.name });
      }
    }

    // Text analysis
    if (obj.type === "text" && obj.properties) {
      const size = obj.properties.fontSize || 14;
      const weight = obj.properties.fontWeight || 400;
      const existing = textSizes.find((t) => t.size === size && t.weight === weight);
      if (existing) {
        existing.count++;
      } else {
        textSizes.push({ size, weight, count: 1 });
      }
    }

    // Naming issues
    if (obj.name.match(/^(Frame|Rectangle|Ellipse|Text|Vector)\s*\d*$/)) {
      namingIssues.push({
        objectId: obj.id,
        name: obj.name,
        issue: "Default name — consider renaming for clarity",
      });
    }
  }

  // Classify text sizes into roles
  const sortedSizes = [...textSizes].sort((a, b) => b.size - a.size);
  const textSizeDistribution = sortedSizes.map((t, i) => {
    let role = "body";
    if (i === 0 && t.size >= 24) role = "heading-1";
    else if (i === 1 && t.size >= 18) role = "heading-2";
    else if (i === 2 && t.size >= 16) role = "heading-3";
    else if (t.size <= 12) role = "caption";
    else if (t.weight >= 600) role = "emphasis";
    return { size: t.size, count: t.count, role };
  });

  // Structure notes
  if (maxDepth > 6) {
    structureNotes.push(
      `Deep nesting detected (${maxDepth} levels) — consider flattening the hierarchy`
    );
  }
  if (withoutAutoLayout > withAutoLayout && scopeObjects.length > 5) {
    structureNotes.push(
      `Only ${Math.round((withAutoLayout / (withAutoLayout + withoutAutoLayout)) * 100)}% of frames use auto-layout — consider converting more for responsive designs`
    );
  }
  if (emptyFrames.length > 3) {
    structureNotes.push(`${emptyFrames.length} empty frames found — these may be unnecessary`);
  }
  if (namingIssues.length > 5) {
    structureNotes.push(
      `${namingIssues.length} objects still have default names — proper naming improves maintainability`
    );
  }

  return {
    totalObjects: scopeObjects.length,
    maxDepth,
    autoLayoutUsage: { withAutoLayout, without: withoutAutoLayout },
    textSizeDistribution,
    namingIssues: namingIssues.slice(0, 20), // Cap at 20
    emptyFrames: emptyFrames.slice(0, 10),
    structureNotes,
  };
}

// ─── Design system extraction ───────────────────────────────────────

export function extractDesignSystem(
  objects: Record<string, CanvasObjectData>,
  scope: "page" | "all"
): DesignSystemData {
  const allObjects = Object.values(objects).filter((o) => o.visible !== false);
  const consistency = auditConsistency(
    objects,
    scope === "page" ? "page" : "page", // all objects are already filtered by page in the caller
    undefined
  );

  // ── Colors — group and name ──
  const colors = consistency.colors.slice(0, 20).map((c) => {
    const rgb = hexToRgb(c.value);
    let usage = "fill";
    // Try to guess usage based on frequency and value
    if (rgb) {
      const lum = relativeLuminance(rgb.r, rgb.g, rgb.b);
      if (lum > 0.9) usage = "background";
      else if (lum < 0.1) usage = "text";
      else if (c.count >= 3) usage = "primary";
    }
    return {
      hex: c.value,
      name: `color-${c.value.replace("#", "").toLowerCase()}`,
      usage,
      count: c.count,
    };
  });

  // ── Typography — deduplicate and classify ──
  const typography = consistency.fontSizes.map((fs) => {
    const family = consistency.fontFamilies[0]?.value || "Inter";
    let usage = "body";
    if (fs.value >= 24) usage = "heading-1";
    else if (fs.value >= 20) usage = "heading-2";
    else if (fs.value >= 16) usage = "heading-3";
    else if (fs.value <= 12) usage = "caption";
    return {
      name: usage,
      fontFamily: family,
      fontSize: fs.value,
      fontWeight: usage.startsWith("heading") ? 600 : 400,
      usage,
    };
  });

  // ── Spacing ──
  const spacingValues = new Map<number, { usage: string; count: number }>();
  for (const s of consistency.spacings) {
    const existing = spacingValues.get(s.value);
    if (existing) {
      existing.count += s.count;
    } else {
      spacingValues.set(s.value, { usage: s.type, count: s.count });
    }
  }
  const spacing = Array.from(spacingValues.entries())
    .map(([value, data]) => ({ value, usage: data.usage, count: data.count }))
    .sort((a, b) => a.value - b.value);

  // ── Border radii ──
  const borderRadii = consistency.borderRadii.map((br) => ({
    value: br.value,
    usage: br.value <= 4 ? "subtle" : br.value <= 8 ? "default" : "rounded",
    count: br.count,
  }));

  // ── Components — find top-level frames that look like components ──
  const components = allObjects
    .filter(
      (o) =>
        o.type === "frame" &&
        !o.parentId &&
        o.childIds.length > 0 &&
        !o.name.match(/^(Frame|Page)\s*\d*$/)
    )
    .slice(0, 10)
    .map((o) => ({
      name: o.name,
      objectId: o.id,
      description: `${Math.round(o.width)}x${Math.round(o.height)} frame with ${o.childIds.length} children`,
    }));

  return { colors, typography, spacing, borderRadii, components };
}

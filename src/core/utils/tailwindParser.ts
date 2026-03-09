/**
 * tailwindParser.ts
 *
 * Parses a Tailwind CSS className string into structured style categories,
 * and provides helpers to modify individual properties by swapping classes.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface TailwindStyles {
  layout: {
    display?: string;        // flex, grid, block, inline, hidden, etc.
    direction?: string;      // flex-row, flex-col, etc.
    wrap?: string;           // flex-wrap, flex-nowrap
    alignItems?: string;     // items-start, items-center, etc.
    justifyContent?: string; // justify-start, justify-center, etc.
    gap?: string;            // gap-0, gap-4, etc.
    gapX?: string;           // gap-x-4
    gapY?: string;           // gap-y-4
  };
  spacing: {
    padding?: string;   // p-4
    paddingX?: string;  // px-4
    paddingY?: string;  // py-4
    paddingT?: string;  // pt-4
    paddingR?: string;  // pr-4
    paddingB?: string;  // pb-4
    paddingL?: string;  // pl-4
    margin?: string;    // m-4
    marginX?: string;   // mx-auto
    marginY?: string;   // my-4
    marginT?: string;   // mt-4
    marginR?: string;   // mr-4
    marginB?: string;   // mb-4
    marginL?: string;   // ml-4
  };
  sizing: {
    width?: string;     // w-full, w-64, w-[200px]
    height?: string;    // h-screen, h-10
    minWidth?: string;  // min-w-0
    maxWidth?: string;  // max-w-md
    minHeight?: string; // min-h-screen
    maxHeight?: string; // max-h-64
  };
  typography: {
    fontSize?: string;     // text-sm, text-lg
    fontWeight?: string;   // font-bold, font-medium
    textColor?: string;    // text-gray-700, text-white
    textAlign?: string;    // text-left, text-center
    lineHeight?: string;   // leading-tight
    letterSpacing?: string; // tracking-wide
    fontFamily?: string;    // font-sans, font-mono
  };
  background: {
    color?: string;     // bg-white, bg-blue-500
    gradient?: string;  // bg-gradient-to-r
  };
  border: {
    width?: string;     // border, border-2
    color?: string;     // border-gray-200
    radius?: string;    // rounded-lg
    radiusTL?: string;  // rounded-tl-lg
    radiusTR?: string;  // rounded-tr-lg
    radiusBL?: string;  // rounded-bl-lg
    radiusBR?: string;  // rounded-br-lg
    style?: string;     // border-solid, border-dashed
  };
  effects: {
    opacity?: string;   // opacity-50
    shadow?: string;    // shadow-md
    blur?: string;      // blur-sm
  };
  position: {
    type?: string;      // relative, absolute, fixed, sticky
    inset?: string;     // inset-0
    top?: string;       // top-0
    right?: string;     // right-0
    bottom?: string;    // bottom-0
    left?: string;      // left-0
    zIndex?: string;    // z-10
  };
  overflow?: string;    // overflow-hidden
  cursor?: string;      // cursor-pointer
  other: string[];      // everything not matched
}

// ─── Pattern definitions ─────────────────────────────────────────────

interface ClassPattern {
  regex: RegExp;
  category: keyof TailwindStyles | string;
  property: string;
  /** If true, the full match is the value. Otherwise extract from group(1). */
  fullMatch?: boolean;
}

const PATTERNS: ClassPattern[] = [
  // Layout - display
  { regex: /^(flex|grid|block|inline-flex|inline-block|inline-grid|inline|table|hidden)$/, category: "layout", property: "display", fullMatch: true },
  { regex: /^flex-(row|col|row-reverse|col-reverse)$/, category: "layout", property: "direction" },
  { regex: /^flex-(wrap|nowrap|wrap-reverse)$/, category: "layout", property: "wrap" },
  { regex: /^items-(start|end|center|baseline|stretch)$/, category: "layout", property: "alignItems" },
  { regex: /^justify-(start|end|center|between|around|evenly|stretch)$/, category: "layout", property: "justifyContent" },
  { regex: /^gap-x-(.+)$/, category: "layout", property: "gapX" },
  { regex: /^gap-y-(.+)$/, category: "layout", property: "gapY" },
  { regex: /^gap-(.+)$/, category: "layout", property: "gap" },

  // Spacing - padding
  { regex: /^-?pt-(.+)$/, category: "spacing", property: "paddingT" },
  { regex: /^-?pr-(.+)$/, category: "spacing", property: "paddingR" },
  { regex: /^-?pb-(.+)$/, category: "spacing", property: "paddingB" },
  { regex: /^-?pl-(.+)$/, category: "spacing", property: "paddingL" },
  { regex: /^-?px-(.+)$/, category: "spacing", property: "paddingX" },
  { regex: /^-?py-(.+)$/, category: "spacing", property: "paddingY" },
  { regex: /^-?p-(.+)$/, category: "spacing", property: "padding" },
  // Spacing - margin
  { regex: /^-?mt-(.+)$/, category: "spacing", property: "marginT" },
  { regex: /^-?mr-(.+)$/, category: "spacing", property: "marginR" },
  { regex: /^-?mb-(.+)$/, category: "spacing", property: "marginB" },
  { regex: /^-?ml-(.+)$/, category: "spacing", property: "marginL" },
  { regex: /^-?mx-(.+)$/, category: "spacing", property: "marginX" },
  { regex: /^-?my-(.+)$/, category: "spacing", property: "marginY" },
  { regex: /^-?m-(.+)$/, category: "spacing", property: "margin" },

  // Sizing
  { regex: /^w-(.+)$/, category: "sizing", property: "width" },
  { regex: /^h-(.+)$/, category: "sizing", property: "height" },
  { regex: /^min-w-(.+)$/, category: "sizing", property: "minWidth" },
  { regex: /^max-w-(.+)$/, category: "sizing", property: "maxWidth" },
  { regex: /^min-h-(.+)$/, category: "sizing", property: "minHeight" },
  { regex: /^max-h-(.+)$/, category: "sizing", property: "maxHeight" },

  // Typography
  { regex: /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|\[.+\])$/, category: "typography", property: "fontSize" },
  { regex: /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/, category: "typography", property: "fontWeight" },
  { regex: /^text-(left|center|right|justify|start|end)$/, category: "typography", property: "textAlign" },
  { regex: /^leading-(.+)$/, category: "typography", property: "lineHeight" },
  { regex: /^tracking-(.+)$/, category: "typography", property: "letterSpacing" },
  { regex: /^font-(sans|serif|mono)$/, category: "typography", property: "fontFamily" },
  // text color — must come after text-align and text-size
  { regex: /^text-(.+)$/, category: "typography", property: "textColor" },

  // Background
  { regex: /^bg-gradient-(.+)$/, category: "background", property: "gradient" },
  { regex: /^bg-(.+)$/, category: "background", property: "color" },

  // Border - radius (more specific first)
  { regex: /^rounded-tl-(.+)$/, category: "border", property: "radiusTL" },
  { regex: /^rounded-tr-(.+)$/, category: "border", property: "radiusTR" },
  { regex: /^rounded-bl-(.+)$/, category: "border", property: "radiusBL" },
  { regex: /^rounded-br-(.+)$/, category: "border", property: "radiusBR" },
  { regex: /^rounded-(.+)$/, category: "border", property: "radius" },
  { regex: /^rounded$/, category: "border", property: "radius", fullMatch: true },
  // Border - style
  { regex: /^border-(solid|dashed|dotted|double|none)$/, category: "border", property: "style" },
  // Border - width
  { regex: /^border-(0|2|4|8|\[.+\])$/, category: "border", property: "width" },
  { regex: /^border$/, category: "border", property: "width", fullMatch: true },
  // Border - color
  { regex: /^border-(.+)$/, category: "border", property: "color" },

  // Effects
  { regex: /^opacity-(.+)$/, category: "effects", property: "opacity" },
  { regex: /^shadow-(.+)$/, category: "effects", property: "shadow" },
  { regex: /^shadow$/, category: "effects", property: "shadow", fullMatch: true },
  { regex: /^blur-(.+)$/, category: "effects", property: "blur" },

  // Position
  { regex: /^(relative|absolute|fixed|sticky|static)$/, category: "position", property: "type", fullMatch: true },
  { regex: /^inset-(.+)$/, category: "position", property: "inset" },
  { regex: /^-?top-(.+)$/, category: "position", property: "top" },
  { regex: /^-?right-(.+)$/, category: "position", property: "right" },
  { regex: /^-?bottom-(.+)$/, category: "position", property: "bottom" },
  { regex: /^-?left-(.+)$/, category: "position", property: "left" },
  { regex: /^z-(.+)$/, category: "position", property: "zIndex" },

  // Misc
  { regex: /^overflow-(hidden|auto|scroll|visible|x-auto|y-auto|x-hidden|y-hidden)$/, category: "overflow", property: "" },
  { regex: /^cursor-(pointer|default|move|text|not-allowed|grab|grabbing)$/, category: "cursor", property: "" },
];

// ─── Parser ──────────────────────────────────────────────────────────

export function parseTailwindClasses(className: string): TailwindStyles {
  const result: TailwindStyles = {
    layout: {},
    spacing: {},
    sizing: {},
    typography: {},
    background: {},
    border: {},
    effects: {},
    position: {},
    other: [],
  };

  if (!className) return result;

  const classes = className.split(/\s+/).filter(Boolean);

  for (const cls of classes) {
    // Skip state variants like hover:, focus:, dark:, sm:, md:, lg:, etc.
    if (cls.includes(":")) {
      result.other.push(cls);
      continue;
    }

    let matched = false;
    for (const pattern of PATTERNS) {
      const m = cls.match(pattern.regex);
      if (m) {
        const value = pattern.fullMatch ? cls : m[1];
        const cat = pattern.category as keyof TailwindStyles;

        if (cat === "overflow") {
          result.overflow = cls;
        } else if (cat === "cursor") {
          result.cursor = cls;
        } else {
          const section = result[cat];
          if (section && typeof section === "object" && !Array.isArray(section)) {
            (section as Record<string, string>)[pattern.property] = value;
          }
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      result.other.push(cls);
    }
  }

  return result;
}

// ─── Class replacement helper ────────────────────────────────────────

/**
 * Replace or add a Tailwind class for a specific property.
 * The `prefix` can be:
 *   - A simple prefix like "p-" or "items-" — matches classes starting with it.
 *   - A regex pattern like "text-(?:xs|sm|base|...)" — used as-is.
 *   - Pipe-separated exact classes like "flex|grid|block" — matches any of them exactly.
 */
export function replaceClass(
  className: string,
  prefix: string,
  newValue: string | null
): string {
  const classes = className.split(/\s+/).filter(Boolean);

  let prefixRegex: RegExp;

  if (prefix.includes("|")) {
    // Pipe-separated = match any of these exact classes or class prefixes
    const alts = prefix.split("|").map((p) => {
      // If the alt ends with a regex-like pattern (e.g., has parens), keep it
      if (p.includes("(") || p.includes("[")) return p;
      // Otherwise, match as prefix (e.g., "flex" matches "flex", "flex-col", etc.)
      return escapeRegex(p) + "(?:-|$)";
    });
    prefixRegex = new RegExp(`^-?(?:${alts.join("|")})`);
  } else if (prefix.includes("(") || prefix.includes("[")) {
    // Regex pattern — use directly
    prefixRegex = new RegExp(`^-?${prefix}`);
  } else {
    // Simple prefix — if it already ends with "-", it naturally acts as a prefix;
    // otherwise append (?:-|$) to ensure e.g. "gap" matches "gap-4" but not "gap".
    if (prefix.endsWith("-")) {
      prefixRegex = new RegExp(`^-?${escapeRegex(prefix)}`);
    } else {
      prefixRegex = new RegExp(`^-?${escapeRegex(prefix)}(?:-|$)`);
    }
  }

  const filtered = classes.filter((c) => {
    // Keep state-variants (e.g. hover:bg-blue-500)
    if (c.includes(":")) return true;
    return !prefixRegex.test(c);
  });

  if (newValue) {
    filtered.push(newValue);
  }

  return filtered.join(" ");
}

/**
 * Remove all classes that match a given prefix.
 */
export function removeClass(className: string, prefix: string): string {
  return replaceClass(className, prefix, null);
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()[\]\\]/g, "\\$&");
}

// ─── Known values for the visual UI ─────────────────────────────────

export const DISPLAY_OPTIONS = ["flex", "grid", "block", "inline-flex", "inline-block", "inline", "hidden"] as const;
export const FLEX_DIRECTION_OPTIONS = ["row", "col", "row-reverse", "col-reverse"] as const;
export const FLEX_WRAP_OPTIONS = ["wrap", "nowrap", "wrap-reverse"] as const;
export const ALIGN_ITEMS_OPTIONS = ["start", "center", "end", "stretch", "baseline"] as const;
export const JUSTIFY_OPTIONS = ["start", "center", "end", "between", "around", "evenly"] as const;
export const FONT_SIZE_OPTIONS = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"] as const;
export const FONT_WEIGHT_OPTIONS = ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"] as const;
export const TEXT_ALIGN_OPTIONS = ["left", "center", "right", "justify"] as const;
export const BORDER_RADIUS_OPTIONS = ["none", "sm", "rounded", "md", "lg", "xl", "2xl", "3xl", "full"] as const;
export const SHADOW_OPTIONS = ["none", "shadow", "sm", "md", "lg", "xl", "2xl", "inner"] as const;
export const OVERFLOW_OPTIONS = ["visible", "hidden", "auto", "scroll"] as const;
export const POSITION_OPTIONS = ["relative", "absolute", "fixed", "sticky", "static"] as const;

export const SPACING_SCALE = ["0", "0.5", "1", "1.5", "2", "2.5", "3", "3.5", "4", "5", "6", "7", "8", "9", "10", "11", "12", "14", "16", "20", "24", "28", "32", "36", "40", "44", "48", "52", "56", "60", "64", "72", "80", "96"] as const;
export const SIZE_OPTIONS = ["auto", "full", "screen", "min", "max", "fit", "0", "0.5", "1", "1.5", "2", "3", "4", "5", "6", "8", "10", "12", "16", "20", "24", "32", "40", "48", "56", "64", "72", "80", "96"] as const;
export const MAX_WIDTH_OPTIONS = ["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "full", "prose", "screen-sm", "screen-md", "screen-lg", "screen-xl", "screen-2xl"] as const;

// ─── Tailwind value conversion helpers ───────────────────────────────

const OPACITY_SET = new Set(["0", "5", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55", "60", "65", "70", "75", "80", "85", "90", "95", "100"]);

/**
 * Strip brackets and px suffix from a Tailwind arbitrary value for display.
 * "[300px]" → "300", "[20px]" → "20", "full" → "full", "[0.27]" → "0.27"
 */
export function displayTwValue(value: string): string {
  if (!value) return value;
  if (value.startsWith("[") && value.endsWith("]")) {
    let inner = value.slice(1, -1);
    // Strip px suffix — we assume pixels by default
    if (inner.endsWith("px")) inner = inner.slice(0, -2);
    return inner;
  }
  return value;
}

/**
 * Convert a user-entered value to a valid Tailwind arbitrary-value class suffix.
 * Always uses bracket notation `[...]` for numeric values.
 * Named values (auto, full, screen, etc.) pass through as-is.
 *
 * @param value  The user-entered value (e.g. "20", "300px", "auto")
 * @param type   The property type — determines the default unit for pure numbers
 * @returns      A valid Tailwind class suffix (e.g. "[20px]", "[300px]", "auto")
 */
export function toTwValue(
  value: string,
  type: "spacing" | "size" | "opacity" | "radius" | "z-index" | "line-height" | "letter-spacing" | "raw"
): string {
  if (!value) return value;
  // Already has brackets — pass through
  if (value.startsWith("[") && value.endsWith("]")) return value;
  if (value.includes("[")) return value;

  // Named values (start with a letter, e.g. "auto", "full", "screen", "none") — pass through
  if (/^[a-zA-Z]/.test(value)) return value;
  // Fraction values like "1/2", "2/3" — pass through
  if (/^\d+\/\d+$/.test(value)) return value;

  // Determine default unit for pure numbers
  let defaultUnit: string;
  switch (type) {
    case "opacity":
      // UI shows 0-100 percentage; CSS needs 0-1 decimal
      const num = parseFloat(value);
      if (!isNaN(num)) {
        return `[${(num / 100).toString()}]`;
      }
      return `[${value}]`;
    case "z-index":
    case "line-height":
      defaultUnit = "";
      break;
    case "letter-spacing":
      defaultUnit = "em";
      break;
    case "spacing":
    case "size":
    case "radius":
    default:
      defaultUnit = "px"; // CSS needs px, but we hide it from the user
      break;
  }

  // Pure number — wrap in brackets with unit
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return `[${value}${defaultUnit}]`;
  }

  // Has a unit already (e.g. "300px", "2rem") — just wrap in brackets
  return `[${value}]`;
}

/**
 * Convert a parsed Tailwind opacity value to a user-friendly display value.
 * Preset values (0-100 scale) display as-is; arbitrary CSS decimals convert to percentage.
 */
export function displayOpacityValue(value: string): string {
  if (!value) return value;
  // Standard preset values (0, 5, 10, ..., 100) — show as-is
  if (OPACITY_SET.has(value)) return value;
  // Arbitrary value like "[0.27]" — strip brackets, convert decimal to percentage
  const inner = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  const num = parseFloat(inner);
  if (!isNaN(num) && num >= 0 && num <= 1) {
    return String(Math.round(num * 100));
  }
  // Might be a raw number (e.g. from a preset like "50")
  return inner;
}

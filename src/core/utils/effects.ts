import {
  CanvasObject,
  DropShadowEffect,
  Effect,
  InnerShadowEffect,
  LayerBlurEffect,
} from "@/types/canvas";

// Generate unique IDs for effects
export function generateEffectId(): string {
  return `effect_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Factory function for creating drop shadow effects
export function createDropShadow(
  color: string = "#000000",
  opacity: number = 0.25,
  offsetX: number = 0,
  offsetY: number = 4,
  blur: number = 8,
  spread: number = 0
): DropShadowEffect {
  return {
    id: generateEffectId(),
    type: "drop-shadow",
    visible: true,
    color,
    opacity,
    offsetX,
    offsetY,
    blur,
    spread,
  };
}

// Factory function for creating inner shadow effects
export function createInnerShadow(
  color: string = "#000000",
  opacity: number = 0.25,
  offsetX: number = 0,
  offsetY: number = 2,
  blur: number = 4,
  spread: number = 0
): InnerShadowEffect {
  return {
    id: generateEffectId(),
    type: "inner-shadow",
    visible: true,
    color,
    opacity,
    offsetX,
    offsetY,
    blur,
    spread,
  };
}

// Factory function for creating layer blur effects
export function createLayerBlur(blur: number = 4): LayerBlurEffect {
  return {
    id: generateEffectId(),
    type: "layer-blur",
    visible: true,
    blur,
  };
}

// Add an effect to an object (returns new object with updated effects array)
export function addEffect(
  object: CanvasObject,
  effect: Effect
): CanvasObject {
  return {
    ...object,
    effects: [...(object.effects || []), effect],
  };
}

// Helper to add opacity to a hex color and return rgba string
function hexToRgba(hex: string, opacity: number): string {
  // Clean hex
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Convert a shadow effect to a CSS box-shadow value
function shadowToCss(
  effect: DropShadowEffect | InnerShadowEffect
): string {
  const { offsetX, offsetY, blur, spread, color, opacity } = effect;
  const rgba = hexToRgba(color, opacity);
  const inset = effect.type === "inner-shadow" ? "inset " : "";
  return `${inset}${offsetX}px ${offsetY}px ${blur}px ${spread}px ${rgba}`;
}

// Build CSS styles for the WRAPPER element (drop shadows + layer blur only).
// Inner shadows are excluded here because fill layers would cover them;
// they are rendered via a separate overlay using innerShadowCss().
export function effectsToCssStyles(
  effects: Effect[] | undefined
): React.CSSProperties {
  if (!effects || effects.length === 0) return {};

  const visibleEffects = effects.filter((e) => e.visible);
  if (visibleEffects.length === 0) return {};

  const styles: React.CSSProperties = {};

  // Only drop shadows on the wrapper (inner shadows go on overlay)
  const dropShadowValues: string[] = [];
  const filterValues: string[] = [];

  for (const effect of visibleEffects) {
    switch (effect.type) {
      case "drop-shadow":
        dropShadowValues.push(shadowToCss(effect));
        break;
      case "layer-blur":
        filterValues.push(`blur(${effect.blur}px)`);
        break;
      // inner-shadow intentionally excluded — rendered via overlay
    }
  }

  if (dropShadowValues.length > 0) {
    styles.boxShadow = dropShadowValues.join(", ");
  }

  if (filterValues.length > 0) {
    styles.filter = filterValues.join(" ");
  }

  return styles;
}

// Build the CSS box-shadow string for inner shadows only.
// Returns undefined if there are no visible inner shadows.
// This is used on a pointer-events:none overlay div that sits
// on top of fill layers so the inset shadow is actually visible.
export function innerShadowCss(
  effects: Effect[] | undefined
): string | undefined {
  if (!effects || effects.length === 0) return undefined;

  const innerShadows = effects.filter(
    (e): e is InnerShadowEffect => e.visible && e.type === "inner-shadow"
  );
  if (innerShadows.length === 0) return undefined;

  return innerShadows.map((e) => shadowToCss(e)).join(", ");
}

// Check whether an effects array contains any visible inner shadows
export function hasVisibleInnerShadows(
  effects: Effect[] | undefined
): boolean {
  if (!effects) return false;
  return effects.some((e) => e.visible && e.type === "inner-shadow");
}

// Get a human-readable label for an effect type
export function getEffectTypeLabel(type: Effect["type"]): string {
  switch (type) {
    case "drop-shadow":
      return "Drop shadow";
    case "inner-shadow":
      return "Inner shadow";
    case "layer-blur":
      return "Layer blur";
    default:
      return "Effect";
  }
}

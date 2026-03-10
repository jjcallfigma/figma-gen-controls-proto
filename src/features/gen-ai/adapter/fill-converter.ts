/**
 * Bidirectional conversion between the gen-ai plugin's fill/stroke/effect
 * formats and the figma-clone's canvas types.
 */

import { nanoid } from "nanoid";
import type {
  Fill,
  SolidFill,
  LinearGradientFill,
  ImageFill,
  Stroke,
  SolidStroke,
  Effect,
  DropShadowEffect,
  InnerShadowEffect,
  LayerBlurEffect,
} from "@/types/canvas";

// ─── Helpers ─────────────────────────────────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

// ─── Plugin fills → Clone fills ──────────────────────────────────────

interface PluginSolidPaint {
  type: "SOLID";
  color: { r: number; g: number; b: number };
  opacity?: number;
}

interface PluginGradientStop {
  position: number;
  color: { r: number; g: number; b: number; a?: number };
}

interface PluginGradientPaint {
  type: "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND";
  gradientStops: PluginGradientStop[];
  gradientTransform?: number[][];
  opacity?: number;
}

type PluginPaint = PluginSolidPaint | PluginGradientPaint | Record<string, unknown>;

export function pluginFillToClone(paint: PluginPaint): Fill {
  if (paint.type === "SOLID") {
    const p = paint as PluginSolidPaint;
    return {
      id: nanoid(),
      type: "solid",
      color: rgbToHex(p.color.r, p.color.g, p.color.b),
      opacity: p.opacity ?? 1,
      visible: true,
    } as SolidFill;
  }

  if (typeof paint.type === "string" && paint.type.startsWith("GRADIENT_")) {
    const p = paint as PluginGradientPaint;
    const stops = (p.gradientStops || []).map((s) => ({
      position: s.position,
      color: rgbToHex(s.color.r, s.color.g, s.color.b),
      opacity: s.color.a ?? 1,
    }));

    // Convert gradientTransform to angle (approximate)
    let angle = 180;
    if (p.gradientTransform && p.gradientTransform.length >= 2) {
      const [[a, b]] = p.gradientTransform;
      angle = Math.round(Math.atan2(b, a) * (180 / Math.PI) + 90);
    }

    if (p.type === "GRADIENT_RADIAL") {
      return {
        id: nanoid(),
        type: "radial-gradient",
        centerX: 0.5,
        centerY: 0.5,
        radius: 0.5,
        stops,
        opacity: p.opacity ?? 1,
        visible: true,
      } as Fill;
    }

    return {
      id: nanoid(),
      type: "linear-gradient",
      angle,
      stops,
      opacity: p.opacity ?? 1,
      visible: true,
    } as LinearGradientFill;
  }

  if (paint.type === "IMAGE") {
    const p = paint as Record<string, unknown>;
    return {
      id: nanoid(),
      type: "image",
      imageUrl: (p.imageUrl ?? p.imageURL ?? "") as string,
      fit: ((p.scaleMode as string)?.toLowerCase() === "tile" ? "tile" : "fill") as ImageFill["fit"],
      opacity: typeof p.opacity === "number" ? p.opacity : 1,
      visible: true,
    } as ImageFill;
  }

  // Fallback: transparent solid
  return {
    id: nanoid(),
    type: "solid",
    color: "#000000",
    opacity: 0,
    visible: true,
  } as SolidFill;
}

export function pluginFillsToClone(paints: PluginPaint[]): Fill[] {
  return paints.map(pluginFillToClone);
}

// ─── Plugin strokes → Clone strokes ─────────────────────────────────

interface PluginStrokePaint {
  type: "SOLID";
  color: { r: number; g: number; b: number };
  opacity?: number;
}

export function pluginStrokeToClone(paint: PluginStrokePaint): Stroke {
  return {
    id: nanoid(),
    type: "solid",
    color: rgbToHex(paint.color.r, paint.color.g, paint.color.b),
    opacity: paint.opacity ?? 1,
    visible: true,
  } as SolidStroke;
}

// ─── Plugin effects → Clone effects ─────────────────────────────────

interface PluginEffect {
  type: string;
  color?: { r: number; g: number; b: number; a?: number };
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
  visible?: boolean;
}

export function pluginEffectToClone(effect: PluginEffect): Effect {
  if (effect.type === "DROP_SHADOW") {
    return {
      id: nanoid(),
      type: "drop-shadow",
      color: effect.color
        ? rgbToHex(effect.color.r, effect.color.g, effect.color.b)
        : "#000000",
      opacity: effect.color?.a ?? 0.25,
      offsetX: effect.offset?.x ?? 0,
      offsetY: effect.offset?.y ?? 4,
      blur: effect.radius ?? 8,
      spread: effect.spread ?? 0,
      visible: effect.visible !== false,
    } as DropShadowEffect;
  }

  if (effect.type === "INNER_SHADOW") {
    return {
      id: nanoid(),
      type: "inner-shadow",
      color: effect.color
        ? rgbToHex(effect.color.r, effect.color.g, effect.color.b)
        : "#000000",
      opacity: effect.color?.a ?? 0.25,
      offsetX: effect.offset?.x ?? 0,
      offsetY: effect.offset?.y ?? 4,
      blur: effect.radius ?? 8,
      spread: effect.spread ?? 0,
      visible: effect.visible !== false,
    } as InnerShadowEffect;
  }

  return {
    id: nanoid(),
    type: "layer-blur",
    blur: effect.radius ?? 8,
    visible: effect.visible !== false,
  } as LayerBlurEffect;
}

// ─── Clone fills → Plugin fills (for selection context) ──────────────

export function cloneFillToPlugin(fill: Fill): PluginPaint {
  if (fill.type === "solid") {
    const s = fill as SolidFill;
    return {
      type: "SOLID",
      color: hexToRgb(s.color),
      opacity: s.opacity,
    };
  }

  if (fill.type === "linear-gradient") {
    const g = fill as LinearGradientFill;
    return {
      type: "GRADIENT_LINEAR",
      gradientStops: g.stops.map((s) => ({
        position: s.position,
        color: { ...hexToRgb(s.color), a: s.opacity ?? 1 },
      })),
      opacity: g.opacity,
    };
  }

  return { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0 };
}

export { rgbToHex, hexToRgb };

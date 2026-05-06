import type { CanvasObject, SolidFill } from "@/types/canvas";
import type { UISpec } from "../types";

// ─── Palette definitions ─────────────────────────────────────────────
// Each palette has 4 colors from darkest to lightest, sourced from colorhunt.co.
// Mapping: [cardBg, surfaceBg, accent, lightText]

interface Palette {
  name: string;
  card: string;
  surface: string;
  accent: string;
  text: string;
}

const PALETTES: Palette[] = [
  { name: "Earth",  card: "#222831", surface: "#393E46", accent: "#948979", text: "#DFD0B8" },
  { name: "Teal",   card: "#222831", surface: "#31363F", accent: "#76ABAE", text: "#EEEEEE" },
  { name: "Forest", card: "#0F0F0F", surface: "#232D3F", accent: "#005B41", text: "#008170" },
  { name: "Cosmic", card: "#03001C", surface: "#301E67", accent: "#5B8FB9", text: "#B6EADA" },
  { name: "Plum",   card: "#261C2C", surface: "#3E2C41", accent: "#5C527F", text: "#6E85B2" },
  { name: "Dusk",   card: "#151515", surface: "#301B3F", accent: "#3C415C", text: "#B4A5A5" },
];

// ─── Node role classification ────────────────────────────────────────

type Role = "card" | "surface" | "swatch" | "text";

interface NodeTarget {
  id: string;
  role: Role;
  lightFill: string;
  lightOpacity: number;
}

function getSolidFill(obj: CanvasObject): { color: string; opacity: number } | null {
  const fill = obj.fills?.find((f): f is SolidFill => f.type === "solid" && f.visible !== false);
  if (!fill) return null;
  return { color: fill.color, opacity: fill.opacity ?? 1 };
}

/**
 * Walk the selected frame and classify children by role.
 * Vectors are skipped entirely (sphere wireframe is untouched).
 */
function buildTargets(
  frameId: string,
  objects: Record<string, CanvasObject>,
): NodeTarget[] {
  const frame = objects[frameId];
  if (!frame) return [];

  const targets: NodeTarget[] = [];

  // The root frame is the card
  const rootFill = getSolidFill(frame);
  if (rootFill) targets.push({ id: frameId, role: "card", lightFill: rootFill.color, lightOpacity: rootFill.opacity });

  const swatches: NodeTarget[] = [];

  const visit = (ids: string[]) => {
    for (const id of ids) {
      const obj = objects[id];
      if (!obj) continue;

      // Skip vectors entirely (sphere wireframe)
      if (obj.type === "vector") continue;

      if (obj.type === "text") {
        const fill = getSolidFill(obj);
        targets.push({ id, role: "text", lightFill: fill?.color ?? "#1A1A1A", lightOpacity: fill?.opacity ?? 1 });
      } else if (obj.type === "ellipse") {
        const fill = getSolidFill(obj);
        swatches.push({ id, role: "swatch", lightFill: fill?.color ?? "#CCCCCC", lightOpacity: fill?.opacity ?? 1 });
      } else if (
        obj.type === "rectangle" ||
        (obj.type === "frame" && obj.childIds.length === 0)
      ) {
        const fill = getSolidFill(obj);
        if (fill) targets.push({ id, role: "surface", lightFill: fill.color, lightOpacity: fill.opacity });
      } else if (obj.type === "frame" && obj.childIds.length > 0) {
        const fill = getSolidFill(obj);
        const hasVectorDescendant = (parentId: string): boolean => {
          const parent = objects[parentId];
          if (!parent) return false;
          for (const cid of parent.childIds) {
            const child = objects[cid];
            if (!child) continue;
            if (child.type === "vector") return true;
            if (child.type === "frame" && child.childIds.length > 0 && hasVectorDescendant(cid)) return true;
          }
          return false;
        };
        if (hasVectorDescendant(id)) {
          // Frame containing vectors (at any depth) = sphere container (surface)
          if (fill) targets.push({ id, role: "surface", lightFill: fill.color, lightOpacity: fill.opacity });
        } else {
          if (fill) targets.push({ id, role: "card", lightFill: fill.color, lightOpacity: fill.opacity });
          visit(obj.childIds);
        }
      }
    }
  };

  visit(frame.childIds);

  // Add swatches at the end so they get palette accent colors
  targets.push(...swatches);

  return targets;
}

// ─── Spec builder ────────────────────────────────────────────────────

export function buildDarkModeSpec(
  frameId: string,
  objects: Record<string, CanvasObject>,
): UISpec {
  const targets = buildTargets(frameId, objects);
  const targetsJson = JSON.stringify(targets);
  const palettesJson = JSON.stringify(PALETTES);

  // Step 0 = light mode (original colors), steps 1-6 = palettes
  const generate = `
    var step = parseInt(params.theme, 10) || 0;
    var targets = ${targetsJson};
    var palettes = ${palettesJson};
    var actions = [];

    function hexToRgb(hex) {
      hex = hex.replace("#", "");
      if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
      return {
        r: parseInt(hex.substring(0, 2), 16) / 255,
        g: parseInt(hex.substring(2, 4), 16) / 255,
        b: parseInt(hex.substring(4, 6), 16) / 255,
      };
    }

    // Step 0 = original light mode colors (restore snapshot)
    if (step === 0) {
      for (var i = 0; i < targets.length; i++) {
        actions.push({
          method: "setFill",
          nodeId: targets[i].id,
          args: { fills: [{ type: "SOLID", color: hexToRgb(targets[i].lightFill), opacity: targets[i].lightOpacity }] },
        });
      }
      return actions;
    }

    var pal = palettes[step - 1];

    // Swatches get the 3 non-card palette colors
    var swatchIndex = 0;
    var swatchColors = [pal.surface, pal.accent, pal.text];

    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];

      if (t.role === "card") {
        // Card background → darkest palette color
        actions.push({
          method: "setFill",
          nodeId: t.id,
          args: { fills: [{ type: "SOLID", color: hexToRgb(pal.card), opacity: 1 }] },
        });
      } else if (t.role === "surface") {
        // Sphere container → always white at 30% opacity
        actions.push({
          method: "setFill",
          nodeId: t.id,
          args: { fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 0.3 }] },
        });
      } else if (t.role === "text") {
        // Text → lightest palette color
        actions.push({
          method: "setFill",
          nodeId: t.id,
          args: { fills: [{ type: "SOLID", color: hexToRgb(pal.text), opacity: 1 }] },
        });
      } else if (t.role === "swatch") {
        // Color circles → cycle through surface, accent, text
        var sc = swatchColors[swatchIndex % swatchColors.length];
        swatchIndex++;
        actions.push({
          method: "setFill",
          nodeId: t.id,
          args: { fills: [{ type: "SOLID", color: hexToRgb(sc), opacity: 1 }] },
        });
      }
    }

    return actions;
  `;

  return {
    replace: true,
    mode: "live",
    noShrink: true,
    generate,
    controls: [
      {
        id: "theme",
        type: "palette-carousel",
        label: "Theme",
        props: {
          options: [
            {
              value: "0",
              label: "Light",
              colors: ["#FFFFFF", "#333333", "#888888", "#1A1A1A"],
            },
            ...PALETTES.map((p, i) => ({
              value: String(i + 1),
              label: p.name,
              colors: [p.card, p.surface, p.accent, p.text],
            })),
          ],
          defaultValue: "0",
          toastMessage: "Design tokens added to Figma variables",
        },
      },
    ],
  };
}

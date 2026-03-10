import type { UISpec, UIControl } from "../types";

const fullControls: UIControl[] = [
  { id: "dial-a", type: "dial", label: "Rotation X", props: { min: -180, max: 180, step: 1, defaultValue: 0 } },
  { id: "dial-b", type: "dial", label: "Rotation Y", props: { min: -180, max: 180, step: 1, defaultValue: 34 } },
  { id: "slider-opacity", type: "slider", label: "Opacity", props: { min: 0, max: 100, step: 1, defaultValue: 73 } },
  { id: "slider-blur", type: "slider", label: "Blur", props: { min: 0, max: 50, step: 0.5, defaultValue: 4 } },
  { id: "range-size", type: "range", label: "Size Range", props: { min: 4, max: 48, step: 1, defaultValue: { low: 8, high: 24 } } },
  { id: "select-blend", type: "select", label: "Blend Mode", props: { options: ["Off", "Multiply", "Screen", "Overlay"], defaultValue: "Off" } },
  { id: "toggle-visible", type: "toggle", label: "Visible", props: { defaultValue: true } },
  { id: "seg-align", type: "segmented", label: "Alignment", props: { options: [{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }], defaultValue: "center" } },
  { id: "num-radius", type: "number", label: "Border Radius", props: { min: 0, max: 100, step: 1, defaultValue: 8 } },
  { id: "color-fill", type: "color", label: "Fill Color", props: { defaultValue: "#3B82F6" } },
  { id: "text-name", type: "text", label: "Layer Name", props: { placeholder: "Enter a name…", defaultValue: "" } },
  { id: "xy-shadow", type: "xy-pad", label: "Shadow Offset", props: { minX: -50, maxX: 50, minY: -50, maxY: 50, stepX: 1, stepY: 1, defaultValue: { x: -20, y: 15 } } },
  { id: "fill-sunset", type: "fill", label: "Fill", props: { stops: [{ id: "s0", position: 0, color: "#FF6B35" }, { id: "s1", position: 0.5, color: "#F7C948" }, { id: "s2", position: 1, color: "#9B5DE5" }] } },
  { id: "crv-falloff", type: "curve", label: "Falloff Curve", props: { defaultValue: [0.42, 0, 0.58, 1] } },
];

export const MOCK_CONTROLS: Record<string, { label: string; spec: UISpec }> = {
  "": { label: "All Controls", spec: { mode: "live", controls: fullControls } },
  full: { label: "All Controls", spec: { mode: "live", controls: fullControls } },
  dials: {
    label: "Dials",
    spec: {
      mode: "live",
      controls: [
        { id: "dial-a", type: "dial", label: "Rotation X", props: { min: -180, max: 180, step: 1, defaultValue: -45 } },
        { id: "dial-b", type: "dial", label: "Rotation Y", props: { min: -180, max: 180, step: 1, defaultValue: 34 } },
        { id: "dial-c", type: "dial", label: "Skew", props: { min: -90, max: 90, step: 1, defaultValue: 0 } },
      ],
    },
  },
  slider: {
    label: "Sliders",
    spec: {
      mode: "live",
      controls: [
        { id: "sl-opacity", type: "slider", label: "Opacity", props: { min: 0, max: 100, step: 1, defaultValue: 73 } },
        { id: "sl-blur", type: "slider", label: "Blur", props: { min: 0, max: 50, step: 0.5, defaultValue: 4 } },
        { id: "sl-spread", type: "slider", label: "Spread", props: { min: -20, max: 20, step: 1, defaultValue: 0 } },
      ],
    },
  },
  "3d": {
    label: "3D Cube",
    spec: {
      mode: "apply",
      generate: "const rx = params.rx ?? 0; const ry = params.ry ?? 0; const rz = params.rz ?? 0; return [];",
      controls: [
        { id: "rx", type: "dial", label: "Rotate X", props: { min: -180, max: 180, step: 1, defaultValue: 25 } },
        { id: "ry", type: "dial", label: "Rotate Y", props: { min: -180, max: 180, step: 1, defaultValue: -35 } },
        { id: "rz", type: "dial", label: "Rotate Z", props: { min: -180, max: 180, step: 1, defaultValue: 0 } },
        { id: "scale", type: "slider", label: "Scale", props: { min: 0.1, max: 3, step: 0.1, defaultValue: 1 } },
      ],
    },
  },
  toggle: {
    label: "Toggle",
    spec: {
      mode: "live",
      controls: [
        { id: "tg-visible", type: "toggle", label: "Visible", props: { defaultValue: true } },
        { id: "tg-clip", type: "toggle", label: "Clip Content", props: { defaultValue: false } },
        { id: "tg-lock", type: "toggle", label: "Lock Aspect", props: { defaultValue: true } },
      ],
    },
  },
  select: {
    label: "Select",
    spec: {
      mode: "live",
      controls: [
        { id: "sel-blend", type: "select", label: "Blend Mode", props: { options: ["Normal", "Multiply", "Screen", "Overlay", "Darken", "Lighten"], defaultValue: "Normal" } },
        { id: "sel-font", type: "select", label: "Font Weight", props: { options: ["Light", "Regular", "Medium", "Bold", "Black"], defaultValue: "Regular" } },
      ],
    },
  },
  segmented: {
    label: "Segmented",
    spec: {
      mode: "live",
      controls: [
        { id: "seg-align", type: "segmented", label: "Alignment", props: { options: [{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }], defaultValue: "center" } },
        { id: "seg-size", type: "segmented", label: "Size", props: { options: [{ value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }, { value: "xl", label: "XL" }], defaultValue: "md" } },
      ],
    },
  },
  number: {
    label: "Number",
    spec: {
      mode: "live",
      controls: [
        { id: "num-radius", type: "number", label: "Border Radius", props: { min: 0, max: 100, step: 1, defaultValue: 8 } },
        { id: "num-spacing", type: "number", label: "Spacing", props: { min: 0, max: 64, step: 1, defaultValue: 16 } },
      ],
    },
  },
  color: {
    label: "Color",
    spec: {
      mode: "live",
      controls: [
        { id: "col-fill", type: "color", label: "Fill Color", props: { defaultValue: "#3B82F6" } },
        { id: "col-multi", type: "color", label: "Gradient", props: { colors: [{ id: "start", label: "Start", defaultValue: "#3B82F6" }, { id: "end", label: "End", defaultValue: "#8B5CF6" }] } },
      ],
    },
  },
  text: {
    label: "Text",
    spec: {
      mode: "live",
      controls: [
        { id: "txt-name", type: "text", label: "Layer Name", props: { placeholder: "Enter a name…", defaultValue: "" } },
        { id: "txt-desc", type: "text", label: "Description", props: { placeholder: "Add a description…", defaultValue: "A sample description" } },
      ],
    },
  },
  xy: {
    label: "XY Pad",
    spec: {
      mode: "live",
      controls: [
        { id: "xy-shadow", type: "xy-pad", label: "Shadow Offset", props: { minX: -50, maxX: 50, minY: -50, maxY: 50, stepX: 1, stepY: 1, defaultValue: { x: -20, y: 15 } } },
        { id: "xy-origin", type: "xy-pad", label: "Transform Origin", props: { minX: 0, maxX: 100, minY: 0, maxY: 100, stepX: 1, stepY: 1, defaultValue: { x: 50, y: 50 } } },
      ],
    },
  },
  range: {
    label: "Range Slider",
    spec: {
      mode: "live",
      controls: [
        { id: "rng-size", type: "range", label: "Size Range", props: { min: 4, max: 48, step: 1, defaultValue: { low: 8, high: 24 } } },
        { id: "rng-opacity", type: "range", label: "Opacity Range", props: { min: 0, max: 1, step: 0.01, defaultValue: { low: 0.3, high: 0.9 } } },
      ],
    },
  },
  fill: {
    label: "Fill",
    spec: {
      mode: "live",
      controls: [
        { id: "fill-sunset", type: "fill", label: "Sunset Fill", props: { stops: [{ id: "s0", position: 0, color: "#FF6B35" }, { id: "s1", position: 0.5, color: "#F7C948" }, { id: "s2", position: 1, color: "#9B5DE5" }] } },
        { id: "fill-simple", type: "fill", label: "Simple Fill", props: { stops: [{ id: "s0", position: 0, color: "#af2626" }, { id: "s1", position: 1, color: "#878787" }] } },
      ],
    },
  },
  curve: {
    label: "Curve Editor",
    spec: {
      mode: "live",
      controls: [
        { id: "crv-falloff", type: "curve", label: "Size Falloff", props: { defaultValue: [0.42, 0, 0.58, 1] } },
        { id: "crv-ease", type: "curve", label: "Distribution", props: { defaultValue: [0.25, 0.1, 0.25, 1.0] } },
      ],
    },
  },
};

export function getMockControlKeys(): string[] {
  return Object.keys(MOCK_CONTROLS).filter((k) => k !== "");
}

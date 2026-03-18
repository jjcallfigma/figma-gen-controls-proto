# Figma Gen Controls

A browser-based design tool where AI writes parametric controls at runtime. Not a plugin. The controls are part of the file.

You describe a tool you need. The AI returns a generator function that creates canvas objects and a control panel wired to reshape them. The controls persist on the layer, so anyone who opens the file gets the same tool.

---

## Why this exists

Design tools ship a fixed set of controls: radius, opacity, shadow offset. The same knobs for everyone. But the controls you actually need depend on what you're building. A depth slider that coordinates four shadows. An xy-pad that shifts a scatter pattern. A gradient bar that recolors 200 vector cells.

Switches generates these on the fly. Type a sentence, get a working tool. Follow-up prompts refine it. Or skip the prompt and select something you've already designed; the AI reads the object and builds the controls for you.

---

## How it works

```
User prompt
  -> LLM returns { actions, ui, generate }
    -> actions create/update canvas objects
    -> ui spec defines the control panel
    -> generate is a JS function that re-runs on every control change
      -> all interactions are local, no API calls after generation
```

The LLM writes a generator function and a control spec. The generator runs client-side. Drag a slider, the generator re-executes with new parameters, the canvas updates. No round-trip after the initial generation.

### Generator runtime

Generators get a runtime library: color manipulation (chroma.js), Perlin/simplex noise, easing functions, Delaunay triangulation, image processing (Canvas2D pixel access), 3D projection, L-system turtle graphics, Rough.js sketchy rendering, QR code generation, flow fields, reaction-diffusion, circle packing, metaballs, cellular automata, and others.

### Local generators

Some generators are built-in and skip the LLM. The image grid generator triggers when you select 2+ images and type "image grid." It runs locally and produces a layout with a grid selector, gap slider, corner radius, and background color.

---

## Control types

| Type | Description |
|---|---|
| `slider` | Horizontal numeric slider with inline editable value |
| `range` | Dual-handle slider for min/max ranges |
| `dial` | Circular angle knob |
| `xy-pad` | 2D crosshair pad for offsets and directions |
| `color` | Hex color picker with swatch (single solid color) |
| `fill` | Fill picker: solid, linear/radial/angular gradients with editable stops |
| `curve` | Cubic bezier editor for easing and distribution curves |
| `3d-preview` | Interactive 3D cube for rotation (rx, ry, rz) |
| `grid-selector` | 2x3 grid of selectable SVG thumbnails for layout/style presets |
| `toggle` | Boolean on/off |
| `select` | Dropdown |
| `segmented` | Multi-option pill selector |
| `number` | Numeric input with stepping |
| `text` | Text input |

Three sizes: `large` (default, horizontal label + control), `small` (compact horizontal), `xl` (vertical, label above, full width).

---

## Auto-generate

Select any object on the canvas and click + in the properties panel. The AI reads the object's fills, strokes, effects, layout, and children, then returns a control panel wired to the actual node IDs. No prompt needed.

---

## Entry points

- AI sidebar: chat interface in the left panel with per-frame conversation history and a model switcher (GPT-5.2 / Claude).
- On-canvas star: appears at the selection bounds. Click it for a mini-prompt attached to the object.
- Properties panel: generated controls show up under a "Custom" section. The + button triggers auto-generate.

---

## Canvas

DOM-based renderer with world/screen coordinate transforms. Every object is a DOM node (no HTML canvas element), so you can inspect everything in devtools.

### Object types

Frame, rectangle, ellipse, text, vector, component, instance.

### Fills and strokes

Solid, linear gradient, radial gradient, and image fills. Per-fill blend modes and opacity. Strokes with inside/center/outside positioning and per-side widths.

### Effects

Drop shadow, inner shadow, layer blur. Each with independent color, opacity, offset, blur, and spread.

### Layout

Auto layout (horizontal, vertical, grid) with gap, padding, wrap, alignment, and per-child fill/fixed/hug sizing. Constraints for responsive behavior.

### Components

Main components (purple diamond) and instances (green diamond). Changes to a main component propagate to instances. Property overrides on instances. Create with Cmd+K / Cmd+I.

### Vectors

SVG path data, vector networks, boolean operations, winding rules. Point-level editing.

### Images

Image fills with fit/fill/crop/tile modes, scale, rotation, and adjustments (exposure, contrast, saturation, temperature, tint, highlights, shadows).

---

## Architecture

### State

Event-sourced Zustand store with Immer. All mutations go through `dispatch(createEvent(...))`. Undo/redo stacks are maintained automatically (50 entries). High-frequency state like drag positions and resize lives in a separate transient store to avoid re-render overhead.

### Persistence

IndexedDB via `canvasDB`. Auto-saves with debounce. Persisted state includes objects, pages, components, canvas settings, viewport, and all `genAiSpec` / `genAiValues` on objects.

### Token optimization

The system prompt is modular, assembled from keyword-matched modules so simple prompts get small system prompts. Chat history is summarized: last 3 turns verbatim, older turns compressed. Generator code and action arrays are stripped from history context. A pre-flight guard drops the oldest turns if the estimated token count exceeds 100K.

### Theming

Light and dark modes via Figma design tokens (CSS custom properties). System preference detection with localStorage override.

---

## Tech stack

- Next.js 16 (App Router), React 19
- TypeScript (strict mode)
- Tailwind CSS 3, Figma design tokens, FigUI3 web components
- Zustand + Immer (event-sourced) + transient store
- Radix UI / shadcn + FigUI3 (`@rogieking/figui3`)
- Custom DOM-based renderer

---

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Importing Figma files

Pass a Figma API token and file ID as URL params:

```
http://localhost:3000?figma-token={TOKEN}&figma-file={FILE_ID}
```

### Building

```bash
# Standard build
npm run build && npm run start

# Static export
npm run build:static

# Static with base path
npm run build:static:custom -- --base-path=/figma-clone
```

Static files go to `out/` for deployment to any static host.

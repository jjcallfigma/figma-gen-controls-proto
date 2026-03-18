# Switches

A browser-based design tool prototype exploring what happens when AI generates parametric controls natively — not as a plugin, but as part of the surface.

Describe a tool you need. The AI writes it: a generator function that creates canvas objects, and a control panel wired to reshape them in real time. The controls persist on the layer. Anyone who opens the file gets the same tool.

---

## The idea

Design tools ship a fixed set of controls. Radius, opacity, shadow offset — the same knobs for every designer on every project. But the controls you actually need are specific to your task: a depth slider that orchestrates four shadows, an xy-pad that shifts a scatter pattern like wind, a gradient bar that recolors 200 vector cells.

Switches generates these controls on the fly. One sentence becomes a working tool. Follow-up prompts refine it. Or skip the prompt entirely — select something you've already designed, and the AI reverse-engineers the controls.

---

## How it works

```
User prompt
  → LLM returns { actions, ui, generate }
    → actions create/update canvas objects
    → ui spec defines the control panel
    → generate is a JS function that re-runs on every control change
      → all interactions are local — no API calls after generation
```

The LLM writes a generator function and a control spec. The generator runs client-side: drag a slider, the generator re-executes with new parameters, and the canvas updates. The round-trip is local. After the initial generation, every interaction is instant.

### Generator runtime

Generators have access to a runtime library with: color manipulation (chroma.js), Perlin/simplex noise, easing functions, Delaunay triangulation, image processing (Canvas2D pixel access), 3D projection, L-system turtle graphics, Rough.js sketchy rendering, QR code generation, flow fields, reaction-diffusion, circle packing, metaballs, cellular automata, and more.

### Local generators

Some generators ship built-in and skip the LLM entirely. The **image grid** generator triggers when you select 2+ images and type "image grid" — it runs locally, producing a layout with a grid selector, gap slider, corner radius, and background color. Every change is a local function call.

---

## Control types

| Type | What it does |
|---|---|
| `slider` | Horizontal numeric slider with inline editable value |
| `range` | Dual-handle slider for min/max ranges |
| `dial` | Circular angle knob |
| `xy-pad` | 2D crosshair pad for offsets and directions |
| `color` | Hex color picker with swatch (single solid color) |
| `fill` | Full fill picker — solid, linear/radial/angular gradients with editable stops |
| `curve` | Cubic bezier editor for easing and distribution curves |
| `3d-preview` | Interactive 3D cube for rotation (rx, ry, rz) |
| `grid-selector` | 2x3 grid of selectable SVG thumbnails for layout/style presets |
| `toggle` | Boolean on/off |
| `select` | Dropdown |
| `segmented` | Multi-option pill selector |
| `number` | Numeric input with stepping |
| `text` | Text input |

Controls support three sizes: `large` (default, horizontal label + control), `small` (compact horizontal), and `xl` (vertical, label above, full width).

---

## Auto-generate

Select any object on the canvas. Click the **+** button in the properties panel. The AI inspects the object's fills, strokes, effects, layout, and children, then returns a control panel wired to the actual node IDs. No prompt, no description — it reverse-engineers your design into a parametric tool.

---

## Entry points

- **AI sidebar** — Full chat interface in the left panel. Per-frame conversation history. Model switcher (GPT-5.2 / Claude).
- **On-canvas star** — A small star appears at the selection bounds. Click it for a mini-prompt attached to the object.
- **Properties panel** — Generated controls appear under a "Custom" section in the right panel. The **+** button triggers auto-generate.

---

## Canvas

DOM-based renderer with world/screen coordinate transforms. No HTML canvas element — every object is a DOM node, fully inspectable.

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

SVG path data, vector networks, boolean operations, winding rules. Full point-level editing.

### Images

Image fills with fit/fill/crop/tile modes, scale, rotation, and adjustments (exposure, contrast, saturation, temperature, tint, highlights, shadows).

---

## Architecture

### State

Event-sourced Zustand store with Immer. All mutations go through `dispatch(createEvent(...))`. Undo/redo stacks maintained automatically (50 entries). High-frequency state (drag positions, resize) lives in a separate transient store to avoid re-render overhead.

### Persistence

IndexedDB via `canvasDB`. Auto-saves with debounce. Persisted state includes objects, pages, components, canvas settings, viewport, and all `genAiSpec` / `genAiValues` on objects.

### Token optimization

The system prompt is modular — assembled from keyword-matched modules so simple prompts get small system prompts. Chat history is summarized (last 3 turns verbatim, older turns compressed). Generator code and action arrays are stripped from history context. A pre-flight guard drops oldest turns if the estimated token count exceeds 100K.

### Theming

Light and dark modes via Figma design tokens (CSS custom properties). System preference detection with localStorage override.

---

## Tech stack

- **Framework:** Next.js 16 (App Router), React 19
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS 3, Figma design tokens, FigUI3 web components
- **State:** Zustand + Immer (event-sourced) + transient store
- **UI primitives:** Radix UI / shadcn + FigUI3 (`@rogieking/figui3`)
- **Canvas:** Custom DOM-based renderer

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

Static files output to `out/` for deployment to any web server, CDN, or static host.

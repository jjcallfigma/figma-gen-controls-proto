import { MakeMode } from "@/types/canvas";

// ─── Smart stubs for common components ───────────────────────────────
// Maps component names to stub implementations that render as proper HTML
// elements instead of generic <div>s. This makes the static canvas preview
// look much closer to the real Sandpack-rendered output.
const SMART_STUBS: Record<string, string> = {
  // Form elements
  Button: `const Button = React.forwardRef(function Button({asChild, variant, size, ...p}, r) { return React.createElement("button", {...p, ref: r}, p.children); });`,
  Input: `const Input = React.forwardRef(function Input({className, ...p}, r) { return React.createElement("input", {...p, ref: r, className}); });`,
  Textarea: `const Textarea = React.forwardRef(function Textarea({className, ...p}, r) { return React.createElement("textarea", {...p, ref: r, className}); });`,
  Label: `const Label = React.forwardRef(function Label(p, r) { return React.createElement("label", {...p, ref: r}, p.children); });`,
  Checkbox: `const Checkbox = React.forwardRef(function Checkbox({className, ...p}, r) { return React.createElement("input", {type: "checkbox", ...p, ref: r, className}); });`,
  Switch: `const Switch = React.forwardRef(function Switch({className, ...p}, r) { return React.createElement("input", {type: "checkbox", role: "switch", ...p, ref: r, className}); });`,
  Slider: `const Slider = React.forwardRef(function Slider({className, ...p}, r) { return React.createElement("input", {type: "range", ...p, ref: r, className}); });`,
  Progress: `const Progress = React.forwardRef(function Progress({value, className, ...p}, r) { return React.createElement("progress", {value, max: 100, ...p, ref: r, className}); });`,

  // Layout / Card
  Card: `const Card = React.forwardRef(function Card(p, r) { return React.createElement("div", {...p, ref: r}, p.children); });`,
  CardHeader: `const CardHeader = React.forwardRef(function CardHeader(p, r) { return React.createElement("div", {...p, ref: r}, p.children); });`,
  CardTitle: `const CardTitle = React.forwardRef(function CardTitle(p, r) { return React.createElement("h3", {...p, ref: r}, p.children); });`,
  CardDescription: `const CardDescription = React.forwardRef(function CardDescription(p, r) { return React.createElement("p", {...p, ref: r}, p.children); });`,
  CardContent: `const CardContent = React.forwardRef(function CardContent(p, r) { return React.createElement("div", {...p, ref: r}, p.children); });`,
  CardFooter: `const CardFooter = React.forwardRef(function CardFooter(p, r) { return React.createElement("div", {...p, ref: r}, p.children); });`,

  // Typography / inline
  Badge: `const Badge = React.forwardRef(function Badge({variant, ...p}, r) { return React.createElement("span", {...p, ref: r}, p.children); });`,
  Separator: `const Separator = React.forwardRef(function Separator({orientation, decorative, ...p}, r) { return React.createElement("hr", {...p, ref: r}); });`,
  Avatar: `const Avatar = React.forwardRef(function Avatar(p, r) { return React.createElement("span", {...p, ref: r}, p.children); });`,
  AvatarImage: `const AvatarImage = React.forwardRef(function AvatarImage(p, r) { return React.createElement("img", {...p, ref: r}); });`,
  AvatarFallback: `const AvatarFallback = React.forwardRef(function AvatarFallback(p, r) { return React.createElement("span", {...p, ref: r}, p.children); });`,

  // Table
  Table: `const Table = React.forwardRef(function Table(p, r) { return React.createElement("table", {...p, ref: r}, p.children); });`,
  TableHeader: `const TableHeader = React.forwardRef(function TableHeader(p, r) { return React.createElement("thead", {...p, ref: r}, p.children); });`,
  TableBody: `const TableBody = React.forwardRef(function TableBody(p, r) { return React.createElement("tbody", {...p, ref: r}, p.children); });`,
  TableRow: `const TableRow = React.forwardRef(function TableRow(p, r) { return React.createElement("tr", {...p, ref: r}, p.children); });`,
  TableHead: `const TableHead = React.forwardRef(function TableHead(p, r) { return React.createElement("th", {...p, ref: r}, p.children); });`,
  TableCell: `const TableCell = React.forwardRef(function TableCell(p, r) { return React.createElement("td", {...p, ref: r}, p.children); });`,

  // Scroll / container
  ScrollArea: `const ScrollArea = React.forwardRef(function ScrollArea(p, r) { return React.createElement("div", {...p, ref: r, style: {...(p.style||{}), overflow: "auto"}}, p.children); });`,
  ScrollBar: `const ScrollBar = function ScrollBar() { return null; };`,

  // Accordion (use <details>/<summary>)
  Accordion: `const Accordion = React.forwardRef(function Accordion(p, r) { return React.createElement("div", {...p, ref: r}, p.children); });`,
  AccordionItem: `const AccordionItem = React.forwardRef(function AccordionItem(p, r) { return React.createElement("details", {...p, ref: r, open: true}, p.children); });`,
  AccordionTrigger: `const AccordionTrigger = React.forwardRef(function AccordionTrigger(p, r) { return React.createElement("summary", {...p, ref: r}, p.children); });`,
  AccordionContent: `const AccordionContent = React.forwardRef(function AccordionContent(p, r) { return React.createElement("div", {...p, ref: r}, p.children); });`,

  // Select (simplified)
  Select: `const Select = function Select(p) { return React.createElement("div", null, p.children); };`,
  SelectTrigger: `const SelectTrigger = React.forwardRef(function SelectTrigger(p, r) { return React.createElement("button", {...p, ref: r}, p.children); });`,
  SelectValue: `const SelectValue = function SelectValue(p) { return React.createElement("span", null, p.placeholder || ""); };`,
  SelectContent: `const SelectContent = function SelectContent() { return null; };`,
  SelectItem: `const SelectItem = function SelectItem() { return null; };`,
  SelectGroup: `const SelectGroup = function SelectGroup() { return null; };`,
  SelectLabel: `const SelectLabel = function SelectLabel() { return null; };`,

  // Dialog / Sheet / Popover / Tooltip — show trigger, hide overlay content
  Dialog: `const Dialog = function Dialog(p) { return React.createElement(React.Fragment, null, p.children); };`,
  DialogTrigger: `const DialogTrigger = React.forwardRef(function DialogTrigger({asChild, ...p}, r) { return React.createElement("span", {...p, ref: r}, p.children); });`,
  DialogContent: `const DialogContent = function DialogContent() { return null; };`,
  DialogHeader: `const DialogHeader = function DialogHeader(p) { return React.createElement("div", p, p.children); };`,
  DialogTitle: `const DialogTitle = function DialogTitle(p) { return React.createElement("h2", p, p.children); };`,
  DialogDescription: `const DialogDescription = function DialogDescription(p) { return React.createElement("p", p, p.children); };`,
  DialogFooter: `const DialogFooter = function DialogFooter(p) { return React.createElement("div", p, p.children); };`,
  DialogClose: `const DialogClose = function DialogClose(p) { return React.createElement("button", p, p.children); };`,

  Sheet: `const Sheet = function Sheet(p) { return React.createElement(React.Fragment, null, p.children); };`,
  SheetTrigger: `const SheetTrigger = React.forwardRef(function SheetTrigger({asChild, ...p}, r) { return React.createElement("span", {...p, ref: r}, p.children); });`,
  SheetContent: `const SheetContent = function SheetContent() { return null; };`,
  SheetHeader: `const SheetHeader = function SheetHeader(p) { return React.createElement("div", p, p.children); };`,
  SheetTitle: `const SheetTitle = function SheetTitle(p) { return React.createElement("h2", p, p.children); };`,
  SheetDescription: `const SheetDescription = function SheetDescription(p) { return React.createElement("p", p, p.children); };`,

  Popover: `const Popover = function Popover(p) { return React.createElement(React.Fragment, null, p.children); };`,
  PopoverTrigger: `const PopoverTrigger = React.forwardRef(function PopoverTrigger({asChild, ...p}, r) { return React.createElement("span", {...p, ref: r}, p.children); });`,
  PopoverContent: `const PopoverContent = function PopoverContent() { return null; };`,

  Tooltip: `const Tooltip = function Tooltip(p) { return React.createElement(React.Fragment, null, p.children); };`,
  TooltipTrigger: `const TooltipTrigger = React.forwardRef(function TooltipTrigger({asChild, ...p}, r) { return React.createElement("span", {...p, ref: r}, p.children); });`,
  TooltipContent: `const TooltipContent = function TooltipContent() { return null; };`,
  TooltipProvider: `const TooltipProvider = function TooltipProvider(p) { return React.createElement(React.Fragment, null, p.children); };`,

  // Dropdown menu
  DropdownMenu: `const DropdownMenu = function DropdownMenu(p) { return React.createElement(React.Fragment, null, p.children); };`,
  DropdownMenuTrigger: `const DropdownMenuTrigger = React.forwardRef(function DropdownMenuTrigger({asChild, ...p}, r) { return React.createElement("span", {...p, ref: r}, p.children); });`,
  DropdownMenuContent: `const DropdownMenuContent = function DropdownMenuContent() { return null; };`,
  DropdownMenuItem: `const DropdownMenuItem = function DropdownMenuItem() { return null; };`,
  DropdownMenuSeparator: `const DropdownMenuSeparator = function DropdownMenuSeparator() { return null; };`,
  DropdownMenuLabel: `const DropdownMenuLabel = function DropdownMenuLabel() { return null; };`,

  // Tabs — show only first tab content, styled triggers
  Tabs: `const Tabs = React.forwardRef(function Tabs(p, r) { return React.createElement("div", {...p, ref: r}, p.children); });`,
  TabsList: `const TabsList = React.forwardRef(function TabsList(p, r) { return React.createElement("div", {...p, ref: r, "data-tab-list": ""}, p.children); });`,
  TabsTrigger: `const TabsTrigger = React.forwardRef(function TabsTrigger(p, r) { return React.createElement("button", {...p, ref: r, "data-tab-trigger": ""}, p.children); });`,
  TabsContent: `const TabsContent = React.forwardRef(function TabsContent(p, r) { return React.createElement("div", {...p, ref: r, "data-tab-content": ""}, p.children); });`,

  // Icons — lucide-react icons render as empty inline SVGs
  // (The namespace import proxy handles this, but named imports need a stub)
};

/** Get the smart stub for a component name, or null if not available */
function getSmartStub(name: string): string | null {
  return SMART_STUBS[name] ?? null;
}

/**
 * Create stub declarations for npm imports so the canvas preview doesn't crash.
 * Uses smart stubs (proper HTML elements) for known components, generic div
 * stubs for everything else.
 */
function stubNpmImport(line: string): string {
  // Named/destructured imports: import { A, B as C } from "pkg"
  const destructuredMatch = line.match(/import\s+\{([^}]+)\}\s+from/);
  if (destructuredMatch) {
    const names = destructuredMatch[1]
      .split(",")
      .map((n) => {
        const parts = n.trim().split(/\s+as\s+/);
        return parts[parts.length - 1].trim();
      })
      .filter(Boolean);
    return names
      .map((name) => {
        const smart = getSmartStub(name);
        if (smart) return smart;
        return `const ${name} = React.forwardRef(function ${name}(props, ref) { return React.createElement("div", { ...props, ref, "data-stub": "${name}" }, props.children); });`;
      })
      .join("\n");
  }

  // Default import: import Pkg from "pkg"
  const defaultMatch = line.match(/import\s+(\w+)\s+from/);
  if (defaultMatch) {
    const name = defaultMatch[1];
    const smart = getSmartStub(name);
    if (smart) return smart;
    return `const ${name} = React.forwardRef(function ${name}(props, ref) { return React.createElement("div", { ...props, ref, "data-stub": "${name}" }, props.children); });`;
  }

  // Namespace import: import * as Pkg from "pkg"
  const namespaceMatch = line.match(/import\s+\*\s+as\s+(\w+)\s+from/);
  if (namespaceMatch) {
    const name = namespaceMatch[1];
    // Return a Proxy that checks SMART_STUBS first, then falls back to generic div
    return `const ${name} = new Proxy({}, { get(_, prop) { if (prop === '__esModule') return true; const C = React.forwardRef(function(p, r) { return React.createElement("div", { ...p, ref: r, "data-stub": prop }, p.children); }); C.displayName = prop; return C; }});`;
  }

  // Side-effect import: import "pkg" — just skip
  return `// ${line.trim()}`;
}

/**
 * Wrap React/JSX code in an HTML document with React + Babel from CDN (used for canvas preview).
 * Includes the full theme CSS so shadcn semantic classes (bg-primary etc.) work in the static preview.
 * NOTE: `_themeCSS` is injected lazily because the theme CSS is built later in this file.
 */
export function wrapReactCode(reactCode: string): string {
  // For canvas preview, we use Babel standalone as a lightweight fallback.
  // npm packages are replaced with stub components that render as pass-through divs.

  // Pre-process: collapse multi-line imports into single lines so the
  // per-line transform below can match them correctly.
  const normalizedCode = reactCode.replace(
    /import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["']\s*;?/g,
    (m) => m.replace(/\n\s*/g, " "),
  );

  const strippedCode = normalizedCode
    .split("\n")
    .map((line) => {
      // Convert `import { X } from "react"` to destructuring from React global
      if (/^\s*import\s+.*\s+from\s+["']react["']/.test(line)) {
        const match = line.match(/import\s+\{([^}]+)\}\s+from/);
        if (match) {
          return `const {${match[1]}} = React;`;
        }
        return ""; // skip default imports like `import React from "react"`
      }
      // npm package imports → create stub components
      if (/^\s*import\s+/.test(line)) return stubNpmImport(line);
      // Convert `export default` to plain declaration
      if (/^\s*export\s+default\s+/.test(line))
        return line.replace(/export\s+default\s+/, "");
      return line;
    })
    .join("\n");

  // If there's no render call, add one
  const hasRenderCall =
    strippedCode.includes("createRoot") || strippedCode.includes("render(");
  const renderSuffix = hasRenderCall
    ? ""
    : `\nReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));`;

  // Use the full theme CSS (available after module initialisation)
  const themeCSS = _getThemeCSS();

  // Extra CSS for the Babel preview only — restores sensible form element
  // styling that Tailwind's preflight resets, and handles stub quirks.
  const previewCSS = `
/* Restore form element styling (Tailwind preflight removes borders/padding) */
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
textarea {
  display: flex;
  width: 100%;
  border: 1px solid hsl(var(--input));
  border-radius: calc(var(--radius) - 2px);
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  background: transparent;
  outline: none;
}
input::placeholder, textarea::placeholder {
  color: hsl(var(--muted-foreground));
}
button {
  cursor: pointer;
}
/* Show only the first tab content panel (stubs can't manage tab state) */
[data-tab-content] ~ [data-tab-content] {
  display: none;
}
/* Basic tab list styling */
[data-tab-list] {
  display: inline-flex;
  gap: 0;
  background: hsl(var(--muted));
  border-radius: calc(var(--radius) - 2px);
  padding: 4px;
}
[data-tab-trigger] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: calc(var(--radius) - 4px);
  background: transparent;
  border: none;
  color: hsl(var(--muted-foreground));
}
[data-tab-trigger]:first-child {
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script>tailwind.config={theme:{extend:{fontFamily:{sans:['"Inter"','ui-sans-serif','system-ui','sans-serif']}}}}<\/script>
  <style>
${themeCSS}
${previewCSS}
  </style>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
${strippedCode}${renderSuffix}
  <\/script>
</body>
</html>`;
}

/** Convert stored code to renderable HTML based on mode */
export function codeToSrcDoc(code: string, mode: MakeMode): string {
  if (
    mode === "react" &&
    code &&
    !code.trim().startsWith("<!DOCTYPE") &&
    !code.trim().startsWith("<html")
  ) {
    return wrapReactCode(code);
  }
  return code;
}

/** Inject scrollbar-hiding CSS into an HTML string */
export function injectHideScrollbars(html: string): string {
  const hideScrollbarStyle = `<style>::-webkit-scrollbar{display:none}html{scrollbar-width:none;-ms-overflow-style:none}</style>`;
  return html.includes("<head>")
    ? html.replace("<head>", `<head>${hideScrollbarStyle}`)
    : `${hideScrollbarStyle}${html}`;
}

/** Default React code for new Makes in React mode (Sandpack App component) */
export const DEFAULT_REACT_CODE = `import { useState, useRef, useCallback } from "react";

const COLORS = ["#a78bfa", "#38bdf8", "#f472b6", "#34d399", "#fb923c", "#facc15", "#f87171", "#818cf8"];
const PARTICLE_COUNT = 80;
const GRAVITY = 980;
const DURATION = 2.5;

const SHAPES = ["rect", "circle", "strip"];

function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

function createParticles(originX, originY) {
  return Array.from({ length: PARTICLE_COUNT }, () => {
    const angle = randomBetween(0, Math.PI * 2);
    const speed = randomBetween(300, 700);
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed * randomBetween(0.4, 1),
      vy: Math.sin(angle) * speed * randomBetween(0.5, 1) - randomBetween(200, 500),
      rotation: randomBetween(0, 360),
      rotationSpeed: randomBetween(-600, 600),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: randomBetween(4, 8),
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      drag: randomBetween(0.97, 0.995),
      wobblePhase: randomBetween(0, Math.PI * 2),
      wobbleSpeed: randomBetween(3, 8),
    };
  });
}

export default function App() {
  const [hovered, setHovered] = useState(false);
  const canvasRef = useRef(null);
  const raf = useRef(null);
  const anim = useRef(null);

  const draw = useCallback((ts) => {
    if (!anim.current) return;
    const { start, particles } = anim.current;
    const elapsed = (ts - start) / 1000;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (elapsed >= DURATION) {
      anim.current = null;
      raf.current = null;
      return;
    }

    const dt = anim.current.lastTime ? (ts - anim.current.lastTime) / 1000 : 1 / 60;
    anim.current.lastTime = ts;
    const fade = elapsed > DURATION * 0.6 ? 1 - (elapsed - DURATION * 0.6) / (DURATION * 0.4) : 1;

    particles.forEach((p) => {
      p.vy += GRAVITY * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;
      const wobble = Math.sin(elapsed * p.wobbleSpeed + p.wobblePhase) * 15;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(((p.rotation + wobble) * Math.PI) / 180);
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = p.color;

      if (p.shape === "rect") {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size * 0.15, p.size, p.size * 0.3);
      }

      ctx.restore();
    });

    raf.current = requestAnimationFrame(draw);
  }, []);

  const trigger = useCallback((e) => {
    if (raf.current) cancelAnimationFrame(raf.current);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const ox = (e.clientX - rect.left) * scaleX;
    const oy = (e.clientY - rect.top) * scaleY;
    anim.current = {
      start: performance.now(),
      lastTime: null,
      particles: createParticles(ox, oy),
    };
    raf.current = requestAnimationFrame(draw);
  }, [draw]);

  return (
    <div
      className="relative flex items-center justify-center min-h-screen font-sans overflow-hidden"
      ref={(el) => {
        if (!el || canvasRef.current) return;
        const canvas = document.createElement("canvas");
        canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
        el.appendChild(canvas);
        canvasRef.current = canvas;
        const resize = () => {
          canvas.width = canvas.offsetWidth * 2;
          canvas.height = canvas.offsetHeight * 2;
        };
        resize();
        window.addEventListener("resize", resize);
      }}
    >
      <style>{\`
        @keyframes wave {
          0% { transform: rotate(0deg); }
          15% { transform: rotate(14deg); }
          30% { transform: rotate(-8deg); }
          45% { transform: rotate(14deg); }
          60% { transform: rotate(-4deg); }
          75% { transform: rotate(10deg); }
          100% { transform: rotate(0deg); }
        }
      \`}</style>
      <button
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={trigger}
        className="relative z-10 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 outline-none"
        style={{
          backgroundColor: hovered ? "var(--color-bg-inverse, #111)" : "var(--color-bg, #fff)",
          color: hovered ? "var(--color-text-inverse, #fff)" : "var(--color-text-secondary, #999)",
          border: "1px solid transparent",
        }}
      >
        <span
          style={{
            display: "inline-block",
            transformOrigin: "70% 70%",
            animation: hovered ? "wave 0.5s ease-in-out" : "none",
            marginRight: 4,
          }}
        >
          \u{1F44B}
        </span>
        Hello, Make!
      </button>
    </div>
  );
}`;

// SANDPACK_INDEX_JS is defined after SANDPACK_THEME_CSS (see below)
// so it can embed the CSS inline — no file imports needed.

// SANDPACK_STYLES_OVERRIDE is defined after SANDPACK_THEME_CSS (see below).

// ─── Theme CSS builder ──────────────────────────────────────────────
// Generates a comprehensive CSS file that provides:
// 1. CSS custom properties (shadcn design tokens)
// 2. All semantic utility classes (bg-primary, text-foreground, etc.)
// 3. Hover, focus, data-attribute, and placeholder variants
// 4. Animation keyframes for shadcn components
//
// This is used as a bundled CSS file (/theme.css) imported by the entry
// point. The standard Tailwind CDN (loaded via externalResources) handles
// standard utilities (flex, p-4, text-sm, etc.), and this CSS handles
// everything config-dependent — no Tailwind config needed.

/** Escape special CSS selector characters */
function cssesc(s: string): string {
  return s
    .replace(/\//g, "\\/")
    .replace(/:/g, "\\:")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/=/g, "\\=");
}

function buildThemeCSS(): string {
  const r: string[] = [];

  // ── 1. CSS Custom Properties ─────────────────────────────────────
  r.push(`:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 240 5.9% 10%;
  --radius: 0.625rem;
  --chart-1: 12 76% 61%;
  --chart-2: 173 58% 39%;
  --chart-3: 197 37% 24%;
  --chart-4: 43 74% 66%;
  --chart-5: 27 87% 67%;
}`);

  // ── 2. Base Styles ───────────────────────────────────────────────
  r.push(`::-webkit-scrollbar { display: none; }
html { scrollbar-width: none; -ms-overflow-style: none; }
* { margin: 0; padding: 0; box-sizing: border-box; border-color: hsl(var(--border)); }
body {
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}`);

  // ── 3. Semantic Utility Classes ──────────────────────────────────
  const tokens = [
    "background",
    "foreground",
    "card",
    "card-foreground",
    "popover",
    "popover-foreground",
    "primary",
    "primary-foreground",
    "secondary",
    "secondary-foreground",
    "muted",
    "muted-foreground",
    "accent",
    "accent-foreground",
    "destructive",
    "destructive-foreground",
    "border",
    "input",
    "ring",
  ];

  // bg-{token}
  for (const t of tokens) {
    r.push(`.bg-${t} { background-color: hsl(var(--${t})); }`);
  }

  // text-{token}
  for (const t of tokens) {
    r.push(`.text-${t} { color: hsl(var(--${t})); }`);
  }

  // border-{token}
  for (const t of tokens) {
    r.push(`.border-${t} { border-color: hsl(var(--${t})); }`);
  }

  // ── 4. Opacity Variants (bg-{token}/{opacity}) ───────────────────
  const opacityTokens = [
    "primary",
    "secondary",
    "destructive",
    "accent",
    "muted",
    "foreground",
    "background",
  ];
  const opacitySteps = [
    5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95,
  ];

  for (const t of opacityTokens) {
    for (const o of opacitySteps) {
      const alpha = (o / 100).toString();
      r.push(
        `.bg-${cssesc(t + "/" + o)} { background-color: hsl(var(--${t}) / ${alpha}); }`,
      );
      r.push(
        `.text-${cssesc(t + "/" + o)} { color: hsl(var(--${t}) / ${alpha}); }`,
      );
      r.push(
        `.border-${cssesc(t + "/" + o)} { border-color: hsl(var(--${t}) / ${alpha}); }`,
      );
    }
  }

  // ── 5. Ring Utilities ────────────────────────────────────────────
  r.push(`.ring-ring { --tw-ring-color: hsl(var(--ring)); }`);
  r.push(`.ring-primary { --tw-ring-color: hsl(var(--primary)); }`);
  r.push(`.ring-destructive { --tw-ring-color: hsl(var(--destructive)); }`);
  r.push(`.ring-border { --tw-ring-color: hsl(var(--border)); }`);
  r.push(
    `.ring-offset-background { --tw-ring-offset-color: hsl(var(--background)); }`,
  );

  // ── 6. Hover Variants ────────────────────────────────────────────
  for (const t of tokens) {
    r.push(
      `.${cssesc("hover:bg-" + t)}:hover { background-color: hsl(var(--${t})); }`,
    );
    r.push(`.${cssesc("hover:text-" + t)}:hover { color: hsl(var(--${t})); }`);
    r.push(
      `.${cssesc("hover:border-" + t)}:hover { border-color: hsl(var(--${t})); }`,
    );
  }
  // Hover with opacity
  for (const t of opacityTokens) {
    for (const o of opacitySteps) {
      const alpha = (o / 100).toString();
      r.push(
        `.${cssesc("hover:bg-" + t + "/" + o)}:hover { background-color: hsl(var(--${t}) / ${alpha}); }`,
      );
      r.push(
        `.${cssesc("hover:text-" + t + "/" + o)}:hover { color: hsl(var(--${t}) / ${alpha}); }`,
      );
    }
  }

  // ── 7. Focus Variants ────────────────────────────────────────────
  r.push(
    `.${cssesc("focus-visible:ring-ring")}:focus-visible { --tw-ring-color: hsl(var(--ring)); }`,
  );
  r.push(
    `.${cssesc("focus:ring-ring")}:focus { --tw-ring-color: hsl(var(--ring)); }`,
  );
  r.push(
    `.${cssesc("focus:bg-accent")}:focus { background-color: hsl(var(--accent)); }`,
  );
  r.push(
    `.${cssesc("focus:text-accent-foreground")}:focus { color: hsl(var(--accent-foreground)); }`,
  );
  r.push(
    `.${cssesc("focus-visible:ring-primary")}:focus-visible { --tw-ring-color: hsl(var(--primary)); }`,
  );

  // ── 8. Data-Attribute Variants ───────────────────────────────────
  const dataVariants: [string, string, string, string][] = [
    // [data-attr, utility-suffix, css-prop, css-var]
    ["state=checked", "bg-primary", "background-color", "--primary"],
    [
      "state=checked",
      "text-primary-foreground",
      "color",
      "--primary-foreground",
    ],
    ["state=unchecked", "bg-input", "background-color", "--input"],
    ["state=active", "bg-background", "background-color", "--background"],
    ["state=active", "text-foreground", "color", "--foreground"],
    ["state=active", "shadow-sm", "", ""], // handled by Tailwind CDN
    ["state=open", "bg-accent", "background-color", "--accent"],
    ["state=open", "bg-secondary", "background-color", "--secondary"],
    ["state=open", "text-muted-foreground", "color", "--muted-foreground"],
  ];
  for (const [attr, cls, prop, cssvar] of dataVariants) {
    if (!prop || !cssvar) continue;
    const [attrName, attrVal] = attr.split("=");
    const fullClass = `data-[${attr}]:${cls}`;
    r.push(
      `.${cssesc(fullClass)}[data-${attrName}="${attrVal}"] { ${prop}: hsl(var(${cssvar})); }`,
    );
  }

  // ── 9. Placeholder Variants ──────────────────────────────────────
  r.push(
    `.${cssesc("placeholder:text-muted-foreground")}::placeholder { color: hsl(var(--muted-foreground)); }`,
  );

  // ── 10. File Variants ────────────────────────────────────────────
  r.push(
    `.${cssesc("file:text-foreground")}::file-selector-button { color: hsl(var(--foreground)); }`,
  );
  r.push(
    `.${cssesc("file:border-0")}::file-selector-button { border-width: 0; }`,
  );
  r.push(
    `.${cssesc("file:bg-transparent")}::file-selector-button { background-color: transparent; }`,
  );

  // ── 11. Animation Keyframes & Utility Classes ────────────────────
  r.push(`@keyframes enter {
  from { opacity: var(--tw-enter-opacity, 1); transform: translate3d(var(--tw-enter-translate-x, 0), var(--tw-enter-translate-y, 0), 0) scale3d(var(--tw-enter-scale, 1), var(--tw-enter-scale, 1), var(--tw-enter-scale, 1)) rotate(var(--tw-enter-rotate, 0)); }
}
@keyframes exit {
  to { opacity: var(--tw-exit-opacity, 1); transform: translate3d(var(--tw-exit-translate-x, 0), var(--tw-exit-translate-y, 0), 0) scale3d(var(--tw-exit-scale, 1), var(--tw-exit-scale, 1), var(--tw-exit-scale, 1)) rotate(var(--tw-exit-rotate, 0)); }
}
.animate-in { animation-name: enter; animation-duration: 150ms; --tw-enter-opacity: initial; --tw-enter-scale: initial; --tw-enter-translate-x: initial; --tw-enter-translate-y: initial; --tw-enter-rotate: initial; }
.animate-out { animation-name: exit; animation-duration: 150ms; --tw-exit-opacity: initial; --tw-exit-scale: initial; --tw-exit-translate-x: initial; --tw-exit-translate-y: initial; --tw-exit-rotate: initial; }
.fade-in-0 { --tw-enter-opacity: 0; }
.fade-out-0 { --tw-exit-opacity: 0; }
.zoom-in-95 { --tw-enter-scale: .95; }
.zoom-out-95 { --tw-exit-scale: .95; }
.slide-in-from-top-2 { --tw-enter-translate-y: -0.5rem; }
.slide-in-from-bottom-2 { --tw-enter-translate-y: 0.5rem; }
.slide-in-from-left-2 { --tw-enter-translate-x: -0.5rem; }
.slide-in-from-right-2 { --tw-enter-translate-x: 0.5rem; }
.slide-in-from-top-\\[48\\%\\] { --tw-enter-translate-y: -48%; }
.slide-in-from-left-1\\/2 { --tw-enter-translate-x: -50%; }
.slide-out-to-left-1\\/2 { --tw-exit-translate-x: -50%; }
.slide-out-to-top-\\[48\\%\\] { --tw-exit-translate-y: -48%; }
.slide-out-to-top { --tw-exit-translate-y: -100%; }
.slide-out-to-bottom { --tw-exit-translate-y: 100%; }
.slide-out-to-left { --tw-exit-translate-x: -100%; }
.slide-out-to-right { --tw-exit-translate-x: 100%; }
.slide-in-from-top { --tw-enter-translate-y: -100%; }
.slide-in-from-bottom { --tw-enter-translate-y: 100%; }
.slide-in-from-left { --tw-enter-translate-x: -100%; }
.slide-in-from-right { --tw-enter-translate-x: 100%; }
.duration-200 { animation-duration: 200ms; }
.duration-300 { animation-duration: 300ms; }
.duration-500 { animation-duration: 500ms; }
@keyframes accordion-down { from { height: 0; } to { height: var(--radix-accordion-content-height); } }
@keyframes accordion-up { from { height: var(--radix-accordion-content-height); } to { height: 0; } }
.animate-accordion-down { animation: accordion-down 0.2s ease-out; }
.animate-accordion-up { animation: accordion-up 0.2s ease-out; }`);

  return r.join("\n");
}

/**
 * Complete theme CSS for Sandpack.
 * Contains all CSS variables, semantic utility classes, and animations.
 * Standard Tailwind utilities (flex, p-4, etc.) come from the CDN via externalResources.
 */
export const SANDPACK_THEME_CSS = buildThemeCSS();

/** Lazy getter used by wrapReactCode (which is defined before SANDPACK_THEME_CSS). */
function _getThemeCSS(): string {
  return SANDPACK_THEME_CSS;
}

/**
 * Replacement for Sandpack's default `/styles.css`.
 * Sandpack's default React entry point does `import "./styles.css"`, so this
 * CSS is automatically loaded. It contains ALL our theme CSS: variables,
 * semantic utility classes, font overrides, animations, etc.
 *
 * Standard Tailwind utilities (flex, p-4, etc.) come from the CDN via
 * externalResources.
 */
export const SANDPACK_STYLES_OVERRIDE = SANDPACK_THEME_CSS;

/**
 * Entry point override — no longer used. Sandpack ignores /src/index.js
 * overrides. We use an App wrapper (/src/App.js) instead.
 */
export const SANDPACK_INDEX_JS = "";

/**
 * App wrapper that sits between Sandpack's default entry point and the user's
 * /App.js. The default entry does `import App from "./App"` which resolves to
 * /src/App.js (this wrapper). The wrapper imports the user's code from
 * "../App" (/App.js) and imports freeze.css which is toggled dynamically
 * to pause/unpause CSS animations when the Make is not playing.
 */
export const SANDPACK_APP_WRAPPER = `import React from "react";
import UserApp from "../App";
import "../freeze.css";
import "./make-inspector";

export default function AppWrapper() {
  return <UserApp />;
}
`;

/** CSS to freeze all CSS animations/transitions when Make is paused */
export const SANDPACK_FREEZE_CSS = `*, *::before, *::after {
  animation-play-state: paused !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}`;

/** Minimal HTML template for Sandpack */
export const SANDPACK_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
  <div id="root"></div>
</body>
</html>`;

// ─── Search/Replace patch application ───────────────────────────────

/**
 * Check if a code string uses the <<<SEARCH / === / >>>REPLACE patch format.
 */
export function isSearchReplaceFormat(code: string): boolean {
  return code.includes("<<<SEARCH") && code.includes(">>>REPLACE");
}

/**
 * Apply search/replace patches to existing code.
 * Returns `{ result, applied }` — if any block fails to match, `applied` is
 * false and the original code is returned unchanged (caller can fall back to
 * treating the output as a full file).
 */
export function applySearchReplace(
  original: string,
  patchText: string,
): { result: string; applied: boolean; failedCount?: number; totalCount?: number } {
  const blocks: Array<{ search: string; replace: string }> = [];

  // Parse all <<<SEARCH ... === ... >>>REPLACE blocks
  const blockRegex = /<<<SEARCH\n([\s\S]*?)\n===\n([\s\S]*?)\n>>>REPLACE/g;
  let match;
  while ((match = blockRegex.exec(patchText)) !== null) {
    blocks.push({ search: match[1], replace: match[2] });
  }

  // Also handle the edge case where the replacement section is empty (deletion)
  // <<<SEARCH\n...\n===\n>>>REPLACE  (empty replacement = delete)
  if (blocks.length === 0) {
    const emptyReplaceRegex = /<<<SEARCH\n([\s\S]*?)\n===\n>>>REPLACE/g;
    while ((match = emptyReplaceRegex.exec(patchText)) !== null) {
      blocks.push({ search: match[1], replace: "" });
    }
  }

  if (blocks.length === 0) {
    return { result: original, applied: false };
  }

  let result = original;
  let failedBlocks = 0;

  for (const block of blocks) {
    // Try exact match first
    if (result.includes(block.search)) {
      result = result.replace(block.search, block.replace);
      continue;
    }

    // Fuzzy match: trim trailing whitespace per line, but apply replacement
    // to the original result (not the normalized version) to preserve formatting.
    const normLine = (l: string) => l.trimEnd();
    const searchLinesNorm = block.search.split("\n").map(normLine);
    const resultLinesOrig = result.split("\n");

    let normMatchStart = -1;
    for (let i = 0; i <= resultLinesOrig.length - searchLinesNorm.length; i++) {
      let allMatch = true;
      for (let j = 0; j < searchLinesNorm.length; j++) {
        if (normLine(resultLinesOrig[i + j]) !== searchLinesNorm[j]) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        normMatchStart = i;
        break;
      }
    }

    if (normMatchStart !== -1) {
      const replaceLines = block.replace.split("\n");
      resultLinesOrig.splice(normMatchStart, searchLinesNorm.length, ...replaceLines);
      result = resultLinesOrig.join("\n");
      continue;
    }

    // Fuzzy: normalize leading indentation (strip common indent from search,
    // then try to find the content with any indentation level in the result)
    const stripIndent = (s: string) =>
      s
        .split("\n")
        .map((l) => l.trimStart())
        .join("\n");
    const strippedResult = stripIndent(result);
    const strippedSearch = stripIndent(block.search);

    if (strippedSearch.trim() && strippedResult.includes(strippedSearch)) {
      // Found the match with different indentation — find it line-by-line in the real result
      const allSearchLines = block.search.split("\n").map((l) => l.trimStart());
      const resultLines = result.split("\n");
      let matchStartIdx = -1;
      let matchLen = 0;

      const firstNonEmpty = allSearchLines.findIndex((l) => l.length > 0);
      if (firstNonEmpty === -1) continue;

      for (let i = 0; i < resultLines.length; i++) {
        if (resultLines[i].trimStart() === allSearchLines[firstNonEmpty]) {
          let si = firstNonEmpty;
          let ri = i;
          let allMatch = true;

          while (si < allSearchLines.length && ri < resultLines.length) {
            if (!allSearchLines[si]) { si++; ri++; continue; }
            if (resultLines[ri].trimStart() === allSearchLines[si]) {
              si++;
              ri++;
            } else if (!resultLines[ri].trim()) {
              ri++;
            } else {
              allMatch = false;
              break;
            }
          }

          if (allMatch && si >= allSearchLines.length) {
            matchStartIdx = i;
            matchLen = ri - i;
            break;
          }
        }
      }

      if (matchStartIdx !== -1) {
        const matchedLine = resultLines[matchStartIdx];
        const indent = matchedLine.match(/^(\s*)/)?.[1] || "";
        const searchIndent = block.search.split("\n")[0].match(/^(\s*)/)?.[1] || "";
        const replaceLines = block.replace.split("\n").map((l) => {
          if (l.trim() === "") return l;
          if (l.startsWith(searchIndent)) return indent + l.slice(searchIndent.length);
          return indent + l.trimStart();
        });
        resultLines.splice(matchStartIdx, matchLen, ...replaceLines);
        result = resultLines.join("\n");
        continue;
      }
    }

    // Even fuzzier: collapse multiple spaces within each line for matching,
    // but do the replacement on the original string by mapping matched lines.
    const collapseLine = (l: string) => l.trimEnd().replace(/\s+/g, " ");
    const searchLinesRaw = block.search.split("\n");
    const searchLinesCollapsed = searchLinesRaw.map(collapseLine);
    const resultLines2 = result.split("\n");
    const nonEmptySearchLines = searchLinesCollapsed.filter(Boolean);

    if (nonEmptySearchLines.length > 0) {
      let matchStart2 = -1;
      let matchLength2 = 0;

      for (let i = 0; i <= resultLines2.length - nonEmptySearchLines.length; i++) {
        // Try to match all search lines (including empty ones) starting at i
        let si = 0; // search index
        let ri = i; // result index
        let allMatch = true;

        while (si < searchLinesCollapsed.length && ri < resultLines2.length) {
          const searchLine = searchLinesCollapsed[si];
          if (!searchLine) {
            // Empty search line — skip both
            si++;
            ri++;
            continue;
          }
          if (collapseLine(resultLines2[ri]) === searchLine) {
            si++;
            ri++;
          } else if (!resultLines2[ri].trim()) {
            // Extra blank line in result — skip
            ri++;
          } else {
            allMatch = false;
            break;
          }
        }

        if (allMatch && si >= searchLinesCollapsed.length) {
          matchStart2 = i;
          matchLength2 = ri - i;
          break;
        }
      }

      if (matchStart2 !== -1) {
        const indent = resultLines2[matchStart2].match(/^(\s*)/)?.[1] || "";
        const searchIndent = searchLinesRaw[0].match(/^(\s*)/)?.[1] || "";
        const replaceLines = block.replace.split("\n").map((l) => {
          if (l.trim() === "") return l;
          if (l.startsWith(searchIndent)) return indent + l.slice(searchIndent.length);
          return indent + l.trimStart();
        });
        resultLines2.splice(matchStart2, matchLength2, ...replaceLines);
        result = resultLines2.join("\n");
        continue;
      }
    }

    // Could not find a match — skip this block but continue with others
    failedBlocks++;
    console.warn(
      "[applySearchReplace] No match for block:",
      block.search.slice(0, 120),
    );
  }

  if (failedBlocks === blocks.length) {
    // All blocks failed — return original
    return { result: original, applied: false, failedCount: failedBlocks, totalCount: blocks.length };
  }

  return { result, applied: true, failedCount: failedBlocks, totalCount: blocks.length };
}

// ─── Shared dependency extraction & validation ──────────────────────

/** Packages already provided by Sandpack's React template */
const TEMPLATE_PACKAGES = new Set([
  "react",
  "react-dom",
  "react-dom/client",
  "react-scripts",
]);

/** npm registry validation cache: package name → exists on npm */
const npmPackageCache = new Map<string, boolean>();

/**
 * Parse import statements from React code and return unique package names.
 */
export function extractPackageNames(code: string): string[] {
  const pkgs: string[] = [];
  if (!code) return pkgs;

  const importRegex =
    /import\s+(?:[\w*{}\s,]+\s+from\s+)?["']([^"'./][^"']*)["']/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    const raw = match[1];
    const pkgName = raw.startsWith("@")
      ? raw.split("/").slice(0, 2).join("/")
      : raw.split("/")[0];
    if (!TEMPLATE_PACKAGES.has(pkgName) && !pkgs.includes(pkgName)) {
      pkgs.push(pkgName);
    }
  }
  return pkgs;
}

/**
 * Check if an npm package exists on the registry.
 * Results are cached for the lifetime of the session.
 */
export async function validateNpmPackage(pkgName: string): Promise<boolean> {
  if (npmPackageCache.has(pkgName)) return npmPackageCache.get(pkgName)!;

  try {
    const res = await fetch(`https://registry.npmjs.org/${pkgName}`, {
      method: "HEAD",
    });
    const exists = res.ok;
    npmPackageCache.set(pkgName, exists);
    if (!exists)
      console.warn(
        `[makeUtils] Package "${pkgName}" not found on npm – skipping`,
      );
    return exists;
  } catch (err) {
    console.error(`[makeUtils] Error checking "${pkgName}":`, err);
    npmPackageCache.set(pkgName, false);
    return false;
  }
}

/**
 * Extract dependencies from React code and validate against npm.
 * Returns a `{ packageName: "latest" }` map for Sandpack's `customSetup.dependencies`.
 */
export async function extractValidatedDependencies(
  code: string,
): Promise<Record<string, string>> {
  const pkgs = extractPackageNames(code);
  if (pkgs.length === 0) return {};

  const results = await Promise.all(
    pkgs.map(async (pkg) => ({ pkg, exists: await validateNpmPackage(pkg) })),
  );

  const deps: Record<string, string> = {};
  for (const { pkg, exists } of results) {
    if (exists) deps[pkg] = "latest";
  }
  return deps;
}

/**
 * Clean up streamed code — strip markdown code fences if the model wrapped its output,
 * and handle edge cases where the model accidentally generates HTML instead of React.
 *
 * Handles cases where the model outputs conversational text before the code block,
 * e.g. "Looking at the design changes, here's the updated code:\n```jsx\n...code...\n```"
 */
export function extractStreamedCode(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";

  // 1. Text starts with a complete code fence — most common happy path
  const codeBlockMatch = trimmed.match(
    /^```(?:html|jsx|javascript|tsx|js|react|typescript)?\s*\n?([\s\S]*?)\n?```$/,
  );
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // 2. Text starts with a partial fence (streaming; not yet closed)
  const partialFenceMatch = trimmed.match(
    /^```(?:html|jsx|javascript|tsx|js|react|typescript)?\s*\n?([\s\S]*)$/,
  );
  if (partialFenceMatch) {
    return partialFenceMatch[1].trim();
  }

  // 3. Conversational text before a code block — strip the preamble and extract
  //    the code. This handles the common case where the model explains changes
  //    before outputting the code (e.g. "Looking at the design, I notice...```jsx\n...```").
  const embeddedBlockMatch = trimmed.match(
    /```(?:html|jsx|javascript|tsx|js|react|typescript)?\s*\n([\s\S]*?)\n```/,
  );
  if (embeddedBlockMatch) {
    return embeddedBlockMatch[1].trim();
  }

  // 4. Conversational text before a partial fence (streaming; not yet closed)
  const embeddedPartialMatch = trimmed.match(
    /```(?:html|jsx|javascript|tsx|js|react|typescript)?\s*\n([\s\S]*)$/,
  );
  if (embeddedPartialMatch) {
    return embeddedPartialMatch[1].trim();
  }

  return trimmed;
}

/**
 * Detect whether a code string was likely truncated mid-generation
 * (e.g. AI hit max_tokens and stopped mid-JSX / mid-expression).
 *
 * Uses a lightweight brace/paren balance check that skips over
 * string literals and template literals to avoid false positives.
 */
export function isLikelyTruncated(code: string): boolean {
  if (!code || code.trim().length === 0) return true;

  const trimmed = code.trimEnd();

  // A valid React file almost always ends with one of these characters.
  // If it ends with something like a letter, `<`, or `=` it was cut off.
  const lastChar = trimmed[trimmed.length - 1];
  const safeEndings = new Set(["}", ";", ")", "`", '"', "'", ">", ","]);
  if (!safeEndings.has(lastChar)) return true;

  // Count brace / paren balance, skipping strings and comments.
  let braces = 0;
  let parens = 0;
  let inStr: string | false = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    // End of single-line comment at newline
    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }

    // Block comment: look for closing */
    if (inBlockComment) {
      if (ch === "*" && trimmed[i + 1] === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (inStr) {
      if (ch === inStr) inStr = false;
      continue;
    }

    // Detect comment starts (only outside strings)
    if (ch === "/" && i + 1 < trimmed.length) {
      if (trimmed[i + 1] === "/") { inLineComment = true; i++; continue; }
      if (trimmed[i + 1] === "*") { inBlockComment = true; i++; continue; }
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      continue;
    }

    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "(") parens++;
    else if (ch === ")") parens--;
  }

  // Unterminated string literal at end of file
  if (inStr) return true;

  // More than 2 unbalanced means almost certainly truncated
  return braces > 2 || parens > 2;
}

/**
 * Validate JSX/JS code by attempting to parse it with @babel/parser.
 * Returns `{ valid: true }` if the code parses without errors, or
 * `{ valid: false, error: string }` with the first error message.
 *
 * If @babel/parser is unavailable (e.g. in a browser bundle), returns
 * `{ valid: true }` (fail-open) so client-side code is never blocked.
 */
let _babelParser: any = null;
let _babelParserLoaded = false;

function getBabelParser() {
  if (!_babelParserLoaded) {
    _babelParserLoaded = true;
    try {
      _babelParser = require("@babel/parser");
    } catch {
      _babelParser = null;
    }
  }
  return _babelParser;
}

export function validateJSX(code: string): { valid: boolean; error?: string } {
  const parser = getBabelParser();
  if (!parser) return { valid: true };

  try {
    parser.parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      errorRecovery: false,
    });
    return { valid: true };
  } catch (e: any) {
    return { valid: false, error: e.message?.slice(0, 200) || "Parse error" };
  }
}

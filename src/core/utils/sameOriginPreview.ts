/**
 * Same-origin preview builder.
 *
 * Generates an HTML srcdoc for an iframe that:
 *   1. Is SAME-ORIGIN → we have full DOM access for the inspector
 *   2. Uses Babel standalone for JSX transform
 *   3. Uses import maps + esm.sh for npm packages
 *   4. Inlines all shadcn components into a single module
 *   5. Includes Tailwind CDN + our theme CSS
 *
 * Communication is direct DOM access — no postMessage, no hacks.
 */

import { SHADCN_FILES, SHADCN_DEPENDENCIES } from "@/core/utils/shadcnBoilerplate";
import { SANDPACK_STYLES_OVERRIDE } from "@/core/utils/makeUtils";

// ─── Import Map Builder ──────────────────────────────────────────────

/**
 * React packages — these are the "source of truth" React instance.
 * All other packages MUST externalize react/react-dom so the browser
 * resolves them to these same URLs via the import map.
 */
const REACT_PKGS = new Set(["react", "react/jsx-runtime", "react-dom", "react-dom/client"]);

/** Base npm packages always included */
const BASE_IMPORTS: Record<string, string> = {
  // React core — no ?dev flag so esm.sh internal resolution matches exactly
  react: "https://esm.sh/react@18",
  "react/jsx-runtime": "https://esm.sh/react@18/jsx-runtime",
  "react-dom": "https://esm.sh/react-dom@18",
  "react-dom/client": "https://esm.sh/react-dom@18/client",
  // Utilities — externalize React so they use OUR single React instance
  clsx: "https://esm.sh/clsx",
  "tailwind-merge": "https://esm.sh/tailwind-merge",
  "lucide-react": "https://esm.sh/lucide-react@0.563.0?external=react,react-dom",
};

/**
 * Build esm.sh URL for a package (optionally with a pinned version).
 * Non-React packages get `?external=react,react-dom` to prevent esm.sh from
 * bundling its own React copy — the browser resolves `"react"` via our import map.
 */
function esmUrl(pkg: string, version?: string): string {
  const spec = version ? `${pkg}@${version}` : pkg;
  if (REACT_PKGS.has(pkg)) return `https://esm.sh/${spec}`;
  return `https://esm.sh/${spec}?external=react,react-dom`;
}

/**
 * Collapse multi-line imports into single lines so regexes can process them.
 * E.g. `import {\n  A,\n  B\n} from "pkg"` → `import { A, B } from "pkg"`
 */
function collapseMultiLineImports(code: string): string {
  // Match `import` followed by anything up to `from "..."` (possibly spanning lines)
  return code.replace(
    /import\s*\{([^}]*)\}\s*from\s*(["'][^"']+["'])/g,
    (_match, names: string, pkg: string) => {
      const collapsed = names.replace(/\s+/g, " ").trim();
      return `import { ${collapsed} } from ${pkg}`;
    }
  );
}

/**
 * Extract all npm import specifiers from code.
 * Matches: import ... from "package" (not ./relative)
 * Handles both single-line and multi-line imports.
 */
function extractNpmImports(code: string): Set<string> {
  const imports = new Set<string>();
  const collapsed = collapseMultiLineImports(code);
  const regex = /import\s+(?:[\s\S]*?)\s+from\s+["']([^"'./][^"']*)["']/g;
  let m;
  while ((m = regex.exec(collapsed)) !== null) {
    imports.add(m[1]);
  }
  return imports;
}

/**
 * Build the import map object from user code + shadcn dependencies.
 */
function buildImportMap(userCode: string, extraDeps: Record<string, string> = {}): Record<string, string> {
  const map: Record<string, string> = { ...BASE_IMPORTS };

  // Add shadcn dependencies (with pinned versions)
  for (const [pkg, version] of Object.entries(SHADCN_DEPENDENCIES)) {
    if (!map[pkg]) {
      map[pkg] = esmUrl(pkg, version !== "latest" ? version : undefined);
    }
  }

  // Add extra validated dependencies
  for (const [pkg, version] of Object.entries(extraDeps)) {
    if (!map[pkg]) {
      map[pkg] = esmUrl(pkg, version !== "latest" ? version : undefined);
    }
  }

  // Scan user code for any additional npm imports
  const userImports = extractNpmImports(userCode);
  for (const pkg of userImports) {
    if (!map[pkg]) {
      map[pkg] = esmUrl(pkg);
    }
  }

  return map;
}

// ─── Code Bundler ────────────────────────────────────────────────────

/**
 * Strip local/relative imports from code.
 * Removes `import ... from "./..."` and `import ... from "../..."`.
 * Handles multi-line imports.
 */
function stripLocalImports(code: string): string {
  // First collapse multi-line imports, then strip single-line local imports
  let result = collapseMultiLineImports(code);
  result = result.replace(
    /^\s*import\s+(?:[^"'\n]*)\s+from\s+["']\.\.?\/[^"']*["']\s*;?\s*$/gm,
    "// [local import removed]"
  );
  return result;
}

/**
 * Strip export keywords from code so everything becomes module-level declarations.
 * - `export { X, Y }` → removed
 * - `export const X` → `const X`
 * - `export function X` → `function X`
 * - `export default function X` → `function X`
 * - `export default X` → removed (variable already in scope)
 */
function stripExports(code: string): string {
  return code
    // Remove `export { ... }` statements
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, "// [export removed]")
    // `export default function` → `function`
    .replace(/export\s+default\s+function\s+/g, "function ")
    // `export default class` → `class`
    .replace(/export\s+default\s+class\s+/g, "class ")
    // `export default` (bare) → remove
    .replace(/^\s*export\s+default\s+/gm, "/* default */ ")
    // `export const/let/var/function/class` → strip export keyword
    .replace(/export\s+(const|let|var|function|class)\s+/g, "$1 ");
}

// ─── Import Merging ──────────────────────────────────────────────────

interface ParsedImport {
  /** "namespace" for `import * as X from "pkg"`, "named" for `import { A, B } from "pkg"`, "default" for `import X from "pkg"` */
  kind: "namespace" | "named" | "default";
  /** For namespace: the alias (e.g. "React"). For default: the name. For named: unused. */
  alias?: string;
  /** For named imports: the set of imported names */
  names?: Set<string>;
  /** The package specifier */
  pkg: string;
}

/**
 * Parse a single import line into a structured object.
 */
function parseImportLine(line: string): ParsedImport | null {
  const trimmed = line.trim().replace(/;$/, "").trim();

  // import * as X from "pkg"
  const nsMatch = trimmed.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+["']([^"']+)["']$/);
  if (nsMatch) return { kind: "namespace", alias: nsMatch[1], pkg: nsMatch[2] };

  // import { A, B, C } from "pkg"
  const namedMatch = trimmed.match(/^import\s+\{([^}]+)\}\s+from\s+["']([^"']+)["']$/);
  if (namedMatch) {
    const names = new Set(namedMatch[1].split(",").map(n => n.trim()).filter(Boolean));
    return { kind: "named", names, pkg: namedMatch[2] };
  }

  // import X from "pkg"
  const defaultMatch = trimmed.match(/^import\s+(\w+)\s+from\s+["']([^"']+)["']$/);
  if (defaultMatch) return { kind: "default", alias: defaultMatch[1], pkg: defaultMatch[2] };

  return null;
}

/**
 * Merge all npm import lines, deduplicating named imports from the same package
 * and keeping namespace/default imports unique.
 */
function mergeNpmImports(importLines: string[]): string[] {
  // Map: pkg → { namespace aliases, default alias, named imports }
  const pkgMap = new Map<string, {
    namespaceAliases: Set<string>;
    defaultAlias: string | null;
    namedImports: Set<string>;
  }>();

  for (const line of importLines) {
    const parsed = parseImportLine(line);
    if (!parsed) continue;

    if (!pkgMap.has(parsed.pkg)) {
      pkgMap.set(parsed.pkg, { namespaceAliases: new Set(), defaultAlias: null, namedImports: new Set() });
    }
    const entry = pkgMap.get(parsed.pkg)!;

    if (parsed.kind === "namespace" && parsed.alias) {
      entry.namespaceAliases.add(parsed.alias);
    } else if (parsed.kind === "default" && parsed.alias) {
      entry.defaultAlias = parsed.alias;
    } else if (parsed.kind === "named" && parsed.names) {
      for (const name of parsed.names) entry.namedImports.add(name);
    }
  }

  // Rebuild merged import statements
  const result: string[] = [];
  for (const [pkg, entry] of pkgMap) {
    // Namespace imports: one per alias
    for (const alias of entry.namespaceAliases) {
      result.push(`import * as ${alias} from "${pkg}";`);
    }
    // Default import
    if (entry.defaultAlias) {
      // If there are also named imports from the same package, combine them
      if (entry.namedImports.size > 0) {
        const names = Array.from(entry.namedImports).join(", ");
        result.push(`import ${entry.defaultAlias}, { ${names} } from "${pkg}";`);
        // Don't emit separate named import below
        continue;
      }
      result.push(`import ${entry.defaultAlias} from "${pkg}";`);
    }
    // Named imports (if not already combined with default)
    if (entry.namedImports.size > 0 && !entry.defaultAlias) {
      const names = Array.from(entry.namedImports).join(", ");
      result.push(`import { ${names} } from "${pkg}";`);
    }
  }

  return result;
}

// ─── Export Name Extraction ──────────────────────────────────────────

/**
 * Extract all names exported by a component file.
 * Handles: `export { A, B }`, `export const A`, `export function A`, `export default function A`
 */
function extractExportedNames(code: string): string[] {
  const names: string[] = [];

  // export { A, B, C }
  const braceExports = code.matchAll(/export\s*\{([^}]+)\}/g);
  for (const m of braceExports) {
    for (const n of m[1].split(",")) {
      const trimmed = n.trim().split(/\s+as\s+/).pop()?.trim();
      if (trimmed) names.push(trimmed);
    }
  }

  // export const/let/var X
  const varExports = code.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g);
  for (const m of varExports) names.push(m[1]);

  // export function X  /  export default function X
  const funcExports = code.matchAll(/export\s+(?:default\s+)?function\s+(\w+)/g);
  for (const m of funcExports) names.push(m[1]);

  // export class X  /  export default class X
  const classExports = code.matchAll(/export\s+(?:default\s+)?class\s+(\w+)/g);
  for (const m of classExports) names.push(m[1]);

  return [...new Set(names)];
}

// ─── Component Bundler ───────────────────────────────────────────────

/**
 * Bundle all shadcn components into a single code block.
 *
 * Each component is wrapped in an IIFE to avoid variable name collisions
 * (e.g. `variants` appears in button.js AND toggle.js). Only the exported
 * names are exposed to the outer module scope.
 *
 * Special case: /lib/utils.js is NOT wrapped — its exports (like `cn`) need
 * to be directly accessible by all components' IIFEs.
 *
 * Returns the component code (without imports) and the raw npm import lines.
 */
function bundleShadcnComponents(): { shadcnCode: string; shadcnNpmImports: string[] } {
  const chunks: string[] = [];

  // Dependency order: utils first, then components
  const orderedPaths = ["/lib/utils.js"];
  for (const path of Object.keys(SHADCN_FILES)) {
    if (path !== "/lib/utils.js") orderedPaths.push(path);
  }

  // Collect ALL npm import lines from every component (raw, unmerged)
  const shadcnNpmImports: string[] = [];
  const npmImportRegex = /^\s*(import\s+(?:[^"'\n]*)\s+from\s+["'][^"'./][^"']*["']\s*;?)\s*$/gm;

  for (const path of orderedPaths) {
    let code = SHADCN_FILES[path];
    if (!code) continue;
    // Collapse multi-line imports first so the single-line regex catches them
    code = collapseMultiLineImports(code);
    let m;
    npmImportRegex.lastIndex = 0;
    while ((m = npmImportRegex.exec(code)) !== null) {
      shadcnNpmImports.push(m[1].trim());
    }
  }

  // Add each component wrapped in an IIFE for scope isolation
  for (const path of orderedPaths) {
    const rawCode = SHADCN_FILES[path];
    if (!rawCode) continue;

    // Collapse multi-line imports first
    const code = collapseMultiLineImports(rawCode);

    const label = path.replace(/^\//, "");
    const exportedNames = extractExportedNames(code);

    let processed = stripLocalImports(code);
    processed = stripExports(processed);
    // Strip ALL npm imports (will be merged at the top level)
    processed = processed.replace(
      /^\s*import\s+(?:[^"'\n]*)\s+from\s+["'][^"'./][^"']*["']\s*;?\s*$/gm,
      ""
    );
    processed = processed.replace(/\n{3,}/g, "\n\n").trim();

    if (path === "/lib/utils.js") {
      // Utils are NOT wrapped — cn() must be in module scope for all IIFEs
      chunks.push(`// ═══ ${label} ═══`);
      chunks.push(processed);
    } else if (exportedNames.length > 0) {
      // Wrap in IIFE, destructure exports into outer scope
      const destructure = exportedNames.join(", ");
      chunks.push(`// ═══ ${label} ═══`);
      chunks.push(`const { ${destructure} } = (() => {`);
      chunks.push(processed);
      chunks.push(`  return { ${destructure} };`);
      chunks.push(`})();`);
    } else {
      // No exports — just include the code (rare/shouldn't happen for components)
      chunks.push(`// ═══ ${label} ═══`);
      chunks.push(processed);
    }
    chunks.push("");
  }

  return { shadcnCode: chunks.join("\n"), shadcnNpmImports };
}

/**
 * Process user's code for the same-origin preview.
 * - Strips local imports (shadcn components are already in scope)
 * - Strips npm imports (they'll be merged into the top-level import block)
 * - Keeps exports (we need `export default function App`)
 */
function processUserCode(rawCode: string): { cleanedCode: string; npmImportLines: string[] } {
  // Collapse multi-line imports first
  const code = collapseMultiLineImports(rawCode);

  const npmImportLines: string[] = [];
  const npmImportRegex = /^\s*(import\s+(?:[^"'\n]*)\s+from\s+["'][^"'./][^"']*["']\s*;?)\s*$/gm;
  let m;
  while ((m = npmImportRegex.exec(code)) !== null) {
    npmImportLines.push(m[1].trim());
  }

  let cleanedCode = stripLocalImports(code);
  // Strip npm imports (will be merged at the top)
  cleanedCode = cleanedCode.replace(
    /^\s*import\s+(?:[^"'\n]*)\s+from\s+["'][^"'./][^"']*["']\s*;?\s*$/gm,
    ""
  );
  // Strip any render/mount calls the AI may have included
  cleanedCode = cleanedCode.replace(
    /^\s*(?:import\s*\{[^}]*createRoot[^}]*\}\s*from\s*["'][^"']*["']\s*;?|(?:const|let|var)\s+\w+\s*=\s*(?:createRoot|ReactDOM\.createRoot)\s*\([^)]*\)\s*;?|(?:\w+\.)?render\s*\(\s*(?:React\.createElement|<)\s*[^)]*\)\s*;?)\s*$/gm,
    ""
  );
  // Strip data-make-node/data-make-name attributes (preview instrumentation)
  cleanedCode = cleanedCode
    .replace(/\s+data-make-node="[^"]*"/g, "")
    .replace(/\s+data-make-name="[^"]*"/g, "");
  cleanedCode = cleanedCode.replace(/\n{3,}/g, "\n\n");

  return { cleanedCode, npmImportLines };
}

// ─── HTML Builder ────────────────────────────────────────────────────

/**
 * Build the complete srcdoc HTML for the same-origin inspector preview.
 */
export function buildInspectorSrcdoc(
  userCode: string,
  extraDeps: Record<string, string> = {}
): string {
  const importMap = buildImportMap(userCode, extraDeps);
  const { shadcnCode, shadcnNpmImports } = bundleShadcnComponents();
  const { cleanedCode: processedUserCode, npmImportLines: userNpmImports } = processUserCode(userCode);

  // Merge ALL npm imports (shadcn + user) into a single deduplicated block
  const allMergedImports = mergeNpmImports([...shadcnNpmImports, ...userNpmImports]);

  const fullCode = [
    "// ═══ NPM IMPORTS (merged) ═══",
    allMergedImports.join("\n"),
    "",
    shadcnCode,
    "",
    "// ═══ USER APP ═══",
    processedUserCode,
  ].join("\n");

  // Escape backticks and ${} in the code for safe embedding in template literal
  const escapedCode = fullCode
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script type="importmap">
  ${JSON.stringify({ imports: importMap }, null, 2)}
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script>tailwind.config={theme:{extend:{fontFamily:{sans:['"Inter"','ui-sans-serif','system-ui','sans-serif']}}}}<\/script>
  <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"><\/script>
  <style>
    ${SANDPACK_STYLES_OVERRIDE}
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Inter", ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"; }
    ::-webkit-scrollbar { display: none; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    // Global runtime error handler — catch errors React/modules throw after Babel succeeds
    window.addEventListener("error", function(ev) {
      var msg = (ev.error && ev.error.message) || ev.message || "Runtime error";
      try { window.parent.postMessage({ type: "make-preview-error", error: msg }, "*"); } catch(e) {}
    });
    window.addEventListener("unhandledrejection", function(ev) {
      var msg = (ev.reason && ev.reason.message) || String(ev.reason) || "Unhandled promise rejection";
      try { window.parent.postMessage({ type: "make-preview-error", error: msg }, "*"); } catch(e) {}
    });
  <\/script>
  <script>
    (function() {
      var code = \`${escapedCode}\`;

      // Add mount code at the end (only if not already present)
      if (!code.includes("createRoot") && !code.includes(".render(")) {
        code += \`
          \\nimport { createRoot as __createRoot } from "react-dom/client";
          const __root = __createRoot(document.getElementById("root"));
          __root.render(React.createElement(typeof App !== "undefined" ? App : function() { return React.createElement("div", null, "No App found"); }));
        \`;
      }

      try {
        var result = Babel.transform(code, {
          presets: [["env", { modules: false, targets: { esmodules: true } }], "react"],
          filename: "App.js",
        });

        // Execute as inline module — import map applies!
        var script = document.createElement("script");
        script.type = "module";
        script.textContent = result.code;
        document.head.appendChild(script);
      } catch(e) {
        var shortMsg = (e.message || "Unknown error").split("\\n")[0].slice(0, 150);
        document.getElementById("root").innerHTML =
          '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:24px;font-family:Inter,system-ui,sans-serif;gap:8px;">' +
          '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="#ef4444" stroke-width="1.5"/><path d="M10 6v5" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="14" r="0.75" fill="#ef4444"/><\/svg>' +
          '<span style="font-size:11px;font-weight:500;color:#71717a;text-align:center;max-width:320px;line-height:1.4;">' + shortMsg.replace(/</g, "&lt;").replace(/>/g, "&gt;") + '<\/span>' +
          '<\/div>';
        console.error("[SameOriginPreview] Babel error:", e);
        // Notify parent about the error so auto-fix can kick in
        try { window.parent.postMessage({ type: "make-preview-error", error: e.message }, "*"); } catch(pe) {}
      }
    })();
  <\/script>
</body>
</html>`;
}

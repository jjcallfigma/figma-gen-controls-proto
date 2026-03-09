/**
 * JSX parser for the Make inspector.
 *
 * Parses a single-file React component (App.js) into a tree of JSX nodes
 * with source positions, enabling:
 *   • point-and-click element selection via data-make-node attributes
 *   • property inspection in the Properties panel
 *   • code modification when props are edited
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface JsxProp {
  name: string;
  /** Raw source value including quotes / braces, e.g. `"outline"` or `{true}` */
  rawValue: string;
  /** Cleaned value (without wrapping quotes / braces) */
  value: string;
  /** Start/end byte offsets inside the ORIGINAL source */
  start: number;
  end: number;
}

export interface JsxNode {
  /** Sequential id assigned during parsing (used as data-make-node value) */
  id: number;
  /** Tag / component name, e.g. "div", "Card", "Button" */
  name: string;
  /** Props parsed from the opening tag */
  props: JsxProp[];
  /** Direct text content (first text child, if any) */
  textContent: string;
  /** Nested JSX children */
  children: JsxNode[];
  /** Byte offset of the opening `<` in the original source */
  openStart: number;
  /** Byte offset right after the tag name (where we inject data-make-node) */
  nameEnd: number;
  /** Byte offset of the closing `>` of the opening tag (or the `/>` for self-closing) */
  openEnd: number;
  /** Whether the tag is self-closing (`<Foo />`) */
  selfClosing: boolean;
}

// ─── Parser ──────────────────────────────────────────────────────────

/**
 * Parse all JSX elements from a React component source string.
 * Returns a flat list of nodes (with parent-child references via `children`)
 * **and** a flat map from id → node for fast lookup.
 */
export function parseJSX(code: string): { roots: JsxNode[]; nodeMap: Map<number, JsxNode> } {
  const nodeMap = new Map<number, JsxNode>();
  const roots: JsxNode[] = [];

  // We use a regex-based scanner rather than a full parser.
  // This is intentionally lenient — it handles the 95% case for AI-generated
  // single-file React components.

  // Find JSX opening tags: <TagName
  // Negative lookbehind for `/` to skip closing tags.
  // Match tag name and everything up to the closing `>` or `/>`.
  const tagRegex = /<(?!\/)([A-Za-z][\w.]*)((?:\s|\n)(?:[^>]|(?:=\s*\{(?:[^{}]|\{[^{}]*\})*\}))*?)(\/?>)/g;

  let id = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(code)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1];
    const attrsStr = match[2] || "";
    const closingBracket = match[3]; // `>` or `/>`
    const openStart = match.index;
    const nameEnd = openStart + 1 + tagName.length; // right after tag name
    const openEnd = openStart + fullMatch.length;
    const selfClosing = closingBracket === "/>";

    const props = parseProps(attrsStr, openStart + 1 + tagName.length);

    const node: JsxNode = {
      id: id++,
      name: tagName,
      props,
      textContent: "",
      children: [],
      openStart,
      nameEnd,
      openEnd,
      selfClosing,
    };

    // Try to capture immediate text content (rough heuristic)
    if (!selfClosing) {
      const afterOpen = code.slice(openEnd, openEnd + 500);
      const textMatch = afterOpen.match(/^([^<{]+)/);
      if (textMatch && textMatch[1].trim()) {
        node.textContent = textMatch[1].trim();
      }
    }

    nodeMap.set(node.id, node);
    roots.push(node);
  }

  // Build parent-child hierarchy using nesting (source positions)
  // Sort by openStart (already sorted since regex scans left-to-right)
  // Use a stack-based approach: for each node, find the innermost enclosing non-self-closing node
  const stack: JsxNode[] = [];
  const topLevel: JsxNode[] = [];

  for (const node of roots) {
    // Pop nodes from stack that have already closed before this node starts
    // For a proper hierarchy we'd need closing tag positions too, but as a heuristic
    // we'll build a flat list with a "depth" hint and skip nesting for now.
    // The flat list with IDs is sufficient for selection + prop editing.
  }

  return { roots, nodeMap };
}

// ─── Props parser ────────────────────────────────────────────────────

function parseProps(attrsStr: string, baseOffset: number): JsxProp[] {
  const props: JsxProp[] = [];
  if (!attrsStr.trim()) return props;

  // Match prop patterns:
  //   name="value"  |  name='value'  |  name={expression}  |  name (boolean)
  const propRegex =
    /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}))|(\b[a-zA-Z][\w-]*)\b(?=\s|\/?>)/g;

  let m: RegExpExecArray | null;
  while ((m = propRegex.exec(attrsStr)) !== null) {
    if (m[1]) {
      // name=value prop
      const name = m[1];
      const stringVal = m[2] ?? m[3]; // double or single quote
      const exprVal = m[4]; // { expression }

      let rawValue: string;
      let value: string;

      if (stringVal !== undefined) {
        rawValue = `"${stringVal}"`;
        value = stringVal;
      } else if (exprVal) {
        rawValue = exprVal;
        // Strip outer braces
        value = exprVal.slice(1, -1).trim();
      } else {
        rawValue = "true";
        value = "true";
      }

      props.push({
        name,
        rawValue,
        value,
        start: baseOffset + m.index,
        end: baseOffset + m.index + m[0].length,
      });
    } else if (m[5]) {
      // Boolean shorthand prop (e.g. `disabled`)
      const name = m[5];
      props.push({
        name,
        rawValue: "true",
        value: "true",
        start: baseOffset + m.index,
        end: baseOffset + m.index + m[0].length,
      });
    }
  }

  return props;
}

// ─── Code instrumentation ────────────────────────────────────────────

/**
 * Inject `data-make-node={id}` and `data-make-name={name}` attributes into
 * every JSX opening tag. Returns the instrumented code.
 * The IDs match the `id` field of the parsed JsxNode objects, enabling
 * DOM ↔ source mapping.
 */
export function instrumentCode(code: string, nodes: JsxNode[]): string {
  if (nodes.length === 0) return code;

  // Sort nodes by nameEnd in reverse order so we can insert without shifting offsets
  const sorted = [...nodes].sort((a, b) => b.nameEnd - a.nameEnd);

  let result = code;
  for (const node of sorted) {
    const injection = ` data-make-node="${node.id}" data-make-name="${node.name}"`;
    result = result.slice(0, node.nameEnd) + injection + result.slice(node.nameEnd);
  }

  return result;
}

// ─── Code modification ──────────────────────────────────────────────

/**
 * Update a single prop value in the source code.
 * Returns the modified code string.
 */
export function updatePropInCode(
  code: string,
  node: JsxNode,
  propName: string,
  newValue: string
): string {
  const existingProp = node.props.find((p) => p.name === propName);

  if (existingProp) {
    // Replace existing prop value
    const isStringProp = existingProp.rawValue.startsWith('"') || existingProp.rawValue.startsWith("'");
    const isExprProp = existingProp.rawValue.startsWith("{");

    let newRawValue: string;
    if (propName === "className" || isStringProp) {
      newRawValue = `"${newValue}"`;
    } else if (isExprProp) {
      newRawValue = `{${newValue}}`;
    } else {
      newRawValue = `"${newValue}"`;
    }

    const fullPropText = `${propName}=${newRawValue}`;
    return code.slice(0, existingProp.start) + fullPropText + code.slice(existingProp.end);
  } else {
    // Add new prop after tag name
    const injection = ` ${propName}="${newValue}"`;
    return code.slice(0, node.nameEnd) + injection + code.slice(node.nameEnd);
  }
}

/**
 * Update the text content of a node.
 * Replaces the first text child between the opening and closing tags.
 */
export function updateTextInCode(
  code: string,
  node: JsxNode,
  newText: string
): string {
  if (node.selfClosing || !node.textContent) return code;

  // Find the text content right after the opening tag
  const afterOpen = code.indexOf(node.textContent, node.openEnd);
  if (afterOpen === -1) return code;

  return (
    code.slice(0, afterOpen) +
    newText +
    code.slice(afterOpen + node.textContent.length)
  );
}

/**
 * Strip all data-make-node and data-make-name attributes from instrumented code.
 * Used when the user edits the code in the Sandpack code editor — we need to
 * store the clean version.
 */
export function stripInstrumentation(code: string): string {
  return code.replace(/\s+data-make-node="[^"]*"/g, "").replace(/\s+data-make-name="[^"]*"/g, "");
}

/**
 * Delete an entire JSX element from the source code.
 * For self-closing tags: removes `<Foo ... />`
 * For container tags: removes `<Foo ...>...</Foo>`
 */
export function deleteNodeFromCode(code: string, node: JsxNode): string {
  if (node.selfClosing) {
    // Self-closing: remove from `<` to `/>`
    let start = node.openStart;
    let end = node.openEnd;

    // Also eat trailing whitespace/newline
    while (end < code.length && (code[end] === " " || code[end] === "\n" || code[end] === "\r")) end++;

    return code.slice(0, start) + code.slice(end);
  }

  // Container tag: find the matching closing tag </TagName>
  // Search from after the opening tag for `</TagName>`
  const closingTag = `</${node.name}>`;
  let depth = 0;
  let searchPos = node.openEnd;

  // We need to handle nested tags of the same name
  const openPattern = new RegExp(`<${escapeRegExp(node.name)}(?:\\s|>|\\/>)`, "g");
  const closePattern = new RegExp(`</${escapeRegExp(node.name)}>`, "g");

  openPattern.lastIndex = node.openEnd;
  closePattern.lastIndex = node.openEnd;

  // Find each opening and closing of same-name tags, tracking depth
  const events: { pos: number; type: "open" | "close"; end: number }[] = [];

  let om: RegExpExecArray | null;
  while ((om = openPattern.exec(code)) !== null) {
    if (om.index > node.openStart) { // skip our own opening tag
      events.push({ pos: om.index, type: "open", end: om.index + om[0].length });
    }
  }

  let cm: RegExpExecArray | null;
  while ((cm = closePattern.exec(code)) !== null) {
    events.push({ pos: cm.index, type: "close", end: cm.index + cm[0].length });
  }

  events.sort((a, b) => a.pos - b.pos);

  let closeEnd = -1;
  depth = 0;
  for (const ev of events) {
    if (ev.type === "open") {
      depth++;
    } else {
      if (depth === 0) {
        // This is OUR closing tag
        closeEnd = ev.end;
        break;
      }
      depth--;
    }
  }

  if (closeEnd === -1) {
    // Couldn't find closing tag — just remove the opening tag as fallback
    return code.slice(0, node.openStart) + code.slice(node.openEnd);
  }

  let start = node.openStart;
  let end = closeEnd;

  // Eat trailing whitespace/newline
  while (end < code.length && (code[end] === " " || code[end] === "\n" || code[end] === "\r")) end++;

  return code.slice(0, start) + code.slice(end);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Node range & move ──────────────────────────────────────────────

/**
 * Get the full source range of a node (from opening `<` to closing `>`).
 * For self-closing tags: `<Foo ... />`
 * For container tags: `<Foo ...>...</Foo>`
 */
export function getNodeRange(code: string, node: JsxNode): { start: number; end: number } {
  if (node.selfClosing) {
    return { start: node.openStart, end: node.openEnd };
  }

  // Container tag: find matching closing tag (same depth-tracking logic as deleteNodeFromCode)
  const openPattern = new RegExp(`<${escapeRegExp(node.name)}(?:\\s|>|\\/>)`, "g");
  const closePattern = new RegExp(`</${escapeRegExp(node.name)}>`, "g");

  openPattern.lastIndex = node.openEnd;
  closePattern.lastIndex = node.openEnd;

  const events: { pos: number; type: "open" | "close"; end: number }[] = [];

  let om: RegExpExecArray | null;
  while ((om = openPattern.exec(code)) !== null) {
    if (om.index > node.openStart) {
      events.push({ pos: om.index, type: "open", end: om.index + om[0].length });
    }
  }

  let cm: RegExpExecArray | null;
  while ((cm = closePattern.exec(code)) !== null) {
    events.push({ pos: cm.index, type: "close", end: cm.index + cm[0].length });
  }

  events.sort((a, b) => a.pos - b.pos);

  let depth = 0;
  for (const ev of events) {
    if (ev.type === "open") {
      depth++;
    } else {
      if (depth === 0) {
        return { start: node.openStart, end: ev.end };
      }
      depth--;
    }
  }

  // Fallback — couldn't find closing tag
  return { start: node.openStart, end: node.openEnd };
}

/**
 * Move a JSX element before or after another element in the source code.
 * Returns the modified code string.
 */
export function moveNodeInCode(
  code: string,
  sourceNode: JsxNode,
  targetNode: JsxNode,
  position: "before" | "after"
): string {
  if (sourceNode.id === targetNode.id) return code;

  const sourceRange = getNodeRange(code, sourceNode);
  const targetRange = getNodeRange(code, targetNode);

  // Prevent moving if one is nested inside the other
  if (sourceRange.start < targetRange.start && sourceRange.end > targetRange.end) return code;
  if (targetRange.start < sourceRange.start && targetRange.end > sourceRange.end) return code;

  // Extract source text (trimmed of leading/trailing blank lines for clean insertion)
  const sourceText = code.slice(sourceRange.start, sourceRange.end);

  // Also capture trailing whitespace/newline that belongs to the source element
  let sourceRemoveEnd = sourceRange.end;
  while (sourceRemoveEnd < code.length && code[sourceRemoveEnd] === " ") sourceRemoveEnd++;
  if (sourceRemoveEnd < code.length && code[sourceRemoveEnd] === "\n") sourceRemoveEnd++;

  const insertAt = position === "before" ? targetRange.start : targetRange.end;

  // Determine the indentation at the insertion point
  let indentStart = insertAt;
  while (indentStart > 0 && code[indentStart - 1] !== "\n") indentStart--;
  const existingIndent = code.slice(indentStart, insertAt).match(/^(\s*)/)?.[1] ?? "";

  // Determine the indentation of the source element
  let srcIndentStart = sourceRange.start;
  while (srcIndentStart > 0 && code[srcIndentStart - 1] !== "\n") srcIndentStart--;
  const srcIndent = code.slice(srcIndentStart, sourceRange.start).match(/^(\s*)/)?.[1] ?? "";

  // Re-indent source text to match target indentation
  let reindentedSource = sourceText;
  if (srcIndent !== existingIndent) {
    const lines = sourceText.split("\n");
    reindentedSource = lines
      .map((line, i) => {
        if (i === 0) return existingIndent + line.trimStart();
        // For subsequent lines, replace old indent with new
        if (line.startsWith(srcIndent)) {
          return existingIndent + line.slice(srcIndent.length);
        }
        return line;
      })
      .join("\n");
  }

  const insertion = position === "before"
    ? reindentedSource + "\n"
    : "\n" + reindentedSource;

  if (sourceRange.end <= insertAt) {
    // Source is BEFORE target in code → remove source first, then insert
    const withoutSource = code.slice(0, sourceRange.start) + code.slice(sourceRemoveEnd);
    const shift = sourceRemoveEnd - sourceRange.start;
    const adjustedInsertAt = insertAt - shift;
    return withoutSource.slice(0, adjustedInsertAt) + insertion + withoutSource.slice(adjustedInsertAt);
  } else {
    // Source is AFTER target in code → insert first, then remove
    const withInsert = code.slice(0, insertAt) + insertion + code.slice(insertAt);
    const shift = insertion.length;
    return withInsert.slice(0, sourceRange.start + shift) + withInsert.slice(sourceRemoveEnd + shift);
  }
}

/**
 * Remove a prop from a node in the source code.
 */
export function removePropFromCode(code: string, node: JsxNode, propName: string): string {
  const prop = node.props.find((p) => p.name === propName);
  if (!prop) return code;

  // Remove the prop and any leading whitespace
  let start = prop.start;
  while (start > 0 && code[start - 1] === " ") start--;
  // But keep at least one space before for readability
  if (start < prop.start) start++;

  return code.slice(0, start) + code.slice(prop.end);
}

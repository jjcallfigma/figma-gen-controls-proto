/**
 * Server-side tool executor.
 *
 * Executes AI tool calls against the canvas data provided in the request.
 * Returns structured results that get sent back to the LLM.
 */

import {
  checkAccessibility,
  auditConsistency,
  analyzeHierarchy,
  extractDesignSystem,
  type CanvasObjectData,
} from "./designAnalysis";
import {
  getCanvasOverview,
  inspectCanvas,
  type PageData,
} from "./canvasInspector";

// ─── Types ──────────────────────────────────────────────────────────

export interface CanvasContext {
  objects: Record<string, CanvasObjectData>;
  pages: Record<string, PageData>;
  pageIds: string[];
  currentPageId: string;
  selectedIds: string[];
  designSystem?: any;
}

export interface ToolCallResult {
  name: string;
  result: string;
  /** Short summary for streaming to the client UI */
  summary: string;
  /** If the tool produces operations, they are returned here */
  operations?: any[];
  /** If the tool wants to change the canvas selection, return the IDs here */
  selectedIds?: string[];
}

// ─── Execute a tool call ────────────────────────────────────────────

export function executeTool(
  toolName: string,
  args: Record<string, any>,
  canvasContext: CanvasContext
): ToolCallResult {
  switch (toolName) {
    case "inspect_canvas":
      return executeInspectCanvas(args, canvasContext);

    case "get_design_overview":
      return executeGetDesignOverview(canvasContext);

    case "check_accessibility":
      return executeCheckAccessibility(args, canvasContext);

    case "audit_consistency":
      return executeAuditConsistency(args, canvasContext);

    case "analyze_hierarchy":
      return executeAnalyzeHierarchy(args, canvasContext);

    case "apply_operations":
      return executeApplyOperations(args);

    case "get_spatial_info":
      return executeGetSpatialInfo(args, canvasContext);

    case "move_objects":
      return executeMoveObjects(args, canvasContext);

    case "resize_objects":
      return executeResizeObjects(args, canvasContext);

    case "select_objects":
      return executeSelectObjects(args, canvasContext);

    case "search_design_references":
      return executeSearchDesignReferences(args);

    case "extract_design_system":
      return executeExtractDesignSystem(args, canvasContext);

    case "inspect_make":
      return executeInspectMake(args, canvasContext);

    default:
      return {
        name: toolName,
        result: `Unknown tool: ${toolName}`,
        summary: `Unknown tool: ${toolName}`,
      };
  }
}

// ─── Tool implementations ───────────────────────────────────────────

function executeInspectCanvas(
  args: Record<string, any>,
  ctx: CanvasContext
): ToolCallResult {
  const mode = args.mode || "summary";
  const targetId = args.targetId;

  const result = inspectCanvas(ctx.objects, mode, targetId);
  const objectCount = Object.keys(ctx.objects).length;

  return {
    name: "inspect_canvas",
    result,
    summary: targetId
      ? `Inspected "${ctx.objects[targetId]?.name || targetId}" in ${mode} mode`
      : `Inspected canvas (${objectCount} objects) in ${mode} mode`,
  };
}

function executeGetDesignOverview(ctx: CanvasContext): ToolCallResult {
  const overview = getCanvasOverview(
    ctx.objects,
    ctx.pages,
    ctx.pageIds,
    ctx.currentPageId
  );

  const resultText = formatDesignOverview(overview);

  return {
    name: "get_design_overview",
    result: resultText,
    summary: `Design overview: ${overview.totalObjects} objects across ${overview.pages.length} page(s)`,
  };
}

function formatDesignOverview(overview: ReturnType<typeof getCanvasOverview>): string {
  const lines: string[] = [];
  lines.push(`Design File Overview`);
  lines.push(`Total objects: ${overview.totalObjects}`);
  lines.push(`Pages: ${overview.pages.length}`);
  lines.push(`Current page: ${overview.currentPageId}`);
  lines.push("");

  for (const page of overview.pages) {
    const isCurrent = page.id === overview.currentPageId ? " (current)" : "";
    lines.push(`Page: "${page.name}"${isCurrent} — ${page.objectCount} objects`);
    for (const frame of page.topLevelFrames) {
      lines.push(
        `  - "${frame.name}" — ${frame.width}x${frame.height} — ${frame.childCount} children`
      );
    }
  }

  if (overview.colorSummary.length > 0) {
    lines.push("");
    lines.push(`Colors in use: ${overview.colorSummary.join(", ")}`);
  }
  if (overview.fontSummary.length > 0) {
    lines.push(`Fonts in use: ${overview.fontSummary.join(", ")}`);
  }

  return lines.join("\n");
}

function executeCheckAccessibility(
  args: Record<string, any>,
  ctx: CanvasContext
): ToolCallResult {
  const scope = args.scope || "page";
  const selectedIds = scope === "selection" ? ctx.selectedIds : undefined;

  const issues = checkAccessibility(ctx.objects, scope, selectedIds);

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  let resultText = `Accessibility Report (${scope} scope)\n`;
  resultText += `Found ${issues.length} issue(s): ${errors.length} error(s), ${warnings.length} warning(s)\n\n`;

  for (const issue of issues) {
    const icon = issue.severity === "error" ? "[ERROR]" : "[WARNING]";
    resultText += `${icon} ${issue.message}\n`;
    resultText += `  Object: "${issue.objectName}" (${issue.objectId})\n`;
    resultText += `  ${issue.details}\n\n`;
  }

  if (issues.length === 0) {
    resultText += "No accessibility issues found. The design passes basic WCAG checks.";
  }

  return {
    name: "check_accessibility",
    result: resultText,
    summary: issues.length === 0
      ? "No accessibility issues found"
      : `Found ${errors.length} error(s) and ${warnings.length} warning(s)`,
  };
}

function executeAuditConsistency(
  args: Record<string, any>,
  ctx: CanvasContext
): ToolCallResult {
  const scope = args.scope || "page";
  const selectedIds = scope === "selection" ? ctx.selectedIds : undefined;

  const report = auditConsistency(ctx.objects, scope, selectedIds);

  let resultText = `Consistency Audit (${scope} scope)\n\n`;

  resultText += `Colors (${report.colors.length} unique):\n`;
  for (const c of report.colors.slice(0, 15)) {
    resultText += `  ${c.value} — used ${c.count} time(s)\n`;
  }

  if (report.nearDuplicateColors.length > 0) {
    resultText += `\nNear-duplicate colors:\n`;
    for (const d of report.nearDuplicateColors) {
      resultText += `  ${d.a} ≈ ${d.b} (distance: ${d.distance})\n`;
    }
  }

  resultText += `\nFont families (${report.fontFamilies.length}):\n`;
  for (const f of report.fontFamilies) {
    resultText += `  ${f.value} — used ${f.count} time(s)\n`;
  }

  resultText += `\nFont sizes (${report.fontSizes.length} unique):\n`;
  for (const f of report.fontSizes) {
    resultText += `  ${f.value}px — used ${f.count} time(s)\n`;
  }

  resultText += `\nSpacing values:\n`;
  for (const s of report.spacings.slice(0, 15)) {
    resultText += `  ${s.type} ${s.value}px — used ${s.count} time(s)\n`;
  }

  resultText += `\nBorder radii (${report.borderRadii.length} unique):\n`;
  for (const b of report.borderRadii) {
    resultText += `  ${b.value}px — used ${b.count} time(s)\n`;
  }

  if (report.issues.length > 0) {
    resultText += `\nIssues:\n`;
    for (const issue of report.issues) {
      resultText += `  - ${issue}\n`;
    }
  }

  return {
    name: "audit_consistency",
    result: resultText,
    summary: `${report.colors.length} colors, ${report.fontSizes.length} font sizes, ${report.issues.length} issue(s)`,
  };
}

function executeAnalyzeHierarchy(
  args: Record<string, any>,
  ctx: CanvasContext
): ToolCallResult {
  const scope = args.scope || "page";
  const selectedIds = scope === "selection" ? ctx.selectedIds : undefined;

  const report = analyzeHierarchy(ctx.objects, scope, selectedIds);

  let resultText = `Hierarchy Analysis (${scope} scope)\n\n`;
  resultText += `Total objects: ${report.totalObjects}\n`;
  resultText += `Maximum nesting depth: ${report.maxDepth}\n`;
  resultText += `Auto-layout: ${report.autoLayoutUsage.withAutoLayout} with, ${report.autoLayoutUsage.without} without\n\n`;

  resultText += `Text size distribution:\n`;
  for (const t of report.textSizeDistribution) {
    resultText += `  ${t.size}px (${t.role}) — ${t.count} instance(s)\n`;
  }

  if (report.namingIssues.length > 0) {
    resultText += `\nNaming issues (${report.namingIssues.length}):\n`;
    for (const n of report.namingIssues.slice(0, 10)) {
      resultText += `  "${n.name}" — ${n.issue}\n`;
    }
  }

  if (report.emptyFrames.length > 0) {
    resultText += `\nEmpty frames (${report.emptyFrames.length}):\n`;
    for (const f of report.emptyFrames) {
      resultText += `  "${f.name}" (${f.objectId})\n`;
    }
  }

  if (report.structureNotes.length > 0) {
    resultText += `\nStructure notes:\n`;
    for (const note of report.structureNotes) {
      resultText += `  - ${note}\n`;
    }
  }

  return {
    name: "analyze_hierarchy",
    result: resultText,
    summary: `${report.totalObjects} objects, max depth ${report.maxDepth}, ${report.structureNotes.length} note(s)`,
  };
}

function executeApplyOperations(args: Record<string, any>): ToolCallResult {
  // Operations are returned to the client for execution
  const operations = args.operations || [];
  const explanation = args.explanation || "Applied design operations";

  return {
    name: "apply_operations",
    result: explanation,
    summary: explanation,
    operations,
  };
}

// ─── Spatial helpers ─────────────────────────────────────────────────

/** Compute absolute world position by walking up the parent chain */
function getAbsolutePos(
  obj: CanvasObjectData,
  objects: Record<string, CanvasObjectData>
): { x: number; y: number } {
  let absX = obj.x || 0;
  let absY = obj.y || 0;
  let pid = obj.parentId;
  while (pid) {
    const parent = objects[pid];
    if (!parent) break;
    absX += parent.x || 0;
    absY += parent.y || 0;
    pid = parent.parentId;
  }
  return { x: Math.round(absX), y: Math.round(absY) };
}

interface ObjBounds {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

function getObjBounds(
  obj: CanvasObjectData,
  objects: Record<string, CanvasObjectData>
): ObjBounds {
  const pos = getAbsolutePos(obj, objects);
  return {
    id: obj.id,
    name: obj.name,
    x: pos.x,
    y: pos.y,
    width: Math.round(obj.width),
    height: Math.round(obj.height),
    right: pos.x + Math.round(obj.width),
    bottom: pos.y + Math.round(obj.height),
  };
}

// ─── get_spatial_info ────────────────────────────────────────────────

function executeGetSpatialInfo(
  args: Record<string, any>,
  ctx: CanvasContext
): ToolCallResult {
  const objectIds: string[] | undefined = args.objectIds;

  // Resolve which objects to analyze
  let targets: CanvasObjectData[];
  if (objectIds && objectIds.length > 0) {
    targets = objectIds
      .map((id) => ctx.objects[id])
      .filter(Boolean);
  } else {
    // All top-level objects
    targets = Object.values(ctx.objects).filter(
      (o) => !o.parentId && o.visible !== false
    );
  }

  if (targets.length === 0) {
    return {
      name: "get_spatial_info",
      result: "No objects found to analyze.",
      summary: "No objects found",
    };
  }

  // Compute bounds for each target
  const boundsList: ObjBounds[] = targets.map((o) =>
    getObjBounds(o, ctx.objects)
  );

  // Build per-object info
  const lines: string[] = [
    `Spatial info for ${boundsList.length} object(s):\n`,
  ];

  for (const b of boundsList) {
    lines.push(
      `- "${b.name}" (${b.id}): position (${b.x}, ${b.y}), size ${b.width}x${b.height}, bottom-right (${b.right}, ${b.bottom})`
    );
  }

  // Pairwise relationships
  if (boundsList.length > 1 && boundsList.length <= 20) {
    lines.push("\nSpatial relationships:");
    for (let i = 0; i < boundsList.length; i++) {
      for (let j = i + 1; j < boundsList.length; j++) {
        const a = boundsList[i];
        const b = boundsList[j];
        const rel = describeSpatialRelationship(a, b);
        lines.push(`  "${a.name}" ↔ "${b.name}": ${rel}`);
      }
    }
  }

  return {
    name: "get_spatial_info",
    result: lines.join("\n"),
    summary: `Spatial info for ${boundsList.length} object(s)`,
  };
}

function describeSpatialRelationship(a: ObjBounds, b: ObjBounds): string {
  const parts: string[] = [];

  // Vertical relationship
  if (a.bottom <= b.y) {
    parts.push(`"${a.name}" is above "${b.name}" (${b.y - a.bottom}px gap)`);
  } else if (b.bottom <= a.y) {
    parts.push(`"${a.name}" is below "${b.name}" (${a.y - b.bottom}px gap)`);
  } else {
    // Vertical overlap
    const overlapTop = Math.max(a.y, b.y);
    const overlapBottom = Math.min(a.bottom, b.bottom);
    const vOverlap = overlapBottom - overlapTop;
    if (vOverlap > 0) {
      parts.push(`vertically overlapping by ${vOverlap}px`);
    }
  }

  // Horizontal relationship
  if (a.right <= b.x) {
    parts.push(`"${a.name}" is left of "${b.name}" (${b.x - a.right}px gap)`);
  } else if (b.right <= a.x) {
    parts.push(`"${a.name}" is right of "${b.name}" (${a.x - b.right}px gap)`);
  } else {
    const overlapLeft = Math.max(a.x, b.x);
    const overlapRight = Math.min(a.right, b.right);
    const hOverlap = overlapRight - overlapLeft;
    if (hOverlap > 0) {
      parts.push(`horizontally overlapping by ${hOverlap}px`);
    }
  }

  // Center-to-center distance
  const centerAx = a.x + a.width / 2;
  const centerAy = a.y + a.height / 2;
  const centerBx = b.x + b.width / 2;
  const centerBy = b.y + b.height / 2;
  const dist = Math.round(
    Math.sqrt((centerAx - centerBx) ** 2 + (centerAy - centerBy) ** 2)
  );
  parts.push(`center distance: ${dist}px`);

  return parts.join(", ");
}

// ─── move_objects ────────────────────────────────────────────────────

function executeMoveObjects(
  args: Record<string, any>,
  ctx: CanvasContext
): ToolCallResult {
  const moves: any[] = args.moves || [];
  if (moves.length === 0) {
    return {
      name: "move_objects",
      result: "No moves specified.",
      summary: "No moves specified",
    };
  }

  const operations: any[] = [];
  const descriptions: string[] = [];

  for (const move of moves) {
    const targetId = move.targetId;
    const target = ctx.objects[targetId];
    if (!target) {
      descriptions.push(`Object ${targetId} not found, skipped`);
      continue;
    }

    let newX: number;
    let newY: number;

    if (move.relativeTo) {
      // Relative positioning
      const refObj = ctx.objects[move.relativeTo];
      if (!refObj) {
        descriptions.push(
          `Reference object ${move.relativeTo} not found, skipped`
        );
        continue;
      }

      const refBounds = getObjBounds(refObj, ctx.objects);
      const targetBounds = getObjBounds(target, ctx.objects);
      const gap = move.gap ?? 20;
      const position = move.position || "below";

      switch (position) {
        case "below":
          newX = refBounds.x;
          newY = refBounds.bottom + gap;
          break;
        case "above":
          newX = refBounds.x;
          newY = refBounds.y - targetBounds.height - gap;
          break;
        case "right":
          newX = refBounds.right + gap;
          newY = refBounds.y;
          break;
        case "left":
          newX = refBounds.x - targetBounds.width - gap;
          newY = refBounds.y;
          break;
        case "center-below":
          newX =
            refBounds.x +
            Math.round((refBounds.width - targetBounds.width) / 2);
          newY = refBounds.bottom + gap;
          break;
        case "center-right":
          newX = refBounds.right + gap;
          newY =
            refBounds.y +
            Math.round((refBounds.height - targetBounds.height) / 2);
          break;
        default:
          newX = refBounds.x;
          newY = refBounds.bottom + gap;
      }

      descriptions.push(
        `Moved "${target.name}" ${position} "${refObj.name}" (${gap}px gap)`
      );
    } else {
      // Absolute positioning
      newX = Math.round(move.x ?? 0);
      newY = Math.round(move.y ?? 0);
      descriptions.push(
        `Moved "${target.name}" to (${newX}, ${newY})`
      );
    }

    // If the object has a parent, we need to convert world coords to parent-relative
    if (target.parentId) {
      const parentPos = getAbsolutePos(
        ctx.objects[target.parentId],
        ctx.objects
      );
      newX = newX - parentPos.x;
      newY = newY - parentPos.y;
    }

    operations.push({
      op: "update",
      targetId,
      changes: {
        x: Math.round(newX),
        y: Math.round(newY),
      },
    });
  }

  const summary = descriptions.join("; ");

  return {
    name: "move_objects",
    result: summary,
    summary:
      operations.length === 1
        ? descriptions[0]
        : `Moved ${operations.length} object(s)`,
    operations,
  };
}

// ─── resize_objects ──────────────────────────────────────────────────

function executeResizeObjects(
  args: Record<string, any>,
  ctx: CanvasContext
): ToolCallResult {
  const resizes: any[] = args.resizes || [];
  if (resizes.length === 0) {
    return {
      name: "resize_objects",
      result: "No resizes specified.",
      summary: "No resizes specified",
    };
  }

  const operations: any[] = [];
  const descriptions: string[] = [];

  for (const resize of resizes) {
    const targetId = resize.targetId;
    const target = ctx.objects[targetId];
    if (!target) {
      descriptions.push(`Object ${targetId} not found, skipped`);
      continue;
    }

    const changes: any = {};

    if (resize.matchId) {
      // Match mode
      const matchObj = ctx.objects[resize.matchId];
      if (!matchObj) {
        descriptions.push(
          `Match object ${resize.matchId} not found, skipped`
        );
        continue;
      }

      const dimension = resize.dimension || "both";
      if (dimension === "width" || dimension === "both") {
        changes.width = Math.round(matchObj.width);
      }
      if (dimension === "height" || dimension === "both") {
        changes.height = Math.round(matchObj.height);
      }

      descriptions.push(
        `Resized "${target.name}" to match "${matchObj.name}" ${dimension}`
      );
    } else {
      // Absolute mode
      if (resize.width !== undefined) {
        changes.width = Math.round(resize.width);
      }
      if (resize.height !== undefined) {
        changes.height = Math.round(resize.height);
      }

      descriptions.push(
        `Resized "${target.name}" to ${changes.width ?? target.width}x${changes.height ?? target.height}`
      );
    }

    if (Object.keys(changes).length > 0) {
      operations.push({
        op: "update",
        targetId,
        changes,
      });
    }
  }

  const summary = descriptions.join("; ");

  return {
    name: "resize_objects",
    result: summary,
    summary:
      operations.length === 1
        ? descriptions[0]
        : `Resized ${operations.length} object(s)`,
    operations,
  };
}

// ─── select_objects ──────────────────────────────────────────────────

function executeSelectObjects(
  args: Record<string, any>,
  ctx: CanvasContext
): ToolCallResult {
  const objectIds: string[] | undefined = args.objectIds;
  const filter = args.filter as
    | {
        type?: string;
        namePattern?: string;
        fillColor?: string;
        minWidth?: number;
        maxWidth?: number;
        minHeight?: number;
        maxHeight?: number;
        parentId?: string;
      }
    | undefined;

  let matchedIds: string[] = [];

  if (objectIds && objectIds.length > 0) {
    // Direct selection by IDs
    matchedIds = objectIds.filter((id) => ctx.objects[id]);
  } else if (filter) {
    // Filter-based selection
    const allObjects = Object.values(ctx.objects);

    matchedIds = allObjects
      .filter((obj) => {
        if (obj.visible === false) return false;

        if (filter.type && obj.type !== filter.type) return false;

        if (filter.namePattern) {
          const regex = new RegExp(filter.namePattern, "i");
          if (!regex.test(obj.name)) return false;
        }

        if (filter.fillColor) {
          const targetColor = filter.fillColor.toUpperCase().replace(/^#/, "");
          const hasFill = obj.fills?.some((f) => {
            if (f.visible === false || f.type !== "solid" || !f.color)
              return false;
            const objColor = f.color.toUpperCase().replace(/^#/, "");
            return objColor === targetColor;
          });
          if (!hasFill) return false;
        }

        if (filter.minWidth !== undefined && obj.width < filter.minWidth)
          return false;
        if (filter.maxWidth !== undefined && obj.width > filter.maxWidth)
          return false;
        if (filter.minHeight !== undefined && obj.height < filter.minHeight)
          return false;
        if (filter.maxHeight !== undefined && obj.height > filter.maxHeight)
          return false;

        if (filter.parentId !== undefined && obj.parentId !== filter.parentId)
          return false;

        return true;
      })
      .map((obj) => obj.id);
  }

  if (matchedIds.length === 0) {
    return {
      name: "select_objects",
      result: "No matching objects found.",
      summary: "No objects matched the criteria",
    };
  }

  // Build a summary of what was selected
  const names = matchedIds
    .slice(0, 10)
    .map((id) => `"${ctx.objects[id]?.name || id}"`)
    .join(", ");
  const suffix = matchedIds.length > 10 ? ` and ${matchedIds.length - 10} more` : "";
  const resultText = `Selected ${matchedIds.length} object(s): ${names}${suffix}`;

  return {
    name: "select_objects",
    result: resultText,
    summary: `Selected ${matchedIds.length} object(s)`,
    selectedIds: matchedIds,
  };
}

function executeSearchDesignReferences(args: Record<string, any>): ToolCallResult {
  // In a production implementation, this would call an external search API.
  // For now, we return a helpful response based on built-in design knowledge.
  const query = args.query || "";

  const result = getBuiltInDesignKnowledge(query);

  return {
    name: "search_design_references",
    result,
    summary: `Searched design references for "${query.slice(0, 50)}"`,
  };
}

function executeExtractDesignSystem(
  args: Record<string, any>,
  ctx: CanvasContext
): ToolCallResult {
  const scope = args.scope || "page";
  const ds = extractDesignSystem(ctx.objects, scope);

  let resultText = `Extracted Design System\n\n`;

  resultText += `Color Palette (${ds.colors.length} colors):\n`;
  for (const c of ds.colors) {
    resultText += `  ${c.hex} — ${c.usage} (used ${c.count}x)\n`;
  }

  resultText += `\nTypography Scale:\n`;
  for (const t of ds.typography) {
    resultText += `  ${t.name}: ${t.fontFamily} ${t.fontSize}px / ${t.fontWeight}\n`;
  }

  resultText += `\nSpacing Scale:\n`;
  for (const s of ds.spacing) {
    resultText += `  ${s.value}px — ${s.usage} (used ${s.count}x)\n`;
  }

  resultText += `\nBorder Radii:\n`;
  for (const b of ds.borderRadii) {
    resultText += `  ${b.value}px — ${b.usage} (used ${b.count}x)\n`;
  }

  if (ds.components.length > 0) {
    resultText += `\nComponents:\n`;
    for (const c of ds.components) {
      resultText += `  "${c.name}" — ${c.description}\n`;
    }
  }

  return {
    name: "extract_design_system",
    result: resultText,
    summary: `Extracted: ${ds.colors.length} colors, ${ds.typography.length} type styles, ${ds.spacing.length} spacing values`,
    // We could also store this in the response for the client to persist
  };
}

// ─── inspect_make ────────────────────────────────────────────────────

function executeInspectMake(
  args: Record<string, any>,
  ctx: CanvasContext
): ToolCallResult {
  const makeId = args.makeId;
  const obj = ctx.objects[makeId];

  if (!obj) {
    return {
      name: "inspect_make",
      result: `Make object "${makeId}" not found.`,
      summary: "Make not found",
    };
  }

  if (obj.type !== "make") {
    return {
      name: "inspect_make",
      result: `Object "${makeId}" is a ${obj.type}, not a Make.`,
      summary: `Not a Make (is ${obj.type})`,
    };
  }

  const props = (obj as any).properties || {};
  const code = props.code || "(empty)";
  const mode = props.mode || "html";
  const description = props.description || "(no description)";
  const chatCount = props.chatHistory?.length || 0;

  const lines: string[] = [
    `Make: "${obj.name}" (${makeId})`,
    `Mode: ${mode}`,
    `Size: ${Math.round(obj.width)}x${Math.round(obj.height)}`,
    `Description: ${description}`,
    `Chat messages: ${chatCount}`,
    ``,
    `Current code:`,
    `\`\`\`${mode === "react" ? "tsx" : "html"}`,
    code,
    `\`\`\``,
  ];

  return {
    name: "inspect_make",
    result: lines.join("\n"),
    summary: `Inspected Make "${obj.name}" (${mode}, ${code.length} chars)`,
  };
}

// ─── Built-in design knowledge for search fallback ──────────────────

function getBuiltInDesignKnowledge(query: string): string {
  const q = query.toLowerCase();

  const knowledge: { keywords: string[]; content: string }[] = [
    {
      keywords: ["ios", "hig", "apple", "iphone"],
      content: `iOS Human Interface Guidelines (key points):
- Navigation: Use tab bars for top-level navigation (max 5 items), navigation bars for hierarchical navigation
- Typography: SF Pro is the system font. Dynamic Type sizes: Large Title (34pt), Title 1 (28pt), Title 2 (22pt), Title 3 (20pt), Headline (17pt semibold), Body (17pt), Callout (16pt), Subhead (15pt), Footnote (13pt), Caption 1 (12pt), Caption 2 (11pt)
- Spacing: Standard margins are 16pt. Minimum touch target: 44x44pt
- Colors: Use system colors that adapt to light/dark mode. Tint colors for interactive elements
- Layout: Safe area insets. Status bar height: 54pt (iPhone 14+), Home indicator: 34pt
- Components: Standard iOS patterns include navigation bars, tab bars, toolbars, search bars, action sheets, alerts`,
    },
    {
      keywords: ["material", "android", "google"],
      content: `Material Design 3 Guidelines (key points):
- Typography scale: Display (Large/Medium/Small), Headline (L/M/S), Title (L/M/S), Body (L/M/S), Label (L/M/S)
- Spacing: 4dp grid. Common spacing: 8, 12, 16, 24, 32dp
- Touch targets: Minimum 48x48dp
- Elevation: 5 levels (0-5), conveyed through shadow and tonal color
- Navigation: Navigation bar (bottom), Navigation rail (side), Navigation drawer
- Components: FAB, Cards, Chips, Dialogs, Bottom sheets, Snackbar
- Color system: Primary, Secondary, Tertiary, Error, Surface, Background with tonal palettes`,
    },
    {
      keywords: ["contrast", "accessibility", "wcag", "a11y"],
      content: `WCAG Accessibility Guidelines:
- Contrast ratios: Normal text needs 4.5:1 (AA) or 7:1 (AAA). Large text (18pt+ or 14pt bold) needs 3:1 (AA) or 4.5:1 (AAA)
- Touch targets: Minimum 44x44 CSS pixels (WCAG 2.5.5)
- Text sizing: Don't use text smaller than 12px. Allow text to scale to 200%
- Color: Don't use color as the only visual means of conveying information
- Focus: All interactive elements must have visible focus indicators
- Labels: All form inputs need associated labels
- Alt text: All meaningful images need descriptive alt text`,
    },
    {
      keywords: ["typography", "type", "font", "scale"],
      content: `Typography Best Practices:
- Type scales: Use modular scales (Major Third 1.25x, Perfect Fourth 1.33x, Golden Ratio 1.618x)
- Common web scale: 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72px
- Line height: 1.4-1.6x for body text, 1.1-1.3x for headings
- Letter spacing: Slightly positive for small text, slightly negative for large headings
- Weights: Regular (400) for body, Medium (500) for emphasis, Semibold (600) for subheadings, Bold (700) for headings
- Max line width: 45-75 characters for optimal readability
- Font pairing: Pair a serif with a sans-serif, or use different weights of the same family`,
    },
    {
      keywords: ["color", "palette", "scheme"],
      content: `Color Theory for UI Design:
- 60-30-10 rule: 60% dominant color (background), 30% secondary, 10% accent
- Complementary: Colors opposite on the wheel (high contrast, use sparingly)
- Analogous: Adjacent colors (harmonious, low contrast)
- Triadic: Three evenly spaced colors (vibrant, balanced)
- Neutral palette: Build with warm or cool grays (not pure gray)
- Semantic colors: Blue=trust/info, Green=success, Yellow=warning, Red=error/danger
- Dark mode: Don't just invert. Use dark gray (#121212) not pure black. Reduce saturation`,
    },
    {
      keywords: ["spacing", "layout", "grid", "whitespace"],
      content: `Spacing and Layout Best Practices:
- Base unit: Use 4px or 8px base grid
- Spacing scale (8px base): 4, 8, 12, 16, 24, 32, 48, 64, 96px
- Content padding: 16-24px for mobile, 24-48px for desktop
- Card padding: 16-24px
- Component gap: 8-16px within, 16-24px between sections
- Touch target spacing: At least 8px between interactive elements
- Section spacing: Use 2-3x your component spacing between major sections
- Margin ratio: Top margin of a section should be greater than bottom margin`,
    },
    {
      keywords: ["button", "cta", "action"],
      content: `Button Design Patterns:
- Primary: Filled background, high contrast. One per view for the main action
- Secondary: Outlined or tonal. For supporting actions
- Tertiary: Text-only or ghost. For less important actions
- Sizing: Height 32-48px. Padding 12-24px horizontal, 8-12px vertical
- Min width: 64-80px to maintain touch target
- Border radius: 4-8px for subtle, 12-20px for rounded, 999px for pill
- States: Default, Hover, Pressed, Focused, Disabled, Loading
- Icon buttons: 32-48px square. Use tooltip for accessibility`,
    },
    {
      keywords: ["card", "component", "pattern"],
      content: `Common UI Card Patterns:
- Basic card: Header + Content + Footer with consistent padding
- Media card: Image (top or side) + text content + actions
- List item card: Avatar/icon + title + subtitle + trailing action
- Stat card: Large number + label + trend indicator
- Profile card: Avatar + name + role + contact actions
- Pricing card: Plan name + price + features list + CTA
- Card spacing: 16-24px padding, 8-16px internal gap
- Card elevation: Subtle shadow (0 1px 3px rgba(0,0,0,0.12)) or border`,
    },
    {
      keywords: ["navigation", "nav", "menu", "sidebar"],
      content: `Navigation Patterns:
- Top nav: Logo left, links center/right. Height 56-72px
- Side nav: 240-280px width. Collapsible to 64-72px icon rail
- Bottom nav (mobile): 3-5 items, 56-64px height, icon + label
- Breadcrumbs: For deep hierarchies (3+ levels)
- Tabs: For switching between related views at the same level
- Hamburger menu: Use sparingly; hidden navigation reduces discovery
- Search: Prominent for content-heavy apps. Consider persistent search bar
- Mobile: Bottom navigation > hamburger for primary nav`,
    },
    {
      keywords: ["form", "input", "field"],
      content: `Form Design Patterns:
- Input height: 36-48px
- Label: Always visible (not just placeholder). Above or to the left
- Placeholder: Use for hints/examples, not labels
- Error messages: Below the field, in red with error icon
- Required indicator: Asterisk (*) or "required" label
- Group related fields: Use fieldsets with clear section headers
- Single column: Forms perform better in single-column layout
- Primary action: Bottom-right for LTR, full-width on mobile
- Progressive disclosure: Show fields as needed, don't overwhelm`,
    },
  ];

  // Find relevant knowledge
  const matches = knowledge.filter((k) =>
    k.keywords.some((kw) => q.includes(kw))
  );

  if (matches.length > 0) {
    return matches.map((m) => m.content).join("\n\n---\n\n");
  }

  // Generic fallback
  return `Design research for "${query}":\n\nI have built-in knowledge about iOS HIG, Material Design, WCAG accessibility, typography, color theory, spacing/layout, buttons, cards, navigation, and forms. Try asking about one of these topics specifically.\n\nFor more specific or current references, consider checking:\n- Apple HIG: developer.apple.com/design/human-interface-guidelines\n- Material Design: m3.material.io\n- Nielsen Norman Group: nngroup.com\n- Mobbin: mobbin.com (mobile UI patterns)\n- Refactoring UI: refactoringui.com (practical design tips)`;
}

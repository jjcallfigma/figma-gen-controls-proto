/**
 * AI-based Make-to-Design generator.
 * Sends the Make component code to an LLM and converts the structured
 * JSON response into CanvasObject instances ready for the canvas.
 *
 * Also provides a hybrid approach that uses deterministic DOM-to-design
 * conversion first, then optionally polishes with a targeted AI pass.
 */

import { nanoid } from "nanoid";
import {
  AutoLayoutItemSizing,
  CanvasObject,
  Fill,
  FrameProperties,
  SolidFill,
  SolidStroke,
  Stroke,
  TextProperties,
} from "@/types/canvas";
import {
  parseOperationsFromResponse,
  applyDesignOperations,
  type DesignOperation,
} from "@/core/utils/designOperations";
import { serializeDesignTree } from "@/core/utils/designSerializer";
import { useAppStore } from "@/core/state/store";
import { generateDesignFromCode, generateDesignFromLiveDocument } from "@/core/utils/domToDesign";
import { buildInspectorSrcdoc } from "@/core/utils/sameOriginPreview";

// ─── Types for the AI response ──────────────────────────────────────

interface AINode {
  id: string;
  type: "frame" | "text";
  name: string;
  parentId: string | null;
  childIds: string[];
  width: number;
  height: number;
  autoLayoutSizing?: {
    horizontal?: string;
    vertical?: string;
  };
  opacity?: number;
  fills?: Array<{
    type: string;
    color: string;
    opacity?: number;
    visible?: boolean;
  }>;
  strokes?: Array<{
    type: string;
    color: string;
    opacity?: number;
    visible?: boolean;
  }>;
  strokeWidth?: number;
  properties: any;
}

interface AIResponse {
  objects: AINode[];
}

// ─── Main API call ──────────────────────────────────────────────────

/**
 * Call the AI to convert Make code into design objects.
 *
 * @param code        The React component code
 * @param originX     World X for the top-left of the root frame
 * @param originY     World Y for the top-left of the root frame
 * @param viewportW   Viewport width (typically the Make object width)
 * @param viewportH   Viewport height (typically the Make object height)
 * @param provider    Which AI provider to use
 * @returns           Flat array of CanvasObjects, or empty on failure
 */
export async function aiGenerateDesign(
  code: string,
  originX: number,
  originY: number,
  viewportW: number,
  viewportH: number,
  provider: "openai" | "claude" = "openai",
  fast: boolean = false
): Promise<CanvasObject[]> {
  try {
    const response = await fetch("/api/make-to-design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        viewportWidth: viewportW,
        viewportHeight: viewportH,
        provider,
        fast,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Unknown error" }));
      console.error("AI design generation failed:", err);
      return [];
    }

    const data: AIResponse = await response.json();
    if (!data.objects || !Array.isArray(data.objects) || data.objects.length === 0) {
      console.error("AI returned no objects");
      return [];
    }

    return transformAIResponse(data, originX, originY);
  } catch (err) {
    console.error("AI design generation error:", err);
    return [];
  }
}

// ─── AI Assistant pipeline: Make → Design ───────────────────────────

/**
 * Convert a Make component's code into design objects using the richer
 * AI assistant pipeline (/api/design-chat).
 *
 * This streams the response, parses the operations JSON, and applies
 * them to the canvas via applyDesignOperations.
 *
 * When the Make node has a `sourceObjectId` (i.e. it was created from an
 * existing design), the original design tree is serialized and sent as
 * context so the AI can faithfully reproduce it rather than guessing from code.
 *
 * @param code            The React+Tailwind source code of the Make node
 * @param originX         World X for the top-left of the generated design
 * @param originY         World Y for the top-left of the generated design
 * @param viewportW       Width hint (typically the Make object's width)
 * @param viewportH       Height hint (typically the Make object's height)
 * @param sourceObjectId  Optional ID of the original design object that the Make was created from
 * @param provider        Which AI provider to use
 * @returns               Summary counts, or null on failure
 */
export async function generateDesignFromMake(
  code: string,
  originX: number,
  originY: number,
  viewportW: number,
  viewportH: number,
  sourceObjectId?: string,
  provider: "openai" | "claude" = "claude"
): Promise<{
  created: number;
  updated: number;
  deleted: number;
  reparented: number;
} | null> {
  try {
    // If we have a source design, serialize it as reference context
    let designTree = "";
    if (sourceObjectId) {
      const { objects } = useAppStore.getState();
      if (objects[sourceObjectId]) {
        designTree = serializeDesignTree(sourceObjectId, objects);
      }
    }

    const hasReference = !!designTree;

    // Build a tool-use-explicit prompt. The AI MUST call apply_operations
    // (not just respond with text) for the make-to-design pipeline to work.
    const toolUseInstruction = `\n\nYou MUST call the apply_operations tool with all the create operations. Do NOT respond with text only — use the tool to create the design objects on the canvas. Start with a 1-sentence plan, then immediately call apply_operations.`;

    const userMessage = {
      role: "user" as const,
      content: hasReference
        ? `Recreate this design as new design objects using the apply_operations tool. The original design tree is provided above as context.

The root frame should be ${Math.round(viewportW)}×${Math.round(viewportH)}px.

CRITICAL INSTRUCTIONS:
1. **Copy the exact structure** from the design tree: same hierarchy, auto-layout modes (horizontal/vertical), gap, padding, alignment, sizing modes (fixed/fill/hug), and layer names.
2. **Copy SVG content verbatim** from <svg> elements in the design tree — use the exact same svgContent for each vector node. Do NOT generate new SVG paths; reuse the ones from the reference tree.
3. **Use the React code below for exact values** the design tree may not capture: hex colors from Tailwind classes, text content, font sizes/weights, border radius, opacity.
4. **Recreate EVERY element** — do not simplify, skip layers, or merge elements. Each node in the design tree should have a corresponding create operation.
5. All new objects should use "create" operations with NO parentId on the root frame.
${toolUseInstruction}

\`\`\`jsx
${code}
\`\`\``
        : `Convert this React component with Tailwind CSS into design objects using the apply_operations tool.
The root frame should be ${Math.round(viewportW)}×${Math.round(viewportH)}px.

CRITICAL INSTRUCTIONS:
1. Carefully analyze every Tailwind class to extract exact values: colors (e.g. text-gray-600 → #4B5563), font sizes (text-sm → 14px), font weights, padding, gap, border-radius, etc.
2. Match every flex container to an auto-layout frame: flex-col → vertical, flex/flex-row → horizontal. Extract gap, padding, and alignment from classes.
3. Use real SVG vector nodes with proper svgContent for ALL icons — do NOT use text, emoji, or placeholder characters. Write real SVG path markup for standard icons (mail, lock, eye, user, etc.).
4. Match sizing modes: flex-1/grow → "fill", w-full in column → "fill" horizontal, auto-sized wrappers → "hug", explicit w-/h- values → "fixed".
5. Recreate EVERY visible element — do not simplify or skip any layers. Include decorative elements, dividers, and subtle details.
6. Use proper text properties: fontFamily "Inter, sans-serif", fontWeight (400/500/600/700), fontSize in px, textAlign, and fills for text color.
${toolUseInstruction}

\`\`\`jsx
${code}
\`\`\``,
    };

    const response = await fetch("/api/design-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [userMessage],
        designTree: designTree || null,
        provider,
      }),
    });

    if (!response.ok) {
      const err = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      console.error("[generateDesignFromMake] API error:", err);
      return null;
    }

    if (!response.body) {
      console.error("[generateDesignFromMake] No response body");
      return null;
    }

    // Stream and accumulate the full output.
    // Use a proper SSE buffer to handle message fragmentation across TCP chunks.
    // Large operation payloads can easily span multiple chunks.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullOutput = "";
    let sseBuffer = "";
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalDeleted = 0;
    let totalReparented = 0;
    // Persistent temp ID map across multiple apply_operations calls
    // (the AI may split work across rounds, referencing earlier temp IDs)
    let sessionTempIdMap = new Map<string, string>();
    let receivedOperations = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages (terminated by \n\n)
      let boundary: number;
      while ((boundary = sseBuffer.indexOf("\n\n")) !== -1) {
        const message = sseBuffer.slice(0, boundary);
        sseBuffer = sseBuffer.slice(boundary + 2);

        const lines = message.split("\n").filter((l) => l.trim() !== "");
        for (const line of lines) {
          if (line === "data: [DONE]") continue;
          if (!line.startsWith("data: ")) continue;

          try {
            const parsed = JSON.parse(line.slice(6));

            // Accumulate text tokens (for fallback parsing)
            if (parsed.type === "token" && parsed.content) {
              fullOutput += parsed.content;
            }

            // Apply operations immediately as they arrive
            // (mirrors how useDesignChat handles them)
            if (parsed.type === "operations" && Array.isArray(parsed.operations)) {
              const ops: DesignOperation[] = parsed.operations;
              if (ops.length > 0) {
                const result = applyDesignOperations(
                  ops,
                  originX,
                  originY,
                  sessionTempIdMap
                );
                sessionTempIdMap = result.tempIdMap;
                totalCreated += result.created;
                totalUpdated += result.updated;
                totalDeleted += result.deleted;
                totalReparented += result.reparented;
                receivedOperations = true;
              }
            }
          } catch {
            // Skip unparseable chunks
          }
        }
      }
    }

    // If no operations came via tool calls, fall back to parsing JSON from text
    if (!receivedOperations && fullOutput.length > 0) {
      const fallbackOps = parseOperationsFromResponse(fullOutput);
      if (fallbackOps.length > 0) {
        const result = applyDesignOperations(fallbackOps, originX, originY);
        totalCreated += result.created;
        totalUpdated += result.updated;
        totalDeleted += result.deleted;
        totalReparented += result.reparented;
        receivedOperations = true;
      }
    }

    if (!receivedOperations) {
      console.error(
        "[generateDesignFromMake] No operations received. Full output length:",
        fullOutput.length
      );
      return null;
    }

    return {
      created: totalCreated,
      updated: totalUpdated,
      deleted: totalDeleted,
      reparented: totalReparented,
    };
  } catch (err) {
    console.error("[generateDesignFromMake] Error:", err);
    return null;
  }
}

// ─── Hybrid pipeline: DOM-first + AI polish ─────────────────────────

/** Result from hybrid design generation */
export interface HybridDesignResult {
  /** The generated design objects */
  objects: CanvasObject[];
}

/**
 * Fast Make-to-Design conversion via deterministic DOM walking.
 *
 * Renders the code in a hidden iframe, walks the DOM tree, and
 * produces CanvasObject[] with structure, positions, colors, text,
 * borders, effects, gradients, and SVGs extracted from computed styles.
 *
 * @param code          The React+Tailwind source code
 * @param originX       World X for the top-left of the root frame
 * @param originY       World Y for the top-left of the root frame
 * @param viewportW     Width (typically the Make object's width)
 * @param viewportH     Height (typically the Make object's height)
 * @param onPhase1Done  Callback when objects are ready
 * @param provider      Unused (kept for API compatibility)
 * @returns             Result with generated objects
 */
export async function hybridGenerateDesign(
  code: string,
  originX: number,
  originY: number,
  viewportW: number,
  viewportH: number,
  onPhase1Done?: (objects: CanvasObject[]) => void,
  provider: "openai" | "claude" = "openai",
  liveDocument?: Document | null
): Promise<HybridDesignResult> {
  const start = performance.now();
  const clampSize = { width: Math.round(viewportW), height: Math.round(viewportH) };

  let objects: CanvasObject[];

  if (liveDocument) {
    // Use the live preview DOM — captures current interactive state
    objects = generateDesignFromLiveDocument(
      liveDocument,
      originX,
      originY,
      clampSize
    );
  } else {
    // Fall back to fresh iframe render (e.g. from context menu)
    objects = await generateDesignFromCode(
      code,
      originX,
      originY,
      (c) => buildInspectorSrcdoc(c),
      clampSize
    );
  }

  const elapsed = Math.round(performance.now() - start);
  console.log(
    `[hybridGenerateDesign] DOM walk: ${objects.length} objects in ${elapsed}ms (live: ${!!liveDocument})`
  );

  if (objects.length > 0 && onPhase1Done) {
    onPhase1Done(objects);
  }

  return { objects };
}

// ─── Polish detection ───────────────────────────────────────────────

interface PolishNeeds {
  needsPolish: boolean;
  reasons: string[];
  designTree: string; // Compact JSON tree for the AI
}

/**
 * Analyze Phase 1 output and build context for AI polish.
 * Always returns needsPolish: true — the AI pass reviews alignment,
 * sizing, spacing, and icons against the source code.
 */
function detectPolishNeeds(objects: CanvasObject[], code: string): PolishNeeds {
  const reasons: string[] = ["layout review"];

  // Check for missing icons
  const hasLucideImports = /from\s+["']lucide-react["']/.test(code);
  if (hasLucideImports) {
    const vectorCount = objects.filter(o => o.type === "vector").length;
    const lucideImportMatch = code.match(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/);
    if (lucideImportMatch) {
      const importedIcons = lucideImportMatch[1].split(",").map(s => s.trim()).filter(Boolean).length;
      if (vectorCount < importedIcons) {
        reasons.push(`missing icons (${vectorCount}/${importedIcons} found)`);
      }
    }
  }

  // Check for missing SVGs
  const emptySvgs = objects.filter(
    o => o.type === "vector" && (!(o.properties as any)?.svgContent || (o.properties as any).svgContent.trim().length === 0)
  );
  if (emptySvgs.length > 0) {
    reasons.push(`${emptySvgs.length} vector(s) missing SVG content`);
  }

  // Build compact design tree for AI
  const designTree = serializePhase1Tree(objects);

  return {
    needsPolish: true,
    reasons,
    designTree,
  };
}

/**
 * Build a compact JSON representation of Phase 1 objects for the AI.
 * Includes structure, auto-layout, sizing, and text properties — but
 * omits visual-only data (fills, strokes, effects) to keep it small.
 */
function serializePhase1Tree(objects: CanvasObject[]): string {
  const nodes = objects.map(obj => {
    const node: Record<string, any> = {
      id: obj.id,
      type: obj.type,
      name: obj.name,
      w: obj.width,
      h: obj.height,
    };

    if (obj.parentId) node.parentId = obj.parentId;
    if (obj.childIds.length > 0) node.childIds = obj.childIds;
    if (obj.autoLayoutSizing) node.sizing = obj.autoLayoutSizing;

    if (obj.type === "frame") {
      const props = obj.properties as FrameProperties;
      if (props.autoLayout && props.autoLayout.mode !== "none") {
        node.autoLayout = {
          mode: props.autoLayout.mode,
          align: props.autoLayout.alignItems,
          justify: props.autoLayout.justifyContent,
          gap: props.autoLayout.gap,
          pad: props.autoLayout.padding,
        };
      }
    }

    if (obj.type === "text") {
      const props = obj.properties as TextProperties;
      node.text = (props.content || "").slice(0, 50); // Truncate long text
      if (props.textAlign && props.textAlign !== "left") node.textAlign = props.textAlign;
      if (props.fontSize) node.fontSize = props.fontSize;
    }

    if (obj.type === "vector") {
      node.hasSvg = !!(obj.properties as any).svgContent;
    }

    return node;
  });

  return JSON.stringify(nodes);
}

// ─── AI polish result ───────────────────────────────────────────────

export interface Phase2Changes {
  /** Property updates to apply to existing Phase 1 objects */
  updates: Array<{ id: string; changes: Record<string, any> }>;
  /** New objects to add (e.g. missing icons) */
  additions: CanvasObject[];
}

// ─── AI polish pass ─────────────────────────────────────────────────

/**
 * Run a targeted AI polish pass that reviews the entire design tree.
 * Sends the compact tree + source code to the AI, which returns
 * targeted corrections for alignment, sizing, spacing, and icons.
 */
async function aiPolishDesign(
  objects: CanvasObject[],
  code: string,
  polishNeeds: PolishNeeds,
  originX: number,
  originY: number,
  viewportW: number,
  viewportH: number,
  provider: "openai" | "claude"
): Promise<{ objects: CanvasObject[]; phase2Changes: Phase2Changes }> {
  const emptyResult = { objects, phase2Changes: { updates: [], additions: [] } };

  try {
    const response = await fetch("/api/make-to-design-polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        designTree: polishNeeds.designTree,
        viewportWidth: viewportW,
        viewportHeight: viewportH,
        provider,
      }),
    });

    if (!response.ok) {
      console.error("[aiPolishDesign] API error:", response.status);
      return emptyResult;
    }

    const data = await response.json();
    const updates: Phase2Changes["updates"] = [];
    const additions: CanvasObject[] = [];

    // ── Build updates for existing objects (READ-ONLY — no mutation) ──
    // The Phase 1 objects are already in the Immer/Zustand store and
    // frozen.  We must NOT mutate them.  Instead, build change records
    // that the UI dispatcher will apply through the store properly.
    if (data.updates && Array.isArray(data.updates)) {
      const objectMap = new Map(objects.map(o => [o.id, o]));

      for (const update of data.updates) {
        const obj = objectMap.get(update.id);
        if (!obj) continue;

        const changes: Record<string, any> = {};

        // Auto-layout property changes (alignItems, justifyContent, gap)
        if (obj.type === "frame") {
          const props = obj.properties as FrameProperties;
          if (props.autoLayout && (update.alignItems || update.justifyContent || update.gap !== undefined)) {
            // Deep-clone autoLayout so we don't mutate frozen state
            const newAutoLayout = {
              ...props.autoLayout,
              padding: props.autoLayout.padding ? { ...props.autoLayout.padding } : undefined,
            };
            if (update.alignItems) newAutoLayout.alignItems = update.alignItems;
            if (update.justifyContent) newAutoLayout.justifyContent = update.justifyContent;
            if (update.gap !== undefined) newAutoLayout.gap = update.gap;

            changes.properties = {
              ...props,
              autoLayout: newAutoLayout,
            };
          }
        }

        // Auto-layout sizing changes
        if (update.autoLayoutSizing) {
          const newSizing = { ...(obj.autoLayoutSizing || { horizontal: "fixed", vertical: "fixed" }) };
          if (update.autoLayoutSizing.horizontal) newSizing.horizontal = update.autoLayoutSizing.horizontal;
          if (update.autoLayoutSizing.vertical) newSizing.vertical = update.autoLayoutSizing.vertical;
          changes.autoLayoutSizing = newSizing;
        }

        // Dimension changes
        if (update.width !== undefined) changes.width = update.width;
        if (update.height !== undefined) changes.height = update.height;

        // SVG content update
        if (update.svgContent && obj.type === "vector") {
          changes.properties = { ...obj.properties, svgContent: update.svgContent };
        }

        // Name update
        if (update.name) changes.name = update.name;

        if (Object.keys(changes).length > 0) {
          updates.push({ id: obj.id, changes });
        }
      }
    }

    // ── Create new objects (e.g. missing icons) ─────────────────────
    // New objects are fresh and not in the store, so we can build them
    // freely.  The UI will dispatch objects.pasted to add them.
    if (data.newObjects && Array.isArray(data.newObjects)) {
      const now = Date.now();

      for (const newObj of data.newObjects) {
        if (!newObj.parentId || !newObj.type) continue;

        const id = nanoid();

        if (newObj.type === "vector") {
          const vectorObj: CanvasObject = {
            id,
            type: "vector",
            name: newObj.name || "Icon",
            createdAt: now,
            x: 0,
            y: 0,
            width: newObj.width || 24,
            height: newObj.height || 24,
            rotation: 0,
            autoLayoutSizing: newObj.autoLayoutSizing || { horizontal: "fixed", vertical: "fixed" },
            fills: [],
            strokes: [],
            opacity: 1,
            parentId: newObj.parentId,
            childIds: [],
            zIndex: 0,
            visible: true,
            locked: false,
            properties: {
              type: "vector",
              svgContent: newObj.svgContent || "",
            },
          } as CanvasObject;

          additions.push(vectorObj);
          // Note: objects.pasted reducer handles wiring parentId → parent.childIds
          // so we don't need to update the parent here
        }
      }
    }

    console.log(
      `[aiPolishDesign] Applied ${updates.length} updates, ${additions.length} new objects`
    );

    return { objects, phase2Changes: { updates, additions } };
  } catch (err) {
    console.error("[aiPolishDesign] Error:", err);
    return emptyResult;
  }
}

// ─── Transform AI response → CanvasObject[] ────────────────────────

function transformAIResponse(
  data: AIResponse,
  originX: number,
  originY: number
): CanvasObject[] {
  const aiNodes = data.objects;
  const now = Date.now();

  // Build a map of AI id → real nanoid
  const idMap = new Map<string, string>();
  for (const node of aiNodes) {
    idMap.set(node.id, nanoid());
  }

  const canvasObjects: CanvasObject[] = [];

  for (let i = 0; i < aiNodes.length; i++) {
    const node = aiNodes[i];
    const realId = idMap.get(node.id)!;
    const realParentId = node.parentId ? idMap.get(node.parentId) : undefined;

    // Map childIds
    const realChildIds = (node.childIds || [])
      .map((cid) => idMap.get(cid))
      .filter(Boolean) as string[];

    // Determine position — root at origin, children at 0,0
    // (auto layout will handle positioning)
    const isRoot = i === 0 || !node.parentId;

    // Build fills
    const fills = buildFills(node.fills);

    // Build strokes
    const strokes = buildStrokes(node.strokes);

    // Auto layout sizing
    const autoLayoutSizing = {
      horizontal: (node.autoLayoutSizing?.horizontal || "fixed") as AutoLayoutItemSizing,
      vertical: (node.autoLayoutSizing?.vertical || "fixed") as AutoLayoutItemSizing,
    };

    const baseObj: Partial<CanvasObject> = {
      id: realId,
      name: node.name || `node-${i}`,
      createdAt: now + i,
      x: isRoot ? originX : 0,
      y: isRoot ? originY : 0,
      width: Math.round(node.width || 100),
      height: Math.round(node.height || 40),
      rotation: 0,
      autoLayoutSizing,
      fills,
      strokes,
      strokeWidth: node.strokeWidth || undefined,
      opacity: node.opacity ?? 1,
      parentId: realParentId,
      childIds: realChildIds,
      zIndex: i,
      visible: true,
      locked: false,
    };

    if (node.type === "text") {
      const props = node.properties || {};
      const content = props.content || "";
      const fontSize = props.fontSize || 14;
      const fontWeight = props.fontWeight || 400;
      const fontFamily = props.fontFamily || "Inter, sans-serif";

      // Extract text color from fills (falls back to black)
      const textColor = extractTextColor(node.fills);

      // Build Slate content with color marks so TextRenderer picks up the color
      const slateContent = buildSlateContent(content, textColor, fontSize, fontWeight, fontFamily);

      const textObj: CanvasObject = {
        ...baseObj,
        type: "text",
        fills: undefined, // Text objects don't use fills — color comes from Slate content
        properties: {
          type: "text",
          content,
          fontSize,
          fontFamily,
          fontWeight,
          textAlign: props.textAlign || "left",
          lineHeight: props.lineHeight || { value: Math.round(fontSize * 1.43), unit: "px" },
          letterSpacing: props.letterSpacing || { value: 0, unit: "px" },
          resizeMode: "auto-width",
          slateContent: JSON.stringify(slateContent),
        } as TextProperties,
      } as CanvasObject;
      canvasObjects.push(textObj);
    } else {
      // Frame
      const props = node.properties || {};
      const autoLayout = props.autoLayout || undefined;

      const frameProps: FrameProperties = {
        type: "frame",
        borderRadius: props.borderRadius ?? 0,
        overflow: props.overflow || "visible",
        autoLayout: autoLayout
          ? {
              mode: autoLayout.mode || "none",
              gap: autoLayout.gap || 0,
              padding: autoLayout.padding || { top: 0, right: 0, bottom: 0, left: 0 },
              alignItems: autoLayout.alignItems || "start",
              justifyContent: autoLayout.justifyContent || "start",
              wrap: autoLayout.wrap || false,
            }
          : { mode: "none" },
      };

      const frameObj: CanvasObject = {
        ...baseObj,
        type: "frame",
        properties: frameProps,
      } as CanvasObject;
      canvasObjects.push(frameObj);
    }
  }

  return canvasObjects;
}

// ─── Helpers ────────────────────────────────────────────────────────

function buildFills(
  aiFills?: Array<{ type: string; color: string; opacity?: number; visible?: boolean }>
): Fill[] {
  if (!aiFills || aiFills.length === 0) return [];

  return aiFills
    .filter((f) => f.visible !== false && f.color)
    .map((f) => ({
      id: nanoid(),
      type: "solid" as const,
      visible: true,
      opacity: f.opacity ?? 1,
      color: normalizeColor(f.color),
    })) as SolidFill[];
}

function buildStrokes(
  aiStrokes?: Array<{ type: string; color: string; opacity?: number; visible?: boolean }>
): Stroke[] {
  if (!aiStrokes || aiStrokes.length === 0) return [];

  return aiStrokes
    .filter((s) => s.visible !== false && s.color)
    .map((s) => ({
      id: nanoid(),
      type: "solid" as const,
      visible: true,
      opacity: s.opacity ?? 1,
      color: normalizeColor(s.color),
    })) as SolidStroke[];
}

function normalizeColor(color: string): string {
  if (!color) return "#000000";
  // Ensure it starts with #
  if (!color.startsWith("#")) return `#${color}`;
  return color.toUpperCase();
}

/**
 * Extract the text color from the fills array.
 * Returns the hex color string, defaulting to "#000000" (black).
 */
function extractTextColor(
  fills?: Array<{ type: string; color: string; opacity?: number; visible?: boolean }>
): string | undefined {
  if (!fills || fills.length === 0) return undefined;
  const solidFill = fills.find((f) => f.type === "solid" && f.visible !== false && f.color);
  if (!solidFill) return undefined;
  const color = normalizeColor(solidFill.color);
  // Don't bother setting color if it's black (the default)
  if (color === "#000000") return undefined;
  return color;
}

/**
 * Build Slate content (Descendant[]) with color/fontWeight/fontSize marks
 * so that the TextRenderer renders the correct text color.
 */
function buildSlateContent(
  content: string,
  color: string | undefined,
  fontSize: number,
  fontWeight: number,
  fontFamily: string
): Array<{ type: string; children: Array<Record<string, any>> }> {
  const lines = content.split("\n");
  return lines.map((line) => {
    const leaf: Record<string, any> = { text: line };
    if (color) leaf.color = color;
    // Only set non-default marks
    if (fontWeight && fontWeight !== 400) leaf.fontWeight = fontWeight;
    if (fontFamily && fontFamily !== "Inter" && fontFamily !== "Inter, sans-serif") leaf.fontFamily = fontFamily;
    return {
      type: "paragraph",
      children: [leaf],
    };
  });
}

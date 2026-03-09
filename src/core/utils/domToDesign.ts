/**
 * Convert a rendered DOM tree (from a Make iframe) into static canvas objects.
 * This is the inverse of designSerializer.ts — it reads computed styles from
 * the browser and produces CanvasObject instances.
 */

import { nanoid } from "nanoid";
import {
  AutoLayoutItemSizing,
  AutoLayoutProperties,
  CanvasObject,
  DropShadowEffect,
  Effect,
  Fill,
  FrameProperties,
  GradientStop,
  InnerShadowEffect,
  LinearGradientFill,
  RadialGradientFill,
  SolidFill,
  SolidStroke,
  Stroke,
  TextProperties,
  VectorProperties,
  getDefaultAutoLayoutSizing,
} from "@/types/canvas";

// ─── Helpers ────────────────────────────────────────────────────────

/** Round to 2 decimal places — preserves sub-pixel precision from the DOM */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Constants ──────────────────────────────────────────────────────

/** Tags to completely skip during traversal */
const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "LINK",
  "META",
  "NOSCRIPT",
  "TEMPLATE",
  "BR",
  "HR",
]);

/** Tags that are inherently text containers */
const TEXT_TAGS = new Set([
  "SPAN",
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "A",
  "LABEL",
  "STRONG",
  "EM",
  "B",
  "I",
  "U",
  "SMALL",
  "CODE",
  "PRE",
  "BLOCKQUOTE",
  "LI",
  "TD",
  "TH",
  "CAPTION",
  "FIGCAPTION",
  "BUTTON",
]);

/** Inline text wrappers — used to detect <p>Hello <strong>world</strong></p> */
const INLINE_TEXT_TAGS = new Set([
  "STRONG",
  "EM",
  "B",
  "I",
  "U",
  "SMALL",
  "CODE",
  "SPAN",
  "A",
]);

// ─── Main entry point ───────────────────────────────────────────────

/**
 * Walk a rendered DOM tree and produce a flat array of CanvasObject items.
 *
 * @param iframeDoc  The iframe's Document (same-origin)
 * @param rootEl     The root element to start walking from
 * @param originX    World X for the top-left of the generated root frame
 * @param originY    World Y for the top-left of the generated root frame
 * @param clampSize  Optional {width, height} to clamp the root frame size
 *                   (avoids min-h-screen blowing up the root to viewport height)
 * @returns          Flat array of CanvasObjects (root first, then descendants).
 *                   Parent/child IDs are properly wired.
 */
/** Flex metadata collected during DOM walk, keyed by object ID */
export interface FlexMeta {
  flexGrow: number;
  flexShrink: number;
  flexBasis: string;
  alignSelf: string;
  naturalTextWidth?: number;
  whiteSpace?: string;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
}

export function domToDesign(
  iframeDoc: Document,
  rootEl: Element,
  originX: number,
  originY: number,
  clampSize?: { width: number; height: number }
): CanvasObject[] {
  const win = iframeDoc.defaultView;
  if (!win) return [];

  const allObjects: CanvasObject[] = [];
  const flexMetaMap = new Map<string, FlexMeta>();
  const rootRect = rootEl.getBoundingClientRect();
  const now = Date.now();

  walkElement(rootEl, win, rootRect, null, null, originX, originY, allObjects, flexMetaMap, now, 0);

  // Clamp root frame to the provided size (e.g. Match the Make object dimensions)
  if (clampSize && allObjects.length > 0) {
    const root = allObjects[0];
    root.width = clampSize.width;
    root.height = clampSize.height;
  }

  return allObjects;
}

/**
 * Get the flex metadata map from the last domToDesign call.
 * This is used by refineAutoLayoutSizing for better sizing detection.
 */
let _lastFlexMetaMap: Map<string, FlexMeta> = new Map();

export function domToDesignWithMeta(
  iframeDoc: Document,
  rootEl: Element,
  originX: number,
  originY: number,
  clampSize?: { width: number; height: number }
): { objects: CanvasObject[]; flexMetaMap: Map<string, FlexMeta> } {
  const win = iframeDoc.defaultView;
  if (!win) return { objects: [], flexMetaMap: new Map() };

  const allObjects: CanvasObject[] = [];
  const flexMetaMap = new Map<string, FlexMeta>();
  const rootRect = rootEl.getBoundingClientRect();
  const now = Date.now();

  walkElement(rootEl, win, rootRect, null, null, originX, originY, allObjects, flexMetaMap, now, 0);

  if (clampSize && allObjects.length > 0) {
    const root = allObjects[0];
    root.width = clampSize.width;
    root.height = clampSize.height;
  }

  _lastFlexMetaMap = flexMetaMap;
  return { objects: allObjects, flexMetaMap };
}

// ─── Recursive walker ───────────────────────────────────────────────

function walkElement(
  el: Element,
  win: Window,
  rootRect: DOMRect,
  parentRect: DOMRect | null,
  parentId: string | null,
  originX: number,
  originY: number,
  allObjects: CanvasObject[],
  flexMetaMap: Map<string, FlexMeta>,
  now: number,
  depth: number
): string | null {
  if (SKIP_TAGS.has(el.tagName)) return null;

  const cs = win.getComputedStyle(el);

  // Skip invisible elements
  if (cs.display === "none" || cs.visibility === "hidden") return null;

  // Skip absolutely-positioned / fixed elements unless they are:
  // - top-level containers (depth ≤ 1, e.g. React portals on <body>)
  // - large overlays (modals, dialogs, drawers)
  // - SVGs / images (icons that should be preserved)
  // - small elements with visible text (labels, badges)
  // Abs-positioned elements that DO pass through are handled later:
  // they get `absolutePositioned = true` and explicit x/y coordinates.
  if (
    parentId !== null &&
    depth > 1 &&
    (cs.position === "absolute" || cs.position === "fixed")
  ) {
    const elRect = el.getBoundingClientRect();
    const isLargeOverlay = rootRect.width > 0 && rootRect.height > 0 &&
                           elRect.width > rootRect.width * 0.3 &&
                           elRect.height > rootRect.height * 0.3;
    const isSvgEl = el.tagName === "svg" || el.tagName === "SVG" ||
                    el.querySelector?.("svg") !== null;
    const isImgEl = el.tagName === "IMG";
    const hasText = !!(el.textContent?.trim());
    const isSmallVisual = elRect.width > 0 && elRect.height > 0 &&
                          elRect.width <= 200 && elRect.height <= 200 &&
                          (isSvgEl || isImgEl || hasText);
    if (!isLargeOverlay && !isSmallVisual) {
      return null;
    }
  }

  const rect = el.getBoundingClientRect();

  // Skip zero-size elements (unless they have overflow visible children)
  if (rect.width < 1 && rect.height < 1) return null;

  // Determine if this is an image element
  const isImg = el.tagName === "IMG";

  // Determine if this is an SVG
  const isSvg = el.tagName === "svg" || el.tagName === "SVG" || el.closest?.("svg") === el;

  const id = nanoid();
  const name = getElementName(el, depth);

  // Position: root gets world coordinates, children get (0, 0).
  // Auto-layout handles the actual positioning of children.
  // parentRect is kept for computing layout hints (gap, centering).
  const isRoot = parentId === null;
  const x = isRoot ? originX : 0;
  const y = isRoot ? originY : 0;
  const width = round2(rect.width);
  const height = round2(rect.height);

  // Collect flex metadata for this element (used by refineAutoLayoutSizing)
  const mTop = cs.marginTop !== "auto" ? parseFloat(cs.marginTop) || 0 : 0;
  const mRight = cs.marginRight !== "auto" ? parseFloat(cs.marginRight) || 0 : 0;
  const mBottom = cs.marginBottom !== "auto" ? parseFloat(cs.marginBottom) || 0 : 0;
  const mLeft = cs.marginLeft !== "auto" ? parseFloat(cs.marginLeft) || 0 : 0;
  const hasMargin = Math.abs(mTop) + Math.abs(mRight) + Math.abs(mBottom) + Math.abs(mLeft) > 2;
  flexMetaMap.set(id, {
    flexGrow: parseFloat(cs.flexGrow) || 0,
    flexShrink: parseFloat(cs.flexShrink) || 1,
    flexBasis: cs.flexBasis || "auto",
    alignSelf: cs.alignSelf || "auto",
    ...(hasMargin && {
      marginTop: round2(mTop),
      marginRight: round2(mRight),
      marginBottom: round2(mBottom),
      marginLeft: round2(mLeft),
    }),
  });

  if (isSvg) {
    // Extract real SVG content as a vector node
    const vectorObj = createVectorObject(
      id, name, el, cs, x, y, width, height, now, parentId, depth
    );
    allObjects.push(vectorObj);
    return id;
  }

  if (isImg) {
    // Images become rectangles with image fills
    const imgObj = createImageObject(
      id, name, el as HTMLImageElement, cs, x, y, width, height, now, parentId, depth
    );
    allObjects.push(imgObj);
    return id;
  }

  // ── Form inputs (input, textarea, select) ─────────────────────────
  // These are void / self-closing elements whose value/placeholder is
  // NOT accessible via el.textContent.  We extract the visible text and
  // create a frame (for visual styling) with a text child inside.
  const isFormInput =
    el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";

  if (isFormInput) {
    const inputEl = el as HTMLInputElement;
    let inputText = "";
    if (el.tagName === "SELECT") {
      const selectEl = el as HTMLSelectElement;
      const selectedOption = selectEl.selectedOptions?.[0] || selectEl.options?.[selectEl.selectedIndex];
      inputText = selectedOption?.textContent?.trim() || selectEl.value || "";
    } else {
      inputText = inputEl.value || inputEl.placeholder || inputEl.getAttribute("placeholder") || "";
      // Date/time inputs show browser-rendered format text but don't expose
      // it via value or placeholder. Use the type-specific default format.
      if (!inputText && inputEl.type) {
        const formatMap: Record<string, string> = {
          date: "mm/dd/yyyy",
          time: "hh:mm",
          "datetime-local": "mm/dd/yyyy hh:mm",
          month: "yyyy-mm",
          week: "yyyy-Www",
        };
        inputText = formatMap[inputEl.type] || "";
      }
    }

    // Create the visual frame (border, background, border-radius, etc.)
    const frameObj = createFrameObject(
      id, name, el, cs, x, y, width, height, now, parentId, depth
    );

    // Override auto layout for simple input frames: horizontally lay out
    // text with vertical centering — same as the input-wrapper merge path.
    const inputFrameProps = frameObj.properties as FrameProperties;
    if (inputFrameProps.autoLayout && inputFrameProps.autoLayout.mode !== "none") {
      inputFrameProps.autoLayout.mode = "horizontal";
      inputFrameProps.autoLayout.alignItems = "center";
      inputFrameProps.autoLayout.justifyContent = "start";
    }

    allObjects.push(frameObj);

    if (inputText) {
      const textId = nanoid();
      const fontSize = parseFloat(cs.fontSize) || 14;
      const fontWeight = parseFontWeight(cs.fontWeight);
      const fontFamily = parseFontFamily(cs.fontFamily);
      const letterSpacing = parseLetterSpacing(cs);
      const hexColor = rgbToHex(cs.color || "#000000");
      const lineHeight = parseLineHeight(cs, fontSize);
      const textAlign = parseTextAlign(cs.textAlign);

      const slateContent = buildSlateContentFromDOM(
        inputText, hexColor, fontSize, fontWeight, fontFamily, letterSpacing
      );

      const textObj: CanvasObject = {
        id: textId,
        type: "text",
        name: `${name}-text`,
        createdAt: now + depth + 1,
        x: 0,
        y: 0,
        width,
        height: round2(lineHeight.value || fontSize * 1.4),
        rotation: 0,
        autoLayoutSizing: { horizontal: "fill", vertical: "hug" },
        fills: [],
        strokes: [],
        opacity: (!inputEl.value && inputEl.placeholder) ? 0.5 : 1,
        parentId: id,
        childIds: [],
        zIndex: depth + 1,
        visible: true,
        locked: false,
        properties: {
          type: "text",
          content: inputText,
          fontSize,
          fontFamily,
          fontWeight,
          textAlign,
          lineHeight,
          letterSpacing: { value: letterSpacing, unit: "px" as const },
          resizeMode: "auto-height",
          slateContent: JSON.stringify(slateContent),
        } as TextProperties,
      };

      allObjects.push(textObj);
      frameObj.childIds = [textId];
    }

    return id;
  }

  // Check if this element is a pure text leaf — an element whose ONLY content
  // is text (no child elements at all, or only inline text wrappers like <strong>).
  // Pure text leaves are elements like <span>, <p>, <h1> etc. that are
  // inherently text containers.
  const isPureTextLeaf = isPureTextElement(el);

  if (isPureTextLeaf) {
    // Attach text-specific wrapping signals to the existing FlexMeta entry
    const existingMeta = flexMetaMap.get(id);
    if (existingMeta) {
      existingMeta.naturalTextWidth = measureNaturalTextWidth(el);
      existingMeta.whiteSpace = cs.whiteSpace;
    }
    // For inherent text tags (span, p, h1, etc.) with no visual container
    // styling, emit just a text object.
    const hasVisualContainer = hasContainerStyling(cs);

    if (!hasVisualContainer) {
      // Only expand width for text that appears single-line in the DOM.
      // Multi-line text (paragraphs) should keep their container width.
      const fontSize0 = parseFloat(cs.fontSize) || 14;
      const lh0 = parseLineHeight(cs, fontSize0).value || fontSize0 * 1.4;
      const isSingleLine = height < lh0 * 1.6;
      let textW = width;
      if (isSingleLine) {
        const naturalW = measureNaturalTextWidth(el);
        if (naturalW > width) textW = naturalW + 1;
      }
      // Strip source element padding from height — canvas text objects have no
      // padding, so the height should reflect content only (line-height × lines).
      const padTop0 = parseFloat(cs.paddingTop) || 0;
      const padBot0 = parseFloat(cs.paddingBottom) || 0;
      const textHeight = isSingleLine
        ? round2(lh0)
        : Math.max(round2(lh0), round2(height - padTop0 - padBot0));
      const textObj = createTextObject(
        id, name, el, cs, x, y, textW, textHeight, now, parentId, depth
      );
      allObjects.push(textObj);
      return id;
    }

    // Has visual styling (background, border, etc.) — create a frame with
    // a text child inside it (common for buttons, badges, links with bg, etc.)
    // Only expand for single-line text; multi-line text should keep wrapping.
    const fontSize1 = parseFloat(cs.fontSize) || 14;
    const lh1 = parseLineHeight(cs, fontSize1).value || fontSize1 * 1.4;
    // Use natural text width to detect wrapping — container height is unreliable
    // for elements like badges/circles that are taller than their text content.
    const naturalTextW1 = measureNaturalTextWidth(el);
    const contentW1 = width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    const isSingleLine1 = naturalTextW1 > 0
      ? naturalTextW1 <= contentW1 * 1.1
      : height < lh1 * 1.6;
    let frameW = width;
    if (isSingleLine1) {
      const naturalTextW = measureNaturalTextWidth(el);
      const padH = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const minFrameW = Math.ceil(naturalTextW + padH) + 1;
      if (minFrameW > width) frameW = minFrameW;
    }
    const frameObj = createFrameObject(
      id, name, el, cs, x, y, frameW, height, now, parentId, depth
    );

    // Detect vertical/horizontal centering from rendered text position.
    // Buttons and badges often center text via browser defaults or flex
    // that may not be fully reflected in getComputedStyle.
    const frameAL = (frameObj.properties as FrameProperties).autoLayout;
    if (frameAL && frameAL.mode !== "none") {
      const padTop = frameAL.padding?.top || 0;
      const padBottom = frameAL.padding?.bottom || 0;
      const padLeft = frameAL.padding?.left || 0;
      const padRight = frameAL.padding?.right || 0;
      const innerH = height - padTop - padBottom;
      const innerW = width - padLeft - padRight;
      const fontSize = parseFloat(cs.fontSize) || 14;
      const lh = parseLineHeight(cs, fontSize);
      const textH = lh.value || fontSize * 1.4;

      // Vertical centering: text is significantly shorter than the inner
      // frame and roughly centered (top/bottom gaps are similar)
      if (textH < innerH - 2) {
        const topGap = (innerH - textH) / 2;
        const bottomGap = innerH - textH - topGap;
        if (Math.abs(topGap - bottomGap) < 4) {
          if (frameAL.mode === "vertical") {
            frameAL.justifyContent = "center";
          } else {
            frameAL.alignItems = "center";
          }
        }
      }

      // Horizontal centering: check text-align or if content is narrower
      // and centered within the frame
      const ta = cs.textAlign;
      if (ta === "center" || ta === "-webkit-center") {
        if (frameAL.mode === "horizontal") {
          frameAL.justifyContent = "center";
        } else {
          frameAL.alignItems = "center";
        }
      } else {
        // Measure rendered text width to detect centering
        const range = el.ownerDocument.createRange();
        range.selectNodeContents(el);
        const textRect = range.getBoundingClientRect();
        if (textRect.width > 0 && textRect.width < innerW - 4) {
          const leftGap = textRect.left - rect.left - padLeft;
          const rightGap = rect.right - padRight - textRect.right;
          if (Math.abs(leftGap - rightGap) < 4) {
            if (frameAL.mode === "horizontal") {
              frameAL.justifyContent = "center";
            } else {
              frameAL.alignItems = "center";
            }
          }
        }
      }
    }

    allObjects.push(frameObj);

    const textId = nanoid();
    const textFS = parseFloat(cs.fontSize) || 14;
    const textLineHeight = parseLineHeight(cs, textFS);
    const textLH = textLineHeight.value || textFS * 1.4;
    const framePadV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const textHeight = isSingleLine1
      ? round2(textLH)
      : Math.max(round2(textLH), height - round2(framePadV));
    const textObj = createTextObject(
      textId, `${name}-text`, el, cs, 0, 0, frameObj.width, textHeight, now, id, depth + 1
    );
    // Single-line text in buttons/badges: hug so it never wraps.
    // Multi-line: fill so it wraps within the parent.
    if (isSingleLine1) {
      textObj.autoLayoutSizing = { horizontal: "hug", vertical: "hug" };
    } else {
      textObj.autoLayoutSizing = { horizontal: "fill", vertical: "hug" };
      (textObj.properties as TextProperties).resizeMode = "auto-height";
    }
    // Center text-align for buttons/badges when the frame centers content
    if (frameAL && (frameAL.justifyContent === "center" ||
        (frameAL.mode === "vertical" && frameAL.alignItems === "center"))) {
      (textObj.properties as TextProperties).textAlign = "center";
    }
    allObjects.push(textObj);
    frameObj.childIds = [textId];
    return id;
  }

  // It's a container element — create as a frame
  const frameObj = createFrameObject(
    id, name, el, cs, x, y, width, height, now, parentId, depth
  );

  // Push parent FIRST so it exists in the array before its children
  // (the reducer's objects.pasted handler wires parent.childIds in order)
  allObjects.push(frameObj);

  // Walk children AND collect direct text content
  const childIds: string[] = [];
  const childElements = getVisibleChildElements(el);

  // ── Refine auto-layout from DOM child positions ────────────────────
  // Use actual rendered positions to improve gap and alignment accuracy.
  // This works for BOTH flex/grid AND block containers.
  const frameAutoLayout = (frameObj.properties as FrameProperties).autoLayout;
  if (frameAutoLayout && frameAutoLayout.mode !== "none" && childElements.length >= 1) {
    const flowChildren = childElements.filter((c) => {
      const ccs = win.getComputedStyle(c);
      if (ccs.display === "none" || ccs.visibility === "hidden") return false;
      if (ccs.position === "absolute" || ccs.position === "fixed") return false;
      return true;
    });
    const childRects = flowChildren.map((c) => c.getBoundingClientRect());

    if (childRects.length >= 1) {
      const isVertical = frameAutoLayout.mode === "vertical";

      // ── Gap: average spacing between consecutive children ─────────
      let totalGap = 0;
      let gapCount = 0;
      for (let i = 1; i < childRects.length; i++) {
        const spacing = isVertical
          ? childRects[i].top - childRects[i - 1].bottom
          : childRects[i].left - childRects[i - 1].right;
        if (spacing >= 0) {
          totalGap += spacing;
          gapCount++;
        }
      }
      if (gapCount > 0) {
        frameAutoLayout.gap = round2(totalGap / gapCount);
      }

      const padL = frameAutoLayout.padding?.left || 0;
      const padR = frameAutoLayout.padding?.right || 0;
      const padT = frameAutoLayout.padding?.top || 0;
      const padB = frameAutoLayout.padding?.bottom || 0;
      const contentW = rect.width - padL - padR;
      const contentH = rect.height - padT - padB;
      const parentCenterX = rect.x + padL + contentW / 2;
      const parentCenterY = rect.y + padT + contentH / 2;

      // ── Cross-axis centering from child positions ──────────────────
      let crossCenteredCount = 0;
      let crossFullCount = 0;
      for (const cr of childRects) {
        if (isVertical) {
          const childCenterX = cr.x + cr.width / 2;
          if (Math.abs(childCenterX - parentCenterX) < 4) crossCenteredCount++;
          if (contentW > 0 && cr.width / contentW > 0.9) crossFullCount++;
        } else {
          const childCenterY = cr.y + cr.height / 2;
          if (Math.abs(childCenterY - parentCenterY) < 4) crossCenteredCount++;
          if (contentH > 0 && cr.height / contentH > 0.9) crossFullCount++;
        }
      }

      if (crossCenteredCount > childRects.length * 0.5 && crossFullCount < childRects.length * 0.5) {
        frameAutoLayout.alignItems = "center";
      }

      // ── margin:auto centering on children (block containers) ───────
      if (isVertical && frameAutoLayout.alignItems !== "center") {
        let marginAutoCnt = 0;
        for (const child of flowChildren) {
          const ccs = win.getComputedStyle(child);
          if (ccs.marginLeft === "auto" && ccs.marginRight === "auto") marginAutoCnt++;
        }
        if (marginAutoCnt > flowChildren.length * 0.5) {
          frameAutoLayout.alignItems = "center";
        }
      }

      // ── Main-axis centering (justifyContent) from child group ──────
      const groupMinMain = Math.min(...childRects.map((cr) => isVertical ? cr.top : cr.left));
      const groupMaxMain = Math.max(...childRects.map((cr) => isVertical ? cr.bottom : cr.right));
      const groupSize = groupMaxMain - groupMinMain;
      const mainContentSize = isVertical ? contentH : contentW;

      if (groupSize > 0 && groupSize < mainContentSize - 4) {
        const mainStart = isVertical ? rect.y + padT : rect.x + padL;
        const leadingGap = groupMinMain - mainStart;
        const trailingGap = (mainStart + mainContentSize) - groupMaxMain;
        if (Math.abs(leadingGap - trailingGap) < 4) {
          frameAutoLayout.justifyContent = "center";
        }
      }
    }
  }

  // Check if this element has meaningful direct text content
  // (text nodes that are siblings of child elements, e.g. <div>Hello <span>world</span></div>)
  const directText = getDirectTextContent(el);

  if (childElements.length === 0 && directText.length > 0) {
    // Only text, no child elements — expand frame for single-line text only.
    const innerFontSize = parseFloat(cs.fontSize) || 14;
    const innerLH = parseLineHeight(cs, innerFontSize);
    const innerLineH = innerLH.value || innerFontSize * 1.4;
    // Use natural text width to detect wrapping — container height is unreliable
    // for elements like badges/circles that are taller than their text content.
    const innerNaturalW0 = measureNaturalTextWidth(el);
    const innerPadH0 = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const innerContentW0 = frameObj.width - innerPadH0;
    const isSingleLineInner = innerNaturalW0 > 0
      ? innerNaturalW0 <= innerContentW0 * 1.1
      : height < innerLineH * 1.6;
    if (isSingleLineInner) {
      const innerMinW = Math.ceil(innerNaturalW0 + innerPadH0) + 1;
      if (innerMinW > frameObj.width) {
        frameObj.width = innerMinW;
      }
    }

    const textId = nanoid();
    const innerPadV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    // Single-line text: use line-height as height — the parent frame's auto
    // layout handles centering within the (potentially taller) container.
    // Multi-line text: fill the container height minus padding.
    const innerTextHeight = isSingleLineInner
      ? round2(innerLineH)
      : Math.max(round2(innerLineH), height - round2(innerPadV));
    const textObj = createTextObject(
      textId, `${name}-text`, el, cs, 0, 0, frameObj.width, innerTextHeight, now, id, depth + 1
    );
    // Single-line text: use hug/auto-width so it NEVER wraps even if the
    // parent frame ends up narrower in the canvas auto-layout engine.
    // Multi-line text: use fill/auto-height so it wraps within the parent.
    if (isSingleLineInner) {
      textObj.autoLayoutSizing = { horizontal: "hug", vertical: "hug" };
    } else {
      textObj.autoLayoutSizing = { horizontal: "fill", vertical: "hug" };
      (textObj.properties as TextProperties).resizeMode = "auto-height";
    }
    allObjects.push(textObj);
    childIds.push(textId);
  } else if (childElements.length > 0 && directText.length > 0) {
    // Mixed content: both text nodes and element children (e.g. <a><svg/>Back</a>).
    // Iterate childNodes in DOM order to preserve the visual sequence
    // (e.g. icon-before-text vs text-before-icon).
    const mixedFS = parseFloat(cs.fontSize) || 14;
    const mixedLH = parseLineHeight(cs, mixedFS);
    const mixedLineH = mixedLH.value || mixedFS * 1.4;
    const childElementSet = new Set(childElements);

    for (let i = 0; i < el.childNodes.length; i++) {
      const node = el.childNodes[i];

      if (node.nodeType === 3 /* TEXT_NODE */) {
        const txt = (node.textContent || "").trim();
        if (!txt) continue;
        const textId = nanoid();
        const mixedTextHeight = round2(mixedLineH);
        const textObj = createTextObject(
          textId, `${name}-text`, el, cs, 0, 0, width, mixedTextHeight, now, id, depth + 1
        );
        (textObj.properties as TextProperties).content = txt;
        textObj.autoLayoutSizing = { horizontal: "hug", vertical: "hug" };
        allObjects.push(textObj);
        childIds.push(textId);
      } else if (node.nodeType === 1 /* ELEMENT_NODE */) {
        const childEl = node as Element;
        if (!childElementSet.has(childEl)) continue;
        const childId = walkElement(
          childEl, win, rootRect, rect, id, originX, originY, allObjects, flexMetaMap, now, depth + 1
        );
        if (childId) {
          childIds.push(childId);
        }
      }
    }
  } else {
    // ── Check for input-wrapper pattern ──────────────────────────────
    // A common pattern: <div class="relative"> wraps an <input> plus
    // abs-positioned SVG icons.  Instead of creating two nested frames,
    // merge them into ONE frame with the input's visual styling
    // (border, background, border-radius) and horizontal auto-layout.
    // The SVGs and input text become direct children.
    const absChildren: Element[] = [];
    const flowChildren: Element[] = [];
    for (const child of childElements) {
      const ccs = win.getComputedStyle(child);
      if (ccs.position === "absolute" || ccs.position === "fixed") {
        absChildren.push(child);
      } else {
        flowChildren.push(child);
      }
    }

    const absSvgs = absChildren.filter((c) =>
      c.tagName === "svg" || c.tagName === "SVG" || c.querySelector?.("svg") !== null
    );

    // Detect: exactly 1 flow child that is a form input + abs SVG icons
    const singleFlowInput =
      flowChildren.length === 1 &&
      (flowChildren[0].tagName === "INPUT" || flowChildren[0].tagName === "TEXTAREA" || flowChildren[0].tagName === "SELECT");

    if (absSvgs.length > 0 && singleFlowInput && frameAutoLayout) {
      // ── Merge wrapper + input into one frame ────────────────────
      // Apply input's visual styling to the wrapper frame, then add
      // SVG icons + input text as horizontal auto-layout children.
      const inputEl = flowChildren[0] as HTMLInputElement;
      const inputCs = win.getComputedStyle(inputEl);

      // Steal ALL visual properties from the input element
      const inputFills = extractFills(inputCs);
      const inputStrokes = extractStrokes(inputCs);
      const inputStrokeWidth = extractStrokeWidth(inputCs);
      const inputStrokeWidths = extractStrokeWidths(inputCs);
      const inputBorderRadius = extractBorderRadius(inputCs);
      const inputEffects = extractEffects(inputCs);

      const frameProps = frameObj.properties as FrameProperties;
      frameObj.fills = inputFills;
      frameObj.strokes = inputStrokes;
      frameObj.strokeWidth = inputStrokeWidth;
      frameObj.strokeWidths = inputStrokeWidths;
      frameProps.borderRadius = inputBorderRadius;
      if (inputEffects.length > 0) {
        frameObj.effects = inputEffects;
      }

      // Override to horizontal auto-layout with input's padding.
      // The frame fills width (responsive) but keeps the input's fixed
      // height (e.g. h-9 = 36px) so padding doesn't inflate it.
      frameAutoLayout.mode = "horizontal";
      frameAutoLayout.alignItems = "center";
      frameAutoLayout.justifyContent = "start";
      frameAutoLayout.gap = 0;
      frameAutoLayout.padding = {
        top: round2(parseFloat(inputCs.paddingTop) || 0),
        right: round2(parseFloat(inputCs.paddingRight) || 0),
        bottom: round2(parseFloat(inputCs.paddingBottom) || 0),
        left: round2(parseFloat(inputCs.paddingLeft) || 0),
      };

      // Use the input's actual rendered height (fixed), not hug
      const inputRect = inputEl.getBoundingClientRect();
      frameObj.height = round2(inputRect.height);
      frameObj.autoLayoutSizing = {
        horizontal: frameObj.autoLayoutSizing?.horizontal || "fill",
        vertical: "fixed",
      };

      // Add input text as a flow child (fills the frame width)
      let inputText = "";
      if (inputEl.tagName === "SELECT") {
        const selectEl = inputEl as unknown as HTMLSelectElement;
        const selectedOption = selectEl.selectedOptions?.[0] || selectEl.options?.[selectEl.selectedIndex];
        inputText = selectedOption?.textContent?.trim() || selectEl.value || "";
      } else {
        inputText = inputEl.value || inputEl.placeholder || inputEl.getAttribute("placeholder") || "";
        if (!inputText && inputEl.type) {
          const formatMap: Record<string, string> = {
            date: "mm/dd/yyyy",
            time: "hh:mm",
            "datetime-local": "mm/dd/yyyy hh:mm",
            month: "yyyy-mm",
            week: "yyyy-Www",
          };
          inputText = formatMap[inputEl.type] || "";
        }
      }
      if (inputText) {
        const textId = nanoid();
        const fontSize = parseFloat(inputCs.fontSize) || 14;
        const fontWeight = parseFontWeight(inputCs.fontWeight);
        const fontFamily = parseFontFamily(inputCs.fontFamily);
        const letterSpacing = parseLetterSpacing(inputCs);
        const hexColor = rgbToHex(inputCs.color || "#000000");
        const lineHeight = parseLineHeight(inputCs, fontSize);
        const textAlign = parseTextAlign(inputCs.textAlign);

        const slateContent = buildSlateContentFromDOM(
          inputText, hexColor, fontSize, fontWeight, fontFamily, letterSpacing
        );

        const textObj: CanvasObject = {
          id: textId,
          type: "text",
          name: `${name}-text`,
          createdAt: now + depth + 1,
          x: 0,
          y: 0,
          width: round2(inputRect.width),
          height: round2(lineHeight.value || fontSize * 1.4),
          rotation: 0,
          autoLayoutSizing: { horizontal: "fill", vertical: "hug" },
          fills: [],
          strokes: [],
          opacity: (!inputEl.value && inputEl.placeholder) ? 0.5 : 1,
          parentId: id,
          childIds: [],
          zIndex: depth + 1,
          visible: true,
          locked: false,
          properties: {
            type: "text",
            content: inputText,
            fontSize,
            fontFamily,
            fontWeight,
            textAlign,
            lineHeight,
            letterSpacing: { value: letterSpacing, unit: "px" as const },
            resizeMode: "auto-height",
            slateContent: JSON.stringify(slateContent),
          } as TextProperties,
        };

        allObjects.push(textObj);
        childIds.push(textId);
      }

      // Add SVG icons as absolutePositioned children — they stay in
      // childIds but are removed from the auto-layout flow, positioned
      // at their actual rendered coordinates within the frame.
      for (const svg of absSvgs) {
        const svgId = walkElement(
          svg, win, rootRect, rect, id, originX, originY, allObjects, flexMetaMap, now, depth + 1
        );
        if (svgId) {
          childIds.push(svgId);
          const svgObj = allObjects.find((o) => o.id === svgId);
          if (svgObj) {
            const svgRect = svg.getBoundingClientRect();
            svgObj.absolutePositioned = true;
            svgObj.x = round2(svgRect.x - rect.x);
            svgObj.y = round2(svgRect.y - rect.y);
          }
        }
      }
    } else {
      // Normal auto-layout flow: walk flow children, then walk absolute
      // children (large overlays like modals will pass the filter).
      for (const child of flowChildren) {
        const childId = walkElement(
          child, win, rootRect, rect, id, originX, originY, allObjects, flexMetaMap, now, depth + 1
        );
        if (childId) {
          childIds.push(childId);
        }
      }

      for (const absChild of absChildren) {
        const absId = walkElement(
          absChild, win, rootRect, rect, id, originX, originY, allObjects, flexMetaMap, now, depth + 1
        );
        if (absId) {
          childIds.push(absId);
          const absObj = allObjects.find((o) => o.id === absId);
          if (absObj) {
            const absRect = absChild.getBoundingClientRect();
            absObj.absolutePositioned = true;
            absObj.x = round2(absRect.x - rect.x);
            absObj.y = round2(absRect.y - rect.y);
          }
        }
      }
    }
  }

  frameObj.childIds = childIds;
  return id;
}

// ─── Object creators ────────────────────────────────────────────────

function createTextObject(
  id: string,
  name: string,
  el: Element,
  cs: CSSStyleDeclaration,
  x: number,
  y: number,
  width: number,
  height: number,
  now: number,
  parentId: string | null,
  depth: number
): CanvasObject {
  const textContent = el.textContent?.trim() || "";
  const fontSize = parseFloat(cs.fontSize) || 14;
  const fontWeight = parseFontWeight(cs.fontWeight);
  const fontFamily = parseFontFamily(cs.fontFamily);
  const textAlign = parseTextAlign(cs.textAlign);
  const color = cs.color || "#000000";
  const hexColor = rgbToHex(color);
  const lineHeight = parseLineHeight(cs, fontSize);
  const letterSpacing = parseLetterSpacing(cs);
  const opacity = parseFloat(cs.opacity);

  // Build Slate content with color/weight marks so TextRenderer renders
  // the correct color.  Without slateContent, the TextRenderer falls back
  // to plain black text regardless of the fills array.
  const slateContent = buildSlateContentFromDOM(
    textContent,
    hexColor,
    fontSize,
    fontWeight,
    fontFamily,
    letterSpacing
  );

  // Enforce minimum height: text must be at least one line tall.
  // Prevents 0-height text when caller computes height from padding subtraction.
  const minTextHeight = lineHeight.value || fontSize * 1.2;
  const safeHeight = height > 0 ? height : round2(minTextHeight);
  const safeWidth = width > 0 ? width : round2(fontSize * textContent.length * 0.6 + 4);

  return {
    id,
    type: "text",
    name,
    createdAt: now + depth,
    x: round2(x),
    y: round2(y),
    width: safeWidth,
    height: safeHeight,
    rotation: 0,
    autoLayoutSizing: { horizontal: "hug" as const, vertical: "hug" as const },
    fills: [],
    strokes: [],
    opacity: isNaN(opacity) ? 1 : opacity,
    parentId: parentId || undefined,
    childIds: [],
    zIndex: depth,
    visible: true,
    locked: false,
    properties: {
      type: "text",
      content: textContent,
      fontSize,
      fontFamily,
      fontWeight,
      textAlign,
      lineHeight,
      letterSpacing: { value: letterSpacing, unit: "px" as const },
      // "auto-width" makes the TextRenderer size to content without wrapping,
      // matching the "hug" autoLayoutSizing above.
      resizeMode: "auto-width",
      slateContent: JSON.stringify(slateContent),
    } as TextProperties,
  };
}

/**
 * Build Slate content (Descendant[]) with text formatting marks from
 * computed DOM styles. This ensures TextRenderer picks up the correct
 * color, font weight, etc. from the source page.
 */
function buildSlateContentFromDOM(
  content: string,
  hexColor: string,
  fontSize: number,
  fontWeight: number,
  fontFamily: string,
  letterSpacing: number
): Array<{ type: string; children: Array<Record<string, any>> }> {
  const lines = content.split("\n");
  return lines.map((line) => {
    const leaf: Record<string, any> = { text: line };

    // Always set color — the TextRenderer uses leaf.color for rendering
    if (hexColor && hexColor !== "#000000") {
      leaf.color = hexColor.toUpperCase();
    }

    // Set non-default formatting marks
    if (fontWeight && fontWeight !== 400) {
      leaf.fontWeight = fontWeight;
    }
    if (fontFamily && fontFamily !== "Inter" && fontFamily !== "Inter, sans-serif") {
      leaf.fontFamily = fontFamily;
    }
    if (fontSize && fontSize !== 16) {
      leaf.fontSize = fontSize;
    }
    if (letterSpacing && letterSpacing !== 0) {
      leaf.letterSpacing = { value: letterSpacing, unit: "px" };
    }

    return {
      type: "paragraph",
      children: [leaf],
    };
  });
}

function createFrameObject(
  id: string,
  name: string,
  el: Element,
  cs: CSSStyleDeclaration,
  x: number,
  y: number,
  width: number,
  height: number,
  now: number,
  parentId: string | null,
  depth: number
): CanvasObject {
  const fills = extractFills(cs);
  const strokes = extractStrokes(cs);
  const strokeWidth = extractStrokeWidth(cs);
  const strokeWidths = extractStrokeWidths(cs);
  const borderRadius = extractBorderRadius(cs);
  const opacity = parseFloat(cs.opacity);
  const autoLayout = extractAutoLayout(cs, el);
  const effects = extractEffects(cs);
  const overflow = cs.overflow === "hidden" || cs.overflowX === "hidden" || cs.overflowY === "hidden"
    ? "hidden" as const
    : "visible" as const;

  // Check for background image (url or gradient)
  const bgImage = cs.backgroundImage;
  if (bgImage && bgImage !== "none") {
    // Try url() images first
    const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (urlMatch) {
      fills.push({
        id: nanoid(),
        type: "image",
        visible: true,
        opacity: 1,
        imageUrl: urlMatch[1],
        fit: "fill" as const,
      } as any);
    }

    // Parse gradient fills
    const gradientFills = extractGradientFills(bgImage);
    fills.push(...gradientFills);
  }

  const result: CanvasObject = {
    id,
    type: "frame",
    name,
    createdAt: now + depth,
    x: round2(x),
    y: round2(y),
    width,
    height,
    rotation: 0,
    autoLayoutSizing: getDefaultAutoLayoutSizing(),
    fills,
    strokes,
    strokeWidth: strokeWidth > 0 ? strokeWidth : undefined,
    opacity: isNaN(opacity) ? 1 : opacity,
    parentId: parentId || undefined,
    childIds: [],
    zIndex: depth,
    visible: true,
    locked: false,
    properties: {
      type: "frame",
      borderRadius,
      overflow,
      autoLayout,
    } as FrameProperties,
  };

  // Add per-side stroke widths if they differ
  if (strokeWidths) {
    result.strokeWidths = strokeWidths;
  }

  // Add effects if present
  if (effects.length > 0) {
    result.effects = effects;
  }

  return result;
}

function createVectorObject(
  id: string,
  name: string,
  el: Element,
  cs: CSSStyleDeclaration,
  x: number,
  y: number,
  width: number,
  height: number,
  now: number,
  parentId: string | null,
  depth: number
): CanvasObject {
  const opacity = parseFloat(cs.opacity);

  // Extract the SVG element and its content
  const svgEl = el.tagName === "svg" || el.tagName === "SVG"
    ? el
    : el.closest("svg");

  let svgContent = "";
  let svgViewBox = "";

  if (svgEl) {
    // Preserve the original viewBox for correct path scaling
    svgViewBox = svgEl.getAttribute("viewBox") || "";

    // Resolve the actual computed color (for "currentColor" references)
    const resolvedColor = rgbToHex(cs.color || "#000000");

    // Read SVG-level attributes that child paths/shapes inherit
    let svgFillAttr = svgEl.getAttribute("fill") || "";
    let svgStrokeAttr = svgEl.getAttribute("stroke") || "";
    const svgStrokeWidth = svgEl.getAttribute("stroke-width") || "";
    const svgStrokeLinecap = svgEl.getAttribute("stroke-linecap") || "";
    const svgStrokeLinejoin = svgEl.getAttribute("stroke-linejoin") || "";

    // Resolve "currentColor" to the actual computed color
    if (svgFillAttr === "currentColor") svgFillAttr = resolvedColor;
    if (svgStrokeAttr === "currentColor") svgStrokeAttr = resolvedColor;

    // Wrap innerHTML in a <g> that carries the SVG-level attributes.
    // This preserves stroke/fill semantics that would otherwise be lost
    // when we extract only the inner content (not the outer <svg> tag).
    const gAttrs: string[] = [];
    if (svgFillAttr) gAttrs.push(`fill="${svgFillAttr}"`);
    if (svgStrokeAttr) gAttrs.push(`stroke="${svgStrokeAttr}"`);
    if (svgStrokeWidth) gAttrs.push(`stroke-width="${svgStrokeWidth}"`);
    if (svgStrokeLinecap) gAttrs.push(`stroke-linecap="${svgStrokeLinecap}"`);
    if (svgStrokeLinejoin) gAttrs.push(`stroke-linejoin="${svgStrokeLinejoin}"`);

    const inner = svgEl.innerHTML;
    svgContent = gAttrs.length > 0
      ? `<g ${gAttrs.join(" ")}>${inner}</g>`
      : inner;
  }

  // Extract fill color for the fills array (used for selection/UI display)
  const fills: Fill[] = [];
  const svgFillColor = cs.color || (svgEl?.getAttribute("stroke")) || (svgEl?.getAttribute("fill"));
  if (svgFillColor && svgFillColor !== "none" && svgFillColor !== "rgba(0, 0, 0, 0)") {
    fills.push({
      id: nanoid(),
      type: "solid",
      visible: true,
      opacity: 1,
      color: rgbToHex(svgFillColor),
    } as SolidFill);
  }

  return {
    id,
    type: "vector",
    name: name.startsWith("svg") ? `Icon: ${name}` : name,
    createdAt: now + depth,
    x: round2(x),
    y: round2(y),
    width,
    height,
    rotation: 0,
    autoLayoutSizing: getDefaultAutoLayoutSizing(),
    fills,
    strokes: [],
    opacity: isNaN(opacity) ? 1 : opacity,
    parentId: parentId || undefined,
    childIds: [],
    zIndex: depth,
    visible: true,
    locked: false,
    properties: {
      type: "vector",
      svgContent,
      svgViewBox: svgViewBox || undefined,
    } as VectorProperties,
  };
}

function createImageObject(
  id: string,
  name: string,
  el: HTMLImageElement,
  cs: CSSStyleDeclaration,
  x: number,
  y: number,
  width: number,
  height: number,
  now: number,
  parentId: string | null,
  depth: number
): CanvasObject {
  const fills: Fill[] = [];
  const opacity = parseFloat(cs.opacity);

  const src = el.src;
  if (src) {
    fills.push({
      id: nanoid(),
      type: "image",
      visible: true,
      opacity: 1,
      imageUrl: src,
      fit: "fill" as const,
    } as any);
  }

  return {
    id,
    type: "rectangle",
    name,
    createdAt: now + depth,
    x: round2(x),
    y: round2(y),
    width,
    height,
    rotation: 0,
    autoLayoutSizing: getDefaultAutoLayoutSizing(),
    fills,
    strokes: [],
    opacity: isNaN(opacity) ? 1 : opacity,
    parentId: parentId || undefined,
    childIds: [],
    zIndex: depth,
    visible: true,
    locked: false,
    properties: {
      type: "rectangle",
      borderRadius: extractBorderRadius(cs),
    },
  };
}

// ─── Style extractors ───────────────────────────────────────────────

/**
 * Parse CSS `box-shadow` value into an array of Effect objects.
 * Supports multiple comma-separated shadows, including `inset` for inner shadows.
 *
 * CSS box-shadow syntax: [inset?] <offset-x> <offset-y> [<blur-radius>] [<spread-radius>] <color>
 * The color can appear before or after the numeric values.
 */
function extractEffects(cs: CSSStyleDeclaration): Effect[] {
  const raw = cs.boxShadow;
  if (!raw || raw === "none") return [];

  const effects: Effect[] = [];

  // Split by commas that are NOT inside parentheses (to handle rgb()/rgba() colors)
  const shadows = splitBoxShadows(raw);

  for (const shadow of shadows) {
    const trimmed = shadow.trim();
    if (!trimmed) continue;

    const isInset = trimmed.includes("inset");
    const withoutInset = trimmed.replace(/\binset\b/g, "").trim();

    // Extract the color portion (rgb/rgba/hex/named) and the numeric values
    let color = "#000000";
    let colorOpacity = 1;
    let numericPart = withoutInset;

    // Try to match rgb/rgba color at the start or end
    const rgbaRegex = /rgba?\([^)]+\)/;
    const hexRegex = /#[0-9a-fA-F]{3,8}/;

    const rgbaMatch = withoutInset.match(rgbaRegex);
    const hexMatch = withoutInset.match(hexRegex);

    if (rgbaMatch) {
      const parsed = parseRgba(rgbaMatch[0]);
      if (parsed) {
        color = rgbToHex(`rgb(${parsed.r}, ${parsed.g}, ${parsed.b})`);
        colorOpacity = parsed.a;
      }
      numericPart = withoutInset.replace(rgbaRegex, "").trim();
    } else if (hexMatch) {
      color = hexMatch[0];
      numericPart = withoutInset.replace(hexRegex, "").trim();
    }

    // Parse numeric values: offset-x, offset-y, blur-radius?, spread-radius?
    const nums = numericPart.match(/-?[\d.]+/g);
    if (!nums || nums.length < 2) continue;

    const offsetX = parseFloat(nums[0]) || 0;
    const offsetY = parseFloat(nums[1]) || 0;
    const blur = nums.length > 2 ? parseFloat(nums[2]) || 0 : 0;
    const spread = nums.length > 3 ? parseFloat(nums[3]) || 0 : 0;

    if (isInset) {
      effects.push({
        id: nanoid(),
        type: "inner-shadow",
        visible: true,
        color,
        opacity: colorOpacity,
        offsetX,
        offsetY,
        blur,
        spread,
      } as InnerShadowEffect);
    } else {
      effects.push({
        id: nanoid(),
        type: "drop-shadow",
        visible: true,
        color,
        opacity: colorOpacity,
        offsetX,
        offsetY,
        blur,
        spread,
      } as DropShadowEffect);
    }
  }

  return effects;
}

/**
 * Split a CSS box-shadow value by commas, respecting parentheses.
 * e.g. "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)"
 * → ["0 1px 3px rgba(0,0,0,0.12)", "0 1px 2px rgba(0,0,0,0.24)"]
 */
function splitBoxShadows(raw: string): string[] {
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    else if (ch === "," && parenDepth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);

  return parts;
}

function extractFills(cs: CSSStyleDeclaration): Fill[] {
  const fills: Fill[] = [];
  const bg = cs.backgroundColor;

  if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
    const parsed = parseRgba(bg);
    if (parsed) {
      fills.push({
        id: nanoid(),
        type: "solid",
        visible: true,
        opacity: parsed.a,
        color: rgbToHex(`rgb(${parsed.r}, ${parsed.g}, ${parsed.b})`),
      } as SolidFill);
    }
  }

  return fills;
}

/**
 * Parse CSS gradient functions from a background-image value.
 * Supports linear-gradient and radial-gradient.
 */
function extractGradientFills(bgImage: string): Fill[] {
  const fills: Fill[] = [];

  // Match all gradient functions in the background-image
  // (there can be multiple, e.g. layered gradients)
  const gradientRegex = /(linear-gradient|radial-gradient)\(([^)]+(?:\([^)]*\))*[^)]*)\)/g;
  let match: RegExpExecArray | null;

  while ((match = gradientRegex.exec(bgImage)) !== null) {
    const type = match[1];
    const args = match[2];

    if (type === "linear-gradient") {
      const fill = parseLinearGradient(args);
      if (fill) fills.push(fill);
    } else if (type === "radial-gradient") {
      const fill = parseRadialGradient(args);
      if (fill) fills.push(fill);
    }
  }

  return fills;
}

/**
 * Parse a linear-gradient() argument string into a LinearGradientFill.
 * e.g. "to right, #ff0000, #0000ff" or "135deg, red 0%, blue 100%"
 */
function parseLinearGradient(args: string): LinearGradientFill | null {
  // Split by commas that are not inside parentheses
  const parts = splitGradientArgs(args);
  if (parts.length < 2) return null;

  let angle = 180; // default: top to bottom
  let stopStart = 0;

  // Check if first part is a direction
  const first = parts[0].trim();
  if (first.endsWith("deg")) {
    angle = parseFloat(first) || 180;
    stopStart = 1;
  } else if (first.startsWith("to ")) {
    angle = directionToAngle(first);
    stopStart = 1;
  }

  const stops = parseGradientStops(parts.slice(stopStart));
  if (stops.length < 2) return null;

  return {
    id: nanoid(),
    type: "linear-gradient",
    visible: true,
    opacity: 1,
    angle,
    stops,
  };
}

/**
 * Parse a radial-gradient() argument string into a RadialGradientFill.
 */
function parseRadialGradient(args: string): RadialGradientFill | null {
  const parts = splitGradientArgs(args);
  if (parts.length < 2) return null;

  // For simplicity, default center/radius; skip parsing shape/extent keywords
  let stopStart = 0;
  const first = parts[0].trim();

  // Check if first part is a shape/position spec (e.g. "circle at center")
  if (first.includes("at") || first === "circle" || first === "ellipse" ||
      first.startsWith("circle ") || first.startsWith("ellipse ")) {
    stopStart = 1;
  }

  const stops = parseGradientStops(parts.slice(stopStart));
  if (stops.length < 2) return null;

  return {
    id: nanoid(),
    type: "radial-gradient",
    visible: true,
    opacity: 1,
    centerX: 0.5,
    centerY: 0.5,
    radius: 0.5,
    stops,
  };
}

/** Parse gradient color stops from parts like ["#ff0000 0%", "#0000ff 100%"] */
function parseGradientStops(parts: string[]): GradientStop[] {
  const stops: GradientStop[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;

    // Try to extract color and position
    let color = "#000000";
    let colorOpacity = 1;
    let position: number | null = null;

    // Check for rgb/rgba color
    const rgbaMatch = part.match(/rgba?\([^)]+\)/);
    const hexMatch = part.match(/#[0-9a-fA-F]{3,8}/);

    let remaining = part;

    if (rgbaMatch) {
      const parsed = parseRgba(rgbaMatch[0]);
      if (parsed) {
        color = rgbToHex(`rgb(${parsed.r}, ${parsed.g}, ${parsed.b})`);
        colorOpacity = parsed.a;
      }
      remaining = part.replace(rgbaMatch[0], "").trim();
    } else if (hexMatch) {
      color = hexMatch[0];
      remaining = part.replace(hexMatch[0], "").trim();
    } else {
      // Named color — try to use it directly
      const words = part.split(/\s+/);
      if (words.length > 0) {
        color = words[0];
        remaining = words.slice(1).join(" ");
      }
    }

    // Check for percentage position
    const posMatch = remaining.match(/([\d.]+)%/);
    if (posMatch) {
      position = parseFloat(posMatch[1]) / 100;
    }

    // Auto-distribute positions if not specified
    if (position === null) {
      position = parts.length > 1 ? i / (parts.length - 1) : 0;
    }

    stops.push({ position, color, opacity: colorOpacity });
  }

  return stops;
}

/** Convert CSS direction keywords to angle in degrees */
function directionToAngle(dir: string): number {
  switch (dir.trim()) {
    case "to top": return 0;
    case "to top right":
    case "to right top": return 45;
    case "to right": return 90;
    case "to bottom right":
    case "to right bottom": return 135;
    case "to bottom": return 180;
    case "to bottom left":
    case "to left bottom": return 225;
    case "to left": return 270;
    case "to top left":
    case "to left top": return 315;
    default: return 180;
  }
}

/** Split gradient arguments by commas, respecting parentheses */
function splitGradientArgs(args: string): string[] {
  const parts: string[] = [];
  let current = "";
  let parenDepth = 0;

  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    else if (ch === "," && parenDepth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);

  return parts;
}

function extractStrokes(cs: CSSStyleDeclaration): Stroke[] {
  const strokes: Stroke[] = [];

  // Check each border side and use the most prominent one as the stroke color
  const sides = [
    { style: cs.borderTopStyle, color: cs.borderTopColor, width: parseFloat(cs.borderTopWidth) || 0 },
    { style: cs.borderRightStyle, color: cs.borderRightColor, width: parseFloat(cs.borderRightWidth) || 0 },
    { style: cs.borderBottomStyle, color: cs.borderBottomColor, width: parseFloat(cs.borderBottomWidth) || 0 },
    { style: cs.borderLeftStyle, color: cs.borderLeftColor, width: parseFloat(cs.borderLeftWidth) || 0 },
  ];

  // Find the first visible border to use as representative stroke color
  for (const side of sides) {
    if (
      side.style &&
      side.style !== "none" &&
      side.width > 0 &&
      side.color &&
      side.color !== "rgba(0, 0, 0, 0)"
    ) {
      strokes.push({
        id: nanoid(),
        type: "solid",
        visible: true,
        opacity: 1,
        color: rgbToHex(side.color),
      } as SolidStroke);
      break; // One stroke entry, per-side widths handle differing widths
    }
  }

  return strokes;
}

function extractStrokeWidth(cs: CSSStyleDeclaration): number {
  // Use the max border width as the uniform stroke width
  const t = parseFloat(cs.borderTopWidth) || 0;
  const r = parseFloat(cs.borderRightWidth) || 0;
  const b = parseFloat(cs.borderBottomWidth) || 0;
  const l = parseFloat(cs.borderLeftWidth) || 0;
  return Math.max(t, r, b, l);
}

/**
 * Extract per-side border widths. Returns undefined if all sides are equal
 * (in which case the uniform strokeWidth is sufficient).
 */
function extractStrokeWidths(cs: CSSStyleDeclaration): {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
} | undefined {
  const t = parseFloat(cs.borderTopWidth) || 0;
  const r = parseFloat(cs.borderRightWidth) || 0;
  const b = parseFloat(cs.borderBottomWidth) || 0;
  const l = parseFloat(cs.borderLeftWidth) || 0;

  // Only return per-side widths if they differ
  if (t === r && r === b && b === l) return undefined;

  // Only include sides that have a visible border
  const result: { top?: number; right?: number; bottom?: number; left?: number } = {};
  if (t > 0 && cs.borderTopStyle !== "none") result.top = t;
  if (r > 0 && cs.borderRightStyle !== "none") result.right = r;
  if (b > 0 && cs.borderBottomStyle !== "none") result.bottom = b;
  if (l > 0 && cs.borderLeftStyle !== "none") result.left = l;

  return Object.keys(result).length > 0 ? result : undefined;
}

function extractBorderRadius(cs: CSSStyleDeclaration): number | {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
} {
  const tl = parseFloat(cs.borderTopLeftRadius) || 0;
  const tr = parseFloat(cs.borderTopRightRadius) || 0;
  const br = parseFloat(cs.borderBottomRightRadius) || 0;
  const bl = parseFloat(cs.borderBottomLeftRadius) || 0;

  // If all corners are the same, return a single number
  if (tl === tr && tr === br && br === bl) {
    return tl;
  }

  return { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl };
}

function extractAutoLayout(cs: CSSStyleDeclaration, el?: Element): AutoLayoutProperties | undefined {
  const display = cs.display;

  const isFlex = display === "flex" || display === "inline-flex";
  const isGrid = display === "grid" || display === "inline-grid";

  // Block-level elements have vertical document flow — treat as vertical
  // auto-layout so the design stays responsive/editable.
  const isBlockLike =
    display === "block" ||
    display === "list-item" ||
    display === "flow-root" ||
    display === "table" ||
    display === "inline-block";

  // Read the element's CSS class list for Tailwind class fallbacks.
  // The Tailwind CDN may not have finished processing by the time we
  // walk the DOM, so getComputedStyle might return initial values
  // (e.g. "normal") even though the class names are present.
  const classList = (el as HTMLElement | undefined)?.classList;

  // Tailwind CDN timing: if the element has flex/inline-flex class but
  // getComputedStyle still reports block, treat it as flex.
  const isTailwindFlex = classList?.contains("flex") || classList?.contains("inline-flex");
  const effectivelyFlex = isFlex || (isTailwindFlex ?? false);

  if (!effectivelyFlex && !isGrid && !isBlockLike) {
    // Truly inline or unknown display — no auto layout
    return { mode: "none" };
  }

  // ── Determine layout direction ────────────────────────────────────
  let mode: "horizontal" | "vertical" | "grid";
  let gridColumns: number | undefined;
  let gridRows: number | undefined;
  let counterAxisSpacing: number | undefined;

  if (effectivelyFlex) {
    const flexDir = cs.flexDirection;
    const isVertical = flexDir === "column" || flexDir === "column-reverse";
    // Tailwind fallback: flex-col / flex-row
    const twVertical = classList?.contains("flex-col") || classList?.contains("flex-col-reverse");
    const twHorizontal = classList?.contains("flex-row") || classList?.contains("flex-row-reverse");
    if (twVertical) mode = "vertical";
    else if (twHorizontal) mode = "horizontal";
    else mode = isVertical ? "vertical" : "horizontal";
  } else if (isGrid) {
    const colTemplate = cs.gridTemplateColumns;
    const colCount = colTemplate && colTemplate !== "none"
      ? colTemplate.split(/\s+/).filter(Boolean).length
      : 1;

    if (colCount <= 1) {
      mode = "vertical";
    } else {
      mode = "grid";
      gridColumns = colCount;

      const rowTemplate = cs.gridTemplateRows;
      if (rowTemplate && rowTemplate !== "none") {
        gridRows = rowTemplate.split(/\s+/).filter(Boolean).length;
      }

      const rowGapVal = parseFloat(cs.rowGap) || 0;
      const colGapVal = parseFloat(cs.columnGap) || 0;
      if (rowGapVal !== colGapVal) {
        counterAxisSpacing = round2(rowGapVal);
      }
    }
  } else {
    // Block-level elements → vertical flow
    mode = "vertical";
  }

  // ── Gap ───────────────────────────────────────────────────────────
  // For flex/grid, use the CSS gap property.
  // For block elements, gap will be refined later from DOM child rects.
  let gap = (effectivelyFlex || isGrid)
    ? (parseFloat(cs.gap) || parseFloat(cs.rowGap) || 0)
    : 0;

  // Tailwind gap fallback: gap-{n} classes use 0.25rem per unit.
  // NOTE: space-y-N / space-x-N use child margins (> * + * { margin-top }),
  // NOT CSS gap. The spacing is captured by child rect analysis and
  // margin wrappers, so we must NOT set gap from space-* classes
  // (that would double-count the spacing).
  if (gap === 0 && classList) {
    for (let i = 0; i < classList.length; i++) {
      const c = classList[i];
      const m = c.match(/^gap-(\d+(?:\.\d+)?)$/);
      if (m) {
        gap = parseFloat(m[1]) * 4; // Tailwind: gap-1 = 0.25rem = 4px
        break;
      }
    }
  }

  // ── Padding ───────────────────────────────────────────────────────
  const paddingTop = parseFloat(cs.paddingTop) || 0;
  const paddingRight = parseFloat(cs.paddingRight) || 0;
  const paddingBottom = parseFloat(cs.paddingBottom) || 0;
  const paddingLeft = parseFloat(cs.paddingLeft) || 0;

  // ── Align items ───────────────────────────────────────────────────
  let alignItems: AutoLayoutProperties["alignItems"] = "stretch";

  if (effectivelyFlex || isGrid) {
    switch (cs.alignItems) {
      case "center":
        alignItems = "center";
        break;
      case "flex-end":
      case "end":
        alignItems = "end";
        break;
      case "flex-start":
      case "start":
        alignItems = "start";
        break;
      case "stretch":
        alignItems = "stretch";
        break;
      case "normal":
        // "normal" in flex context behaves as "stretch"
        alignItems = "stretch";
        break;
      default:
        // Unknown value — default to stretch for flex containers
        alignItems = "stretch";
    }
  } else {
    // Block elements: children stretch full width by default.
    // text-align:center centers inline/inline-block children (e.g. SVGs).
    const ta = cs.textAlign;
    if (ta === "center" || ta === "-webkit-center") {
      alignItems = "center";
    } else if (classList?.contains("text-center")) {
      alignItems = "center";
    } else {
      alignItems = "stretch";
    }
  }

  // Tailwind class-name fallback — takes precedence over computed style.
  // Applied for ALL element types (flex, grid, block) because the Tailwind
  // CDN may not have finished processing.
  if (classList) {
    if (classList.contains("items-center")) alignItems = "center";
    else if (classList.contains("items-start")) alignItems = "start";
    else if (classList.contains("items-end")) alignItems = "end";
    else if (classList.contains("items-stretch")) alignItems = "stretch";
    else if (classList.contains("items-baseline")) alignItems = "start"; // no baseline in our model
  }

  // ── Justify content ───────────────────────────────────────────────
  let justifyContent: AutoLayoutProperties["justifyContent"] = "start";

  if (effectivelyFlex || isGrid) {
    switch (cs.justifyContent) {
      case "center":
        justifyContent = "center";
        break;
      case "flex-end":
      case "end":
        justifyContent = "end";
        break;
      case "space-between":
        justifyContent = "space-between";
        break;
      case "space-around":
        justifyContent = "space-around";
        break;
      case "space-evenly":
        justifyContent = "space-evenly";
        break;
      case "normal":
        // "normal" in flex context behaves as "start" (correct default)
        justifyContent = "start";
        break;
      default:
        justifyContent = "start";
    }
  }

  // Tailwind class-name fallback — applied for ALL element types
  if (classList) {
    if (classList.contains("justify-center")) justifyContent = "center";
    else if (classList.contains("justify-start")) justifyContent = "start";
    else if (classList.contains("justify-end")) justifyContent = "end";
    else if (classList.contains("justify-between")) justifyContent = "space-between";
    else if (classList.contains("justify-around")) justifyContent = "space-around";
    else if (classList.contains("justify-evenly")) justifyContent = "space-evenly";
  }

  // ── Wrap ──────────────────────────────────────────────────────────
  const wrap = effectivelyFlex
    ? (cs.flexWrap === "wrap" || cs.flexWrap === "wrap-reverse" ||
       (classList?.contains("flex-wrap") ?? false))
    : false;

  const result: AutoLayoutProperties = {
    mode,
    gap: round2(gap),
    padding: {
      top: round2(paddingTop),
      right: round2(paddingRight),
      bottom: round2(paddingBottom),
      left: round2(paddingLeft),
    },
    alignItems,
    justifyContent,
    wrap,
  };

  if (mode === "grid") {
    if (gridColumns !== undefined) result.gridColumns = gridColumns;
    if (gridRows !== undefined) result.gridRows = gridRows;
    if (counterAxisSpacing !== undefined) result.counterAxisSpacing = counterAxisSpacing;
  }

  return result;
}

// ─── Auto layout child sizing detection ─────────────────────────────

/**
 * After all objects are created, refine autoLayoutSizing for children
 * whose parent has auto layout enabled.
 *
 * Uses flex metadata (flexGrow, flexShrink, alignSelf) when available
 * for much more accurate sizing detection than heuristic ratios.
 */
export function refineAutoLayoutSizing(
  objects: CanvasObject[],
  flexMetaMap?: Map<string, FlexMeta>
): void {
  const objectMap = new Map<string, CanvasObject>();
  for (const obj of objects) {
    objectMap.set(obj.id, obj);
  }

  // Fall back to the cached map from domToDesignWithMeta
  const meta = flexMetaMap || _lastFlexMetaMap;

  for (const obj of objects) {
    if (!obj.parentId) continue;
    const parent = objectMap.get(obj.parentId);
    if (!parent) continue;

    const parentProps = parent.properties;
    if (parentProps.type !== "frame") continue;

    const autoLayout = parentProps.autoLayout;
    if (!autoLayout || autoLayout.mode === "none") continue;

    const isVertical = autoLayout.mode === "vertical";
    const isGrid = autoLayout.mode === "grid";
    const parentPadH = (autoLayout.padding?.left || 0) + (autoLayout.padding?.right || 0);
    const parentPadV = (autoLayout.padding?.top || 0) + (autoLayout.padding?.bottom || 0);
    const parentContentW = parent.width - parentPadH;
    const parentContentH = parent.height - parentPadV;

    const flexInfo = meta.get(obj.id);

    // Grid children: both axes are independent, default to "fixed"
    if (isGrid) {
      const cols = autoLayout.gridColumns ?? 1;
      const rows = autoLayout.gridRows ?? 1;
      const colGap = autoLayout.gap ?? 0;
      const rowGap = autoLayout.counterAxisSpacing ?? colGap;
      const cellW = (parentContentW - colGap * (cols - 1)) / cols;
      const cellH = (parentContentH - rowGap * (rows - 1)) / rows;

      const hRatio = cellW > 0 ? obj.width / cellW : 0;
      const vRatio = cellH > 0 ? obj.height / cellH : 0;

      obj.autoLayoutSizing = {
        horizontal: hRatio > 0.9 ? "fill" : "fixed",
        vertical: vRatio > 0.9 ? "fill" : "fixed",
      };
      continue;
    }

    // ── Special handling for text nodes ──────────────────────────────
    // Text nodes that were walked from real DOM elements have an entry
    // in flexMetaMap (the walker sets it using the same `id`).
    // Text nodes WITH flexMeta were walked from real DOM elements.
    // We use DOM wrapping signals (natural text width, white-space) to
    // decide whether the text should hug its content or fill the parent.
    //
    // Text nodes WITHOUT flexMeta were created manually by the walker
    // (e.g. text inside a button or input) and already have explicit
    // sizing (typically "fill") — leave those untouched.
    if (obj.type === "text") {
      const hasFlexMeta = meta.has(obj.id);
      if (hasFlexMeta) {
        const textProps = obj.properties as TextProperties;
        const alignSelf = flexInfo?.alignSelf || "auto";
        const shouldStretchCross =
          alignSelf === "stretch" ||
          (alignSelf === "auto" && autoLayout.alignItems === "stretch");

        // Detect wrapping text: natural (unwrapped) width exceeds rendered width
        const naturalW = flexInfo?.naturalTextWidth ?? 0;
        const isWrapping = naturalW > obj.width * 1.1;

        // Detect explicit no-wrap (text can never wrap)
        const isNoWrap = flexInfo?.whiteSpace === "nowrap" || flexInfo?.whiteSpace === "pre";

        // Detect text that fills parent width (block-level behavior)
        const fillsParentWidth = parentContentW > 0 && obj.width / parentContentW > 0.9;

        // Center-aligned multi-line text needs fill for centering to work
        const hasCenterAlign =
          textProps?.textAlign === "center" &&
          textProps.resizeMode !== "auto-width";

        // Cross-axis sizing: fill if the text wraps, stretches, or fills
        // the parent width. Hug if it's explicitly nowrap or naturally short.
        let crossSizing: AutoLayoutItemSizing;
        if (isNoWrap) {
          crossSizing = "hug";
        } else if (isWrapping || shouldStretchCross || hasCenterAlign || fillsParentWidth) {
          crossSizing = "fill";
        } else {
          crossSizing = "hug";
        }

        const mainSizing: AutoLayoutItemSizing =
          flexInfo && flexInfo.flexGrow > 0 ? "fill" : "hug";

        const horizontalSizing = isVertical ? crossSizing : mainSizing;
        obj.autoLayoutSizing = {
          horizontal: horizontalSizing,
          vertical: "hug",
        };

        // When text fills horizontally, switch to auto-height so it wraps
        // within the parent width (auto-width would prevent wrapping).
        if (horizontalSizing === "fill" && textProps) {
          textProps.resizeMode = "auto-height";
        }
      }
      // else: keep the explicitly set sizing (fill/hug for button/input text)
      continue;
    }

    // ── Vector objects (SVG icons) ────────────────────────────────────
    // Vectors are content-sized (like text), so they should be "hug"
    // unless the parent explicitly stretches children.  This allows
    // parent alignItems:center to center icons properly.
    if (obj.type === "vector") {
      const alignSelf = flexInfo?.alignSelf || "auto";
      const shouldStretchCross =
        alignSelf === "stretch" ||
        (alignSelf === "auto" && autoLayout.alignItems === "stretch");

      obj.autoLayoutSizing = {
        horizontal: isVertical
          ? (shouldStretchCross ? "fill" : "fixed")
          : "fixed",
        vertical: isVertical
          ? "fixed"
          : (shouldStretchCross ? "fill" : "fixed"),
      };
      continue;
    }

    // ── Frames and other non-text objects ────────────────────────────

    // If this object already has explicitly-set "fixed" sizing on either
    // axis (e.g. from the input-wrapper merge pattern), preserve it.
    const existingH = obj.autoLayoutSizing?.horizontal;
    const existingV = obj.autoLayoutSizing?.vertical;
    const preserveH = existingH === "fixed";
    const preserveV = existingV === "fixed";

    // Determine main-axis sizing
    let mainSizing: AutoLayoutItemSizing;
    let crossSizing: AutoLayoutItemSizing;

    if (flexInfo && flexInfo.flexGrow > 0) {
      // flex-grow > 0 means the element expands to fill available space → "fill"
      mainSizing = "fill";
    } else {
      // Fall back to dimension-based heuristic
      const mainDim = isVertical ? obj.height : obj.width;
      const parentMainDim = isVertical ? parentContentH : parentContentW;
      mainSizing = detectSizingHeuristic(mainDim, parentMainDim, parent.childIds.length, true);
    }

    // Determine cross-axis sizing
    const alignSelf = flexInfo?.alignSelf || "auto";
    if (alignSelf === "stretch" || (alignSelf === "auto" && autoLayout.alignItems === "stretch")) {
      // stretch on cross axis → "fill"
      crossSizing = "fill";
    } else {
      const crossDim = isVertical ? obj.width : obj.height;
      const parentCrossDim = isVertical ? parentContentW : parentContentH;
      crossSizing = detectSizingHeuristic(crossDim, parentCrossDim, parent.childIds.length, false);
    }

    // Map main/cross to horizontal/vertical, preserving explicit "fixed"
    obj.autoLayoutSizing = {
      horizontal: preserveH ? "fixed" : (isVertical ? crossSizing : mainSizing),
      vertical: preserveV ? "fixed" : (isVertical ? mainSizing : crossSizing),
    };
  }

  // ── Normalize "stretch" → "start" on parent frames ──────────────
  // CSS align-items:stretch means children expand to fill the cross-axis.
  // In the Figma model this is handled by child sizing ("fill"), not by
  // parent alignment.  Now that children have been sized, replace
  // "stretch" with "start" so the alignment grid UI shows a valid state.
  for (const obj of objects) {
    if (obj.properties.type !== "frame") continue;
    const al = (obj.properties as FrameProperties).autoLayout;
    if (al && al.alignItems === "stretch") {
      al.alignItems = "start";
    }
  }
}

// ─── Margin-to-padding wrapper pass ─────────────────────────────────

/**
 * Post-processing pass that wraps elements with CSS margins in transparent
 * auto-layout frames whose padding equals the original margins.
 * This preserves margin-based spacing in Figma's margin-less model.
 *
 * Must run AFTER refineAutoLayoutSizing so that sizing decisions are
 * already made and can be transferred from child to wrapper.
 */
export function wrapChildMargins(
  objects: CanvasObject[],
  flexMetaMap?: Map<string, FlexMeta>
): void {
  const meta = flexMetaMap || _lastFlexMetaMap;
  const objectMap = new Map<string, CanvasObject>();
  for (const obj of objects) {
    objectMap.set(obj.id, obj);
  }

  // Collect IDs to wrap (iterate a snapshot to avoid mutation issues)
  const idsToWrap: string[] = [];
  for (const obj of objects) {
    if (!obj.parentId) continue;
    if (obj.absolutePositioned) continue;
    const fm = meta.get(obj.id);
    if (!fm) continue;
    const mt = fm.marginTop ?? 0;
    const mr = fm.marginRight ?? 0;
    const mb = fm.marginBottom ?? 0;
    const ml = fm.marginLeft ?? 0;
    if (Math.abs(mt) + Math.abs(mr) + Math.abs(mb) + Math.abs(ml) <= 2) continue;
    idsToWrap.push(obj.id);
  }

  // Track which parents had children wrapped (for gap adjustment)
  const affectedParents = new Set<string>();

  for (const childId of idsToWrap) {
    const child = objectMap.get(childId);
    if (!child || !child.parentId) continue;
    const parent = objectMap.get(child.parentId);
    if (!parent) continue;

    const fm = meta.get(childId)!;
    const mt = fm.marginTop ?? 0;
    const mr = fm.marginRight ?? 0;
    const mb = fm.marginBottom ?? 0;
    const ml = fm.marginLeft ?? 0;

    const wrapperId = nanoid();
    const wrapper: CanvasObject = {
      id: wrapperId,
      type: "frame",
      name: child.name,
      createdAt: child.createdAt,
      x: 0,
      y: 0,
      width: round2(child.width + ml + mr),
      height: round2(child.height + mt + mb),
      rotation: 0,
      autoLayoutSizing: child.autoLayoutSizing
        ? { ...child.autoLayoutSizing }
        : getDefaultAutoLayoutSizing(),
      fills: [],
      strokes: [],
      opacity: 1,
      parentId: child.parentId,
      childIds: [childId],
      zIndex: child.zIndex,
      visible: true,
      locked: false,
      properties: {
        type: "frame",
        borderRadius: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
        overflow: "visible",
        autoLayout: {
          mode: "vertical",
          gap: 0,
          padding: {
            top: round2(mt),
            right: round2(mr),
            bottom: round2(mb),
            left: round2(ml),
          },
          alignItems: "start",
          justifyContent: "start",
          wrap: false,
        },
      } as FrameProperties,
    };

    // Transfer sizing: wrapper inherits child's sizing in parent,
    // child fills the wrapper's content area.
    // Text and vector children keep vertical: "hug" so they size to content
    // instead of stretching (which can collapse them to 0 height).
    const isContentSized = child.type === "text" || child.type === "vector";
    child.autoLayoutSizing = {
      horizontal: "fill",
      vertical: isContentSized ? "hug" : "fill",
    };
    child.parentId = wrapperId;

    // Replace child with wrapper in parent's childIds
    const idx = parent.childIds.indexOf(childId);
    if (idx !== -1) {
      parent.childIds[idx] = wrapperId;
    }

    // Copy flex metadata from child to wrapper — keep the original margin
    // values so the gap adjustment pass can read them from the wrapper IDs
    // (which now occupy the parent's childIds).
    meta.set(wrapperId, { ...fm });

    objects.push(wrapper);
    objectMap.set(wrapperId, wrapper);
    affectedParents.add(parent.id);
  }

  // ── Adjust parent gap for margins now captured in wrappers ─────────
  for (const parentId of affectedParents) {
    const parent = objectMap.get(parentId);
    if (!parent || parent.properties.type !== "frame") continue;
    const al = (parent.properties as FrameProperties).autoLayout;
    if (!al || al.mode === "none" || al.mode === "grid") continue;

    const isVertical = al.mode === "vertical";
    const flowChildIds = parent.childIds.filter((cid) => {
      const c = objectMap.get(cid);
      return c && !c.absolutePositioned;
    });

    if (flowChildIds.length < 2) continue;

    let totalMarginContribution = 0;
    let pairCount = 0;
    for (let i = 0; i < flowChildIds.length - 1; i++) {
      const curFm = meta.get(flowChildIds[i]);
      const nextFm = meta.get(flowChildIds[i + 1]);
      const trailingMargin = isVertical
        ? (curFm?.marginBottom ?? 0)
        : (curFm?.marginRight ?? 0);
      const leadingMargin = isVertical
        ? (nextFm?.marginTop ?? 0)
        : (nextFm?.marginLeft ?? 0);
      totalMarginContribution += trailingMargin + leadingMargin;
      pairCount++;
    }

    if (pairCount > 0) {
      const avgMarginContribution = totalMarginContribution / pairCount;
      al.gap = Math.max(0, round2((al.gap ?? 0) - avgMarginContribution));
    }
  }
}

/** Heuristic fallback when flex metadata is not available */
function detectSizingHeuristic(
  childDim: number,
  parentContentDim: number,
  siblingCount: number,
  isMainAxis: boolean
): AutoLayoutItemSizing {
  if (parentContentDim <= 0) return "fixed";

  const ratio = childDim / parentContentDim;

  if (!isMainAxis) {
    // Cross axis: if it fills ~100%, it's "fill"
    if (ratio > 0.95) return "fill";
    return "fixed";
  }

  // Main axis
  if (siblingCount === 1 && ratio > 0.90) {
    return "fill";
  }

  if (siblingCount > 1) {
    const expectedRatio = 1 / siblingCount;
    if (Math.abs(ratio - expectedRatio) < 0.1) {
      return "fill";
    }
  }

  return "fixed";
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Check if an element is a "pure text leaf" — an element whose primary
 * purpose is to display text.  Only elements in TEXT_TAGS qualify.
 * Generic containers (div, section, etc.) with text are NOT pure text
 * leaves — they become frames with a text child inside.
 */
function isPureTextElement(el: Element): boolean {
  // The element itself must be a text-oriented tag
  if (!TEXT_TAGS.has(el.tagName)) return false;

  // If it has element children, they must ALL be inline text wrappers
  // (e.g. <p>Hello <strong>world</strong></p>)
  // Allow nested inline tags: <a><strong>Sign up</strong></a>
  if (el.children.length > 0) {
    return isAllInlineText(el);
  }

  // No child elements — it's a text leaf if it has text content
  const text = el.textContent?.trim() || "";
  return text.length > 0;
}

/**
 * Recursively check that all descendant elements are inline text wrappers.
 * This allows nested structures like <a><strong>text</strong></a>.
 */
function isAllInlineText(el: Element): boolean {
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i];
    if (!INLINE_TEXT_TAGS.has(child.tagName)) return false;
    // Recurse into nested inline wrappers
    if (child.children.length > 0 && !isAllInlineText(child)) return false;
  }
  return true;
}

/**
 * Check if an element has visual container styling (background, border, etc.)
 * that warrants creating a separate frame for it.
 */
function hasContainerStyling(cs: CSSStyleDeclaration): boolean {
  const bg = cs.backgroundColor;
  const hasBg = bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";

  const bgImage = cs.backgroundImage;
  const hasBgImage = bgImage && bgImage !== "none";

  const borderWidth = parseFloat(cs.borderTopWidth) || 0;
  const borderStyle = cs.borderTopStyle;
  const hasBorder = borderStyle !== "none" && borderWidth > 0;

  const borderRadius = parseFloat(cs.borderTopLeftRadius) || 0;
  const hasBorderRadius = borderRadius > 0;

  const padding = (parseFloat(cs.paddingTop) || 0) +
    (parseFloat(cs.paddingRight) || 0) +
    (parseFloat(cs.paddingBottom) || 0) +
    (parseFloat(cs.paddingLeft) || 0);
  const hasPadding = padding > 0;

  return !!(hasBg || hasBgImage || hasBorder || hasBorderRadius || hasPadding);
}

/**
 * Extract direct text content from an element (text nodes that are
 * direct children, not inside child elements).
 */
/**
 * Measure the natural single-line width of text content inside an element.
 * Creates a temporary off-screen <span> with the same font properties but
 * white-space:nowrap so we get the intrinsic width without wrapping.
 * This avoids the Range problem where block elements constrain the range
 * rect to their own layout width.
 */
function measureNaturalTextWidth(el: Element): number {
  try {
    const text = el.textContent?.trim() || "";
    if (!text) return 0;

    const doc = el.ownerDocument;
    const win = doc.defaultView;
    if (!win) return 0;

    const cs = win.getComputedStyle(el);
    const probe = doc.createElement("span");
    probe.style.cssText =
      `position:absolute;visibility:hidden;pointer-events:none;` +
      `white-space:nowrap;` +
      `font:${cs.font};` +
      `letter-spacing:${cs.letterSpacing};` +
      `word-spacing:${cs.wordSpacing};` +
      `text-transform:${cs.textTransform};`;
    probe.textContent = text;
    doc.body.appendChild(probe);
    const w = Math.ceil(probe.getBoundingClientRect().width);
    probe.remove();
    return w;
  } catch {
    return 0;
  }
}

function getDirectTextContent(el: Element): string {
  let text = "";
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i];
    if (node.nodeType === 3 /* TEXT_NODE */) {
      text += node.textContent || "";
    }
  }
  return text.trim();
}

/** Get the child elements that are visible and meaningful */
function getVisibleChildElements(el: Element): Element[] {
  const children: Element[] = [];
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i];
    if (SKIP_TAGS.has(child.tagName)) continue;
    children.push(child);
  }
  return children;
}

/** Generate a human-readable name for a DOM element */
function getElementName(el: Element, depth: number): string {
  // Use data-make-name if available (from instrumented code)
  const makeName = el.getAttribute("data-make-name");
  if (makeName) return makeName;

  // Use id attribute
  const elId = el.getAttribute("id");
  if (elId) return elId;

  // Use meaningful class names (skip Tailwind utility classes and CSS module hashes)
  const className = el.getAttribute("class") || "";
  const meaningfulClass = className
    .split(/\s+/)
    .find((c) => c.length > 2 && !c.startsWith("__") && !/^[a-z]{1,2}-/.test(c));
  if (meaningfulClass) return meaningfulClass;

  // Use tag + aria-label
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  const tag = el.tagName.toLowerCase();

  // Use direct text content for a compact, human-readable name
  const directText = Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3 /* TEXT_NODE */)
    .map((n) => n.textContent?.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  if (directText && directText.length <= 30) {
    return directText;
  }

  // Use first text descendant to contextualize container elements
  const textChild = el.querySelector("span, p, h1, h2, h3, h4, h5, h6, label, a, button");
  if (textChild) {
    const text = textChild.textContent?.trim();
    if (text && text.length > 0 && text.length <= 30) {
      return `${tag}-${text.replace(/\s+/g, "-").toLowerCase()}`;
    }
  }

  // Fall back to tag + depth for generic containers
  if (tag === "div" || tag === "section" || tag === "main" || tag === "article" || tag === "nav" || tag === "header" || tag === "footer") {
    return `${tag}-${depth}`;
  }

  return tag;
}

function parseFontWeight(raw: string): number {
  const num = parseInt(raw, 10);
  if (!isNaN(num)) return num;
  switch (raw) {
    case "bold":
      return 700;
    case "bolder":
      return 700;
    case "lighter":
      return 300;
    default:
      return 400;
  }
}

function parseFontFamily(raw: string): string {
  if (!raw || typeof raw !== "string") return "Inter, sans-serif";

  // Take the first font family, strip quotes
  const first = raw.split(",")[0]?.trim().replace(/["']/g, "") || "Inter";

  // Map known font names to their full CSS font-family strings that match
  // the TypographyPanel Select options
  const fontFamilyMap: Record<string, string> = {
    "Inter": "Inter, sans-serif",
    "Georgia": "Georgia, serif",
    "Times New Roman": "'Times New Roman', serif",
    "Courier New": "'Courier New', monospace",
    "Monaco": "Monaco, monospace",
    "Helvetica Neue": "'Helvetica Neue', sans-serif",
    "Arial": "Arial, sans-serif",
  };

  // Map generic system fonts and CSS defaults to Inter
  const generics = new Set([
    "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI",
    "Roboto", "sans-serif", "serif",
    "monospace", "ui-sans-serif", "ui-serif", "ui-monospace",
    "Times", "Courier",
  ]);

  if (generics.has(first)) return "Inter, sans-serif";
  if (fontFamilyMap[first]) return fontFamilyMap[first];

  // For unknown fonts, return with sans-serif fallback
  return `${first}, sans-serif`;
}

function parseTextAlign(raw: string): "left" | "center" | "right" {
  switch (raw) {
    case "center":
      return "center";
    case "right":
    case "end":
      return "right";
    default:
      return "left";
  }
}

function parseLineHeight(
  cs: CSSStyleDeclaration,
  fontSize: number
): { value: number; unit: "px" | "%" } {
  const raw = cs.lineHeight;
  if (raw === "normal") {
    return { value: round2(fontSize * 1.2), unit: "px" };
  }
  const px = parseFloat(raw);
  if (!isNaN(px)) {
    return { value: round2(px), unit: "px" };
  }
  return { value: round2(fontSize * 1.2), unit: "px" };
}

function parseLetterSpacing(cs: CSSStyleDeclaration): number {
  const raw = cs.letterSpacing;
  if (raw === "normal") return 0;
  return parseFloat(raw) || 0;
}

/** Parse an rgba/rgb CSS color string into components */
function parseRgba(color: string): { r: number; g: number; b: number; a: number } | null {
  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbaMatch = color.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/
  );
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1], 10),
      g: parseInt(rgbaMatch[2], 10),
      b: parseInt(rgbaMatch[3], 10),
      a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1,
    };
  }

  // Modern CSS color-4 syntax: rgb(r g b / a)
  const modernMatch = color.match(
    /rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+%?))?\s*\)/
  );
  if (modernMatch) {
    let a = 1;
    if (modernMatch[4] !== undefined) {
      a = modernMatch[4].endsWith("%")
        ? parseFloat(modernMatch[4]) / 100
        : parseFloat(modernMatch[4]);
    }
    return {
      r: parseInt(modernMatch[1], 10),
      g: parseInt(modernMatch[2], 10),
      b: parseInt(modernMatch[3], 10),
      a,
    };
  }

  return null;
}

/** Convert an rgb/rgba CSS color string to a hex string */
function rgbToHex(color: string): string {
  const parsed = parseRgba(color);
  if (!parsed) {
    // Might already be hex
    if (color.startsWith("#")) return color;
    return "#000000";
  }

  const { r, g, b } = parsed;
  const hex = (
    (1 << 24) +
    (Math.min(255, Math.max(0, r)) << 16) +
    (Math.min(255, Math.max(0, g)) << 8) +
    Math.min(255, Math.max(0, b))
  )
    .toString(16)
    .slice(1);

  return `#${hex}`;
}

// ─── Auto-layout sync trigger after paste ───────────────────────────

/**
 * Trigger auto-layout sync for all auto-layout frames in a set of objects.
 *
 * When objects are pasted via `objects.pasted`, the auto-layout engine
 * doesn't automatically reposition children. This function manually
 * triggers the sync with the same two-pass approach used by
 * `applyDesignOperations` (150ms + 500ms).
 */
export function triggerAutoLayoutForObjects(objects: CanvasObject[]): void {
  // Dynamically import to avoid circular dependencies
  // (autoLayout.ts → store.ts → ... → domToDesign.ts)
  const framesNeedingSync = new Set<string>();

  for (const obj of objects) {
    if (obj.type === "frame") {
      const props = obj.properties as FrameProperties;
      if (props?.autoLayout && props.autoLayout.mode !== "none") {
        framesNeedingSync.add(obj.id);
      }
    }
    // Also sync the parent frame if the child is inside an auto-layout frame
    if (obj.parentId) {
      const parent = objects.find(o => o.id === obj.parentId);
      if (parent?.type === "frame") {
        const parentProps = parent.properties as FrameProperties;
        if (parentProps?.autoLayout && parentProps.autoLayout.mode !== "none") {
          framesNeedingSync.add(parent.id);
        }
      }
    }
  }

  if (framesNeedingSync.size === 0) return;

  const runSync = () => {
    // Import lazily to avoid circular deps
    try {
      const { useAppStore } = require("@/core/state/store");
      const { triggerImmediateAutoLayoutSync } = require("@/core/utils/autoLayout");
      const currentState = useAppStore.getState();
      for (const frameId of framesNeedingSync) {
        triggerImmediateAutoLayoutSync(
          frameId,
          currentState.objects,
          currentState.viewport,
          currentState.dispatch
        );
      }
    } catch (err) {
      console.error("[triggerAutoLayoutForObjects] Error:", err);
    }
  };

  // Two passes — same pattern as designOperations.ts:
  // First pass: DOM should be rendered with new objects
  setTimeout(runSync, 150);
  // Second pass: catches late-settling text measurements
  setTimeout(runSync, 500);
}

// ─── Live DOM extraction ────────────────────────────────────────────

/**
 * Walk an existing live DOM document (e.g. the Make editor's same-origin
 * preview iframe) and return canvas objects. This captures the CURRENT
 * interactive state of the component (typed inputs, toggled states, etc.)
 * rather than re-rendering from source code.
 */
export function generateDesignFromLiveDocument(
  doc: Document,
  originX: number,
  originY: number,
  clampSize?: { width: number; height: number }
): CanvasObject[] {
  const rootEl =
    doc.querySelector("#root > *") ||
    doc.body.firstElementChild;

  if (!rootEl) return [];

  const { objects, flexMetaMap } = domToDesignWithMeta(
    doc, rootEl, originX, originY, clampSize
  );
  refineAutoLayoutSizing(objects, flexMetaMap);
  wrapChildMargins(objects, flexMetaMap);
  return objects;
}

// ─── Temporary iframe helper for headless DOM extraction ────────────

/**
 * Render Make code in a hidden same-origin iframe, walk the DOM,
 * and return canvas objects. Cleans up the iframe automatically.
 *
 * This is used by the context menu (which doesn't have access to
 * the Make editor's same-origin preview iframe).
 */
export async function generateDesignFromCode(
  code: string,
  originX: number,
  originY: number,
  buildSrcdoc: (code: string) => string,
  clampSize?: { width: number; height: number }
): Promise<CanvasObject[]> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;left:-9999px;top:-9999px;width:1200px;height:800px;visibility:hidden;pointer-events:none;";
    iframe.sandbox.add("allow-scripts", "allow-same-origin");

    const srcdoc = buildSrcdoc(code);
    iframe.srcdoc = srcdoc;

    let resolved = false;

    const cleanup = () => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };

    // Timeout fallback — don't hang forever
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve([]);
      }
    }, 8000);

    iframe.onload = () => {
      // Wait a bit for React/Tailwind to fully render
      setTimeout(() => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);

        try {
          const iframeDoc = iframe.contentDocument;
          if (!iframeDoc) {
            cleanup();
            resolve([]);
            return;
          }

          const rootEl =
            iframeDoc.querySelector("#root > *") ||
            iframeDoc.body.firstElementChild;

          if (!rootEl) {
            cleanup();
            resolve([]);
            return;
          }

          const { objects, flexMetaMap } = domToDesignWithMeta(
            iframeDoc, rootEl, originX, originY, clampSize
          );
          refineAutoLayoutSizing(objects, flexMetaMap);
          wrapChildMargins(objects, flexMetaMap);
          cleanup();
          resolve(objects);
        } catch (err) {
          console.error("Generate design from code failed:", err);
          cleanup();
          resolve([]);
        }
      }, 2000); // Give React + Tailwind CDN time to render
    };

    document.body.appendChild(iframe);
  });
}

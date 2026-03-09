"use client";

import { InspectorSelection } from "@/components/NodePropertiesPanel";
import { buildInspectorSrcdoc } from "@/core/utils/sameOriginPreview";
import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────────────

interface SameOriginInspectPreviewProps {
  /** Instrumented code (with data-make-node attributes) */
  code: string;
  /** Extra npm deps to include in the import map */
  extraDeps?: Record<string, string>;
  /** Whether inspect mode is active (handlers attached, overlays enabled) */
  active?: boolean;
  /** Called when user clicks an element in the preview */
  onSelect: (selection: InspectorSelection) => void;
  /** Called when user presses Delete/Backspace on a selected element */
  onDelete?: (nodeId: number) => void;
  /** Called when user drags an element to reorder it */
  onMove?: (sourceNodeId: number, targetNodeId: number, position: "before" | "after") => void;
  /** Currently selected node ID (for Tab cycling, Delete, and persistent overlay) */
  selectedNodeId?: number | null;
  /** Called when the preview encounters a runtime or compilation error */
  onError?: (errorMessage: string) => void;
  /** When true, clicks toggle selection instead of replacing it (no drag support) */
  multiSelect?: boolean;
  /** Array of currently selected node IDs for multi-select overlay rendering */
  selectedNodeIds?: number[];
}

/** Imperative handle exposed via ref for direct DOM patching */
export interface SameOriginInspectPreviewHandle {
  /**
   * Patch an element directly in the iframe DOM (no reload).
   * Returns true if the patch was applied successfully.
   */
  patchElement: (nodeId: number, patches: { className?: string; textContent?: string }) => boolean;
  /** Force a full iframe reload with the latest code */
  reload: () => void;
  /** Get the iframe's Document (same-origin). Returns null if not available. */
  getIframeDocument: () => Document | null;
}

// ─── Component ───────────────────────────────────────────────────────

const SameOriginInspectPreview = React.forwardRef<SameOriginInspectPreviewHandle, SameOriginInspectPreviewProps>(
  function SameOriginInspectPreview({
    code,
    extraDeps = {},
    active = true,
    onSelect,
    onDelete,
    onMove,
    selectedNodeId,
    onError,
    multiSelect = false,
    selectedNodeIds,
  }, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Hover overlay refs
  const hoverHighlightRef = useRef<HTMLDivElement>(null);
  const hoverLabelRef = useRef<HTMLDivElement>(null);

  // Persistent selection overlay refs
  const selectionHighlightRef = useRef<HTMLDivElement>(null);
  const selectionLabelRef = useRef<HTMLDivElement>(null);

  // Drag ghost + drop indicator refs
  const dragGhostRef = useRef<HTMLDivElement>(null);
  const dropIndicatorRef = useRef<HTMLDivElement>(null);

  // Drag state ref (mutable, no re-renders needed during drag)
  const dragStateRef = useRef<{
    nodeId: number;
    element: Element;
    startX: number;
    startY: number;
    dragging: boolean;
    dropTarget: { nodeId: number; element: Element; position: "before" | "after" } | null;
    isReclick?: boolean;
  } | null>(null);

  // Track the actual DOM element the user clicked (to disambiguate .map() siblings)
  const selectedElementRef = useRef<Element | null>(null);

  const multiSelectRef = useRef(multiSelect);
  multiSelectRef.current = multiSelect;
  const selectedNodeIdsRef = useRef<number[]>(selectedNodeIds ?? []);
  selectedNodeIdsRef.current = selectedNodeIds ?? [];

  // Stable refs for values used in handlers (avoids effect re-runs)
  const selectedNodeIdRef = useRef<number | null>(selectedNodeId ?? null);
  const onDeleteRef = useRef(onDelete);
  const onMoveRef = useRef(onMove);
  useEffect(() => { selectedNodeIdRef.current = selectedNodeId ?? null; }, [selectedNodeId]);
  useEffect(() => { onDeleteRef.current = onDelete; }, [onDelete]);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);

  // Load counter — incremented on every iframe load so the effect always re-runs
  const [loadCount, setLoadCount] = useState(0);

  // ─── State-based srcdoc (NOT derived from code prop) ─────────────
  // This lets us skip iframe reloads when we apply DOM patches directly.
  const latestCodeRef = useRef(code);
  latestCodeRef.current = code;

  // Flag: when true, skip the next srcdoc rebuild triggered by a code change
  const patchAppliedRef = useRef(false);

  const [srcdoc, setSrcdoc] = useState(() => buildInspectorSrcdoc(code, extraDeps));

  // When code or deps change: rebuild srcdoc UNLESS we just applied a DOM patch
  const prevCodeRef = useRef(code);
  const prevDepsKeyRef = useRef(JSON.stringify(extraDeps));

  useEffect(() => {
    const depsKey = JSON.stringify(extraDeps);
    const codeChanged = code !== prevCodeRef.current;
    const depsChanged = depsKey !== prevDepsKeyRef.current;

    prevCodeRef.current = code;
    prevDepsKeyRef.current = depsKey;

    // Deps changed → always full reload (import map may differ)
    if (depsChanged) {
      patchAppliedRef.current = false;
      setSrcdoc(buildInspectorSrcdoc(code, extraDeps));
      return;
    }

    // Code changed → skip reload if we just patched the DOM
    if (codeChanged) {
      if (patchAppliedRef.current) {
        patchAppliedRef.current = false;
        return; // DOM already reflects the change — no reload needed
      }
      setSrcdoc(buildInspectorSrcdoc(code, extraDeps));
    }
  }, [code, extraDeps]);

  // ─── Listen for error messages from the iframe ─────────────────────
  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (ev.data?.type === "make-preview-error" && ev.data.error && onErrorRef.current) {
        onErrorRef.current(ev.data.error);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // ─── Imperative handle for DOM patching ────────────────────────────
  useImperativeHandle(ref, () => ({
    patchElement(nodeId: number, patches: { className?: string; textContent?: string }) {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return false;

      // Prefer the stored element ref to correctly target .map() siblings
      const storedEl = selectedElementRef.current;
      const el =
        storedEl?.isConnected && storedEl.getAttribute("data-make-node") === String(nodeId)
          ? storedEl
          : doc.querySelector(`[data-make-node="${nodeId}"]`);
      if (!el) return false;

      if (patches.className !== undefined) {
        el.className = patches.className;
      }
      if (patches.textContent !== undefined) {
        for (const child of el.childNodes) {
          if (child.nodeType === 3 /* TEXT_NODE */) {
            child.textContent = patches.textContent;
            break;
          }
        }
      }

      // Update the selection overlay position (element may have resized)
      const selHL = selectionHighlightRef.current;
      const selLbl = selectionLabelRef.current;
      if (selHL && selLbl && selectedNodeIdRef.current === nodeId && iframeRef.current) {
        const elRect = el.getBoundingClientRect();
        const iframeRect = iframeRef.current.getBoundingClientRect();
        selHL.style.left = `${iframeRect.left + elRect.left}px`;
        selHL.style.top = `${iframeRect.top + elRect.top}px`;
        selHL.style.width = `${elRect.width}px`;
        selHL.style.height = `${elRect.height}px`;
      }

      // Set flag so the upcoming code-prop change skips the srcdoc rebuild
      patchAppliedRef.current = true;
      return true;
    },

    reload() {
      setSrcdoc(buildInspectorSrcdoc(latestCodeRef.current, extraDeps));
    },

    getIframeDocument() {
      return iframeRef.current?.contentDocument ?? null;
    },
  }), [extraDeps]);

  // Track iframe load
  const handleLoad = useCallback(() => {
    setLoadCount((c) => c + 1);
  }, []);

  // ─── Update persistent selection overlay when selectedNodeId changes ──
  useEffect(() => {
    if (loadCount === 0 || !active) return;
    const iframe = iframeRef.current;
    const selHighlight = selectionHighlightRef.current;
    const selLabel = selectionLabelRef.current;
    if (!iframe || !selHighlight || !selLabel) return;

    if (selectedNodeId == null) {
      selHighlight.style.display = "none";
      selLabel.style.display = "none";
      return;
    }

    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) return;

    // Prefer the actual clicked element ref (disambiguates .map() siblings sharing the same node ID).
    // Fall back to querySelector if the ref is stale or from a different node.
    let el: Element | null = null;
    const storedEl = selectedElementRef.current;
    if (
      storedEl &&
      storedEl.isConnected &&
      storedEl.getAttribute("data-make-node") === String(selectedNodeId)
    ) {
      el = storedEl;
    } else {
      el = iframeDoc.querySelector(`[data-make-node="${selectedNodeId}"]`);
    }
    if (!el) {
      selHighlight.style.display = "none";
      selLabel.style.display = "none";
      return;
    }

    const elRect = el.getBoundingClientRect();
    const iframeRect = iframe.getBoundingClientRect();

    selHighlight.style.left = `${iframeRect.left + elRect.left}px`;
    selHighlight.style.top = `${iframeRect.top + elRect.top}px`;
    selHighlight.style.width = `${elRect.width}px`;
    selHighlight.style.height = `${elRect.height}px`;
    selHighlight.style.display = "block";

    const name = el.getAttribute("data-make-name") || el.tagName.toLowerCase();
    selLabel.textContent = name;
    selLabel.style.left = `${iframeRect.left + elRect.left}px`;
    selLabel.style.top = `${Math.max(0, iframeRect.top + elRect.top - 20)}px`;
    selLabel.style.display = "block";
  }, [selectedNodeId, loadCount, active]);

  // ─── Update multi-select highlights via in-iframe CSS classes ────────
  useEffect(() => {
    if (loadCount === 0 || !active || !multiSelect) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) return;

    // Remove all existing selection classes
    iframeDoc.querySelectorAll(".__make-extract-selected").forEach((el) => {
      el.classList.remove("__make-extract-selected");
    });

    if (!selectedNodeIds || selectedNodeIds.length === 0) return;

    for (const nodeId of selectedNodeIds) {
      const el = iframeDoc.querySelector(`[data-make-node="${nodeId}"]`);
      if (el) {
        el.classList.add("__make-extract-selected");
      }
    }
  }, [selectedNodeIds, loadCount, active, multiSelect]);

  // ─── Hide all overlays when going inactive ──────────────────────────
  useEffect(() => {
    if (!active) {
      if (hoverHighlightRef.current) hoverHighlightRef.current.style.display = "none";
      if (hoverLabelRef.current) hoverLabelRef.current.style.display = "none";
      if (selectionHighlightRef.current) selectionHighlightRef.current.style.display = "none";
      if (selectionLabelRef.current) selectionLabelRef.current.style.display = "none";
      if (dragGhostRef.current) dragGhostRef.current.style.display = "none";
      if (dropIndicatorRef.current) dropIndicatorRef.current.style.display = "none";
      // Clean up in-iframe highlight classes
      const iframeDoc = iframeRef.current?.contentDocument;
      if (iframeDoc) {
        iframeDoc.querySelectorAll(".__make-extract-hover, .__make-extract-selected").forEach((el) => {
          el.classList.remove("__make-extract-hover", "__make-extract-selected");
        });
      }
    }
  }, [active]);

  // ─── Direct DOM access: hover highlighting + interactions ───────────
  useEffect(() => {
    if (loadCount === 0 || !iframeRef.current || !active) return;

    const iframe = iframeRef.current;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cleanedUp = false;

    function attach() {
      if (cleanedUp) return;

      const iframeDoc = iframe.contentDocument;
      if (!iframeDoc || !iframeDoc.body) {
        retryTimer = setTimeout(attach, 100);
        return;
      }

      const hasNodes = iframeDoc.querySelector("[data-make-node]");
      if (!hasNodes) {
        retryTimer = setTimeout(attach, 200);
        return;
      }

      // ─── Block ALL interactive events ─────
      // NOTE: pointerdown, pointermove, pointerup are NOT blocked — we use them for
      // selection and drag-and-drop.
      const blockedEvents = [
        "mousedown", "mouseup",
        "touchstart", "touchend", "click", "dblclick",
        "submit", "focus", "dragstart",
      ];
      function blockEvent(e: Event) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
      for (const evt of blockedEvents) {
        iframeDoc.addEventListener(evt, blockEvent, true);
      }

      const isMulti = multiSelectRef.current;

      const inspectStyle = iframeDoc.createElement("style");
      inspectStyle.textContent = `
        *, *::before, *::after {
          cursor: default !important;
          pointer-events: auto !important;
        }
        ${isMulti ? `
        .__make-extract-hover {
          outline: 1.5px dashed #3b82f6 !important;
          outline-offset: -1.5px;
        }
        .__make-extract-selected {
          outline: 2px solid #3b82f6 !important;
          outline-offset: -2px;
          background-color: rgba(59,130,246,0.06) !important;
        }
        ` : ""}
      `;
      iframeDoc.head.appendChild(inspectStyle);

      const hoverHL = hoverHighlightRef.current;
      const hoverLbl = hoverLabelRef.current;

      let currentHoveredEl: Element | null = null;

      function findMakeNode(el: Element | null): Element | null {
        while (el && el !== iframeDoc!.body && el !== iframeDoc!.documentElement) {
          if (el.hasAttribute("data-make-node")) return el;
          el = el.parentElement;
        }
        return null;
      }

      function showHover(el: Element) {
        if (isMulti) {
          if (currentHoveredEl && currentHoveredEl !== el) {
            currentHoveredEl.classList.remove("__make-extract-hover");
          }
          el.classList.add("__make-extract-hover");
          currentHoveredEl = el;
          return;
        }
        if (!hoverHL || !hoverLbl || !iframe) return;
        const elRect = el.getBoundingClientRect();
        const iframeRect = iframe.getBoundingClientRect();

        hoverHL.style.left = `${iframeRect.left + elRect.left}px`;
        hoverHL.style.top = `${iframeRect.top + elRect.top}px`;
        hoverHL.style.width = `${elRect.width}px`;
        hoverHL.style.height = `${elRect.height}px`;
        hoverHL.style.display = "block";

        const name = el.getAttribute("data-make-name") || el.tagName.toLowerCase();
        hoverLbl.textContent = name;
        hoverLbl.style.left = `${iframeRect.left + elRect.left}px`;
        hoverLbl.style.top = `${Math.max(0, iframeRect.top + elRect.top - 20)}px`;
        hoverLbl.style.display = "block";
      }

      function hideHover() {
        if (isMulti) {
          if (currentHoveredEl) {
            currentHoveredEl.classList.remove("__make-extract-hover");
            currentHoveredEl = null;
          }
          return;
        }
        if (hoverHL) hoverHL.style.display = "none";
        if (hoverLbl) hoverLbl.style.display = "none";
      }

      function showSelection(el: Element) {
        if (isMulti) return;
        const selHL = selectionHighlightRef.current;
        const selLbl = selectionLabelRef.current;
        if (!selHL || !selLbl || !iframe) return;
        const elRect = el.getBoundingClientRect();
        const iframeRect = iframe.getBoundingClientRect();

        selHL.style.left = `${iframeRect.left + elRect.left}px`;
        selHL.style.top = `${iframeRect.top + elRect.top}px`;
        selHL.style.width = `${elRect.width}px`;
        selHL.style.height = `${elRect.height}px`;
        selHL.style.display = "block";

        const name = el.getAttribute("data-make-name") || el.tagName.toLowerCase();
        selLbl.textContent = name;
        selLbl.style.left = `${iframeRect.left + elRect.left}px`;
        selLbl.style.top = `${Math.max(0, iframeRect.top + elRect.top - 20)}px`;
        selLbl.style.display = "block";
      }

      function emitSelect(target: Element) {
        if (!multiSelectRef.current) {
          showSelection(target);
        }
        selectedElementRef.current = target;

        const nodeId = parseInt(target.getAttribute("data-make-node") || "0", 10);
        const name = target.getAttribute("data-make-name") || target.tagName.toLowerCase();
        const className = target.getAttribute("class") || "";

        let textContent = "";
        for (let i = 0; i < target.childNodes.length; i++) {
          if (target.childNodes[i].nodeType === 3) {
            textContent += target.childNodes[i].textContent || "";
          }
        }

        const rect = target.getBoundingClientRect();
        onSelect({
          nodeId,
          name,
          className,
          textContent: textContent.trim(),
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        });
      }

      // ─── Drag helpers (all coordinates in parent-window space) ──────
      /** Convert iframe-relative coords → parent-window coords */
      function toWindowCoords(iframeX: number, iframeY: number) {
        const r = iframe.getBoundingClientRect();
        return { wx: r.left + iframeX, wy: r.top + iframeY };
      }

      function showDragGhost(name: string, wx: number, wy: number) {
        const ghost = dragGhostRef.current;
        if (!ghost) return;
        ghost.textContent = `‹${name}›`;
        ghost.style.left = `${wx + 12}px`;
        ghost.style.top = `${wy + 12}px`;
        ghost.style.display = "block";
      }

      function updateDragGhost(wx: number, wy: number) {
        const ghost = dragGhostRef.current;
        if (ghost) {
          ghost.style.left = `${wx + 12}px`;
          ghost.style.top = `${wy + 12}px`;
        }
      }

      function hideDragGhost() {
        const ghost = dragGhostRef.current;
        if (ghost) ghost.style.display = "none";
      }

      /** Check if an element's parent uses horizontal flex layout */
      function isParentHorizontalFlex(el: Element): boolean {
        const parent = el.parentElement;
        if (!parent) return false;
        const style = iframeDoc!.defaultView!.getComputedStyle(parent);
        const display = style.display;
        if (display !== "flex" && display !== "inline-flex") return false;
        const dir = style.flexDirection;
        return dir === "row" || dir === "row-reverse";
      }

      function showDropIndicator(el: Element, position: "before" | "after", horizontal: boolean) {
        const indicator = dropIndicatorRef.current;
        if (!indicator || !iframe) return;
        const elRect = el.getBoundingClientRect();
        const iframeRect = iframe.getBoundingClientRect();

        if (horizontal) {
          // Vertical line for horizontal containers
          const x = position === "before" ? elRect.left : elRect.right;
          indicator.style.left = `${iframeRect.left + x - 1}px`;
          indicator.style.top = `${iframeRect.top + elRect.top - 2}px`;
          indicator.style.width = `2px`;
          indicator.style.height = `${elRect.height + 4}px`;
        } else {
          // Horizontal line for vertical containers (original behavior)
          const y = position === "before" ? elRect.top : elRect.bottom;
          indicator.style.left = `${iframeRect.left + elRect.left - 2}px`;
          indicator.style.top = `${iframeRect.top + y - 1}px`;
          indicator.style.width = `${elRect.width + 4}px`;
          indicator.style.height = `2px`;
        }
        indicator.style.display = "block";
      }

      function hideDropIndicator() {
        const indicator = dropIndicatorRef.current;
        if (indicator) indicator.style.display = "none";
      }

      // ─── Unified drag move/end (parent-window coords) ──────
      function handleDragMove(wx: number, wy: number) {
        const drag = dragStateRef.current;
        if (!drag) return;

        const dx = wx - drag.startX;
        const dy = wy - drag.startY;

        if (!drag.dragging && Math.sqrt(dx * dx + dy * dy) > 5) {
          drag.dragging = true;
          const name = drag.element.getAttribute("data-make-name") || "element";
          showDragGhost(name, wx, wy);
          // Hide selection overlay during drag
          const selHL = selectionHighlightRef.current;
          const selLbl = selectionLabelRef.current;
          if (selHL) selHL.style.display = "none";
          if (selLbl) selLbl.style.display = "none";
          hideHover();
        }

        if (!drag.dragging) return;

        updateDragGhost(wx, wy);

        // Convert to iframe-relative for elementFromPoint
        const iframeRect = iframe.getBoundingClientRect();
        const ix = wx - iframeRect.left;
        const iy = wy - iframeRect.top;

        if (ix < 0 || iy < 0 || ix > iframeRect.width || iy > iframeRect.height) {
          hideDropIndicator();
          drag.dropTarget = null;
          return;
        }

        const elUnderCursor = iframeDoc!.elementFromPoint(ix, iy);
        const target = findMakeNode(elUnderCursor);

        if (!target || parseInt(target.getAttribute("data-make-node") || "0", 10) === drag.nodeId) {
          hideDropIndicator();
          drag.dropTarget = null;
          return;
        }

        // Determine before/after based on cursor position within element,
        // using the appropriate axis depending on whether the parent is a horizontal flex container
        const targetRect = target.getBoundingClientRect();
        const horizontal = isParentHorizontalFlex(target);
        let position: "before" | "after";
        if (horizontal) {
          const midX = targetRect.left + targetRect.width / 2;
          position = ix < midX ? "before" : "after";
        } else {
          const midY = targetRect.top + targetRect.height / 2;
          position = iy < midY ? "before" : "after";
        }
        const targetNodeId = parseInt(target.getAttribute("data-make-node") || "0", 10);

        showDropIndicator(target, position, horizontal);
        drag.dropTarget = { nodeId: targetNodeId, element: target, position };
      }

      function handleDragEnd() {
        const drag = dragStateRef.current;
        if (drag?.dragging && drag.dropTarget && onMoveRef.current) {
          onMoveRef.current(drag.nodeId, drag.dropTarget.nodeId, drag.dropTarget.position);
        }

        // Deselect on re-click only if no drag occurred
        if (drag?.isReclick && !drag.dragging) {
          selectedElementRef.current = null;
          selectedNodeIdRef.current = null;
          hideHover();
          const selHL = selectionHighlightRef.current;
          const selLbl = selectionLabelRef.current;
          if (selHL) selHL.style.display = "none";
          if (selLbl) selLbl.style.display = "none";
          onSelect({ nodeId: -1, name: "", className: "", textContent: "", rect: { left: 0, top: 0, width: 0, height: 0 } });
        }

        dragStateRef.current = null;
        hideDragGhost();
        hideDropIndicator();
        removeDragListeners();
      }

      // ─── Iframe-level drag listeners (events inside iframe) ──────
      function handleIframePointerMove(e: PointerEvent) {
        const { wx, wy } = toWindowCoords(e.clientX, e.clientY);
        handleDragMove(wx, wy);
      }
      function handleIframePointerUp(_e: PointerEvent) {
        handleDragEnd();
      }

      // ─── Window-level drag listeners (events outside iframe) ──────
      function handleWindowPointerMove(e: PointerEvent) {
        handleDragMove(e.clientX, e.clientY);
      }
      function handleWindowPointerUp(_e: PointerEvent) {
        handleDragEnd();
      }

      function addDragListeners() {
        iframeDoc!.addEventListener("pointermove", handleIframePointerMove, true);
        iframeDoc!.addEventListener("pointerup", handleIframePointerUp, true);
        window.addEventListener("pointermove", handleWindowPointerMove, true);
        window.addEventListener("pointerup", handleWindowPointerUp, true);
      }
      function removeDragListeners() {
        iframeDoc!.removeEventListener("pointermove", handleIframePointerMove, true);
        iframeDoc!.removeEventListener("pointerup", handleIframePointerUp, true);
        window.removeEventListener("pointermove", handleWindowPointerMove, true);
        window.removeEventListener("pointerup", handleWindowPointerUp, true);
      }

      // ─── Mouse handlers ──────
      function handleMouseMove(e: MouseEvent) {
        // Skip hover when dragging
        if (dragStateRef.current?.dragging) return;

        const target = findMakeNode(e.target as Element);
        if (target) {
          // Compare actual DOM elements (not node IDs) to correctly handle
          // .map()-generated siblings that share the same data-make-node ID
          if (target === selectedElementRef.current) {
            hideHover();
          } else {
            showHover(target);
          }
          iframeDoc!.body.style.cursor = "default";
        } else {
          hideHover();
        }
      }

      function handlePointerDown(e: PointerEvent) {
        e.preventDefault();
        e.stopPropagation();

        const target = findMakeNode(e.target as Element);
        if (!target) return;

        if (multiSelectRef.current) {
          hideHover();
          emitSelect(target);
          return;
        }

        const isReclick = target === selectedElementRef.current;

        if (!isReclick) {
          hideHover();
          emitSelect(target);
        }

        const nodeId = parseInt(target.getAttribute("data-make-node") || "0", 10);
        const { wx, wy } = toWindowCoords(e.clientX, e.clientY);
        dragStateRef.current = {
          nodeId,
          element: target,
          startX: wx,
          startY: wy,
          dragging: false,
          dropTarget: null,
          isReclick,
        };

        addDragListeners();
      }

      function handleMouseLeave() {
        if (!dragStateRef.current?.dragging) hideHover();
      }

      // ─── Keyboard: Tab to cycle, Delete/Backspace to remove ──────
      function handleKeyDown(e: KeyboardEvent) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") return;

        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();

          const allNodes = Array.from(iframeDoc!.querySelectorAll("[data-make-node]"));
          if (allNodes.length === 0) return;

          const currentIdx = selectedNodeIdRef.current != null
            ? allNodes.findIndex((el) => el.getAttribute("data-make-node") === String(selectedNodeIdRef.current))
            : -1;

          const direction = e.shiftKey ? -1 : 1;
          const nextIdx = currentIdx === -1 ? 0 : (currentIdx + direction + allNodes.length) % allNodes.length;
          hideHover();
          emitSelect(allNodes[nextIdx]);
        }

        if (e.key === "Backspace" || e.key === "Delete") {
          if (selectedNodeIdRef.current != null && onDeleteRef.current) {
            e.preventDefault();
            e.stopPropagation(); // Prevent global shortcut from deleting the entire Make object
            onDeleteRef.current(selectedNodeIdRef.current);
          }
        }

        if (e.key === "Escape") {
          hideHover();
          selectedElementRef.current = null;
          const selHL = selectionHighlightRef.current;
          const selLbl = selectionLabelRef.current;
          if (selHL) selHL.style.display = "none";
          if (selLbl) selLbl.style.display = "none";
        }
      }

      // ─── Re-position selection overlay after attach if something is selected ──
      if (selectedNodeIdRef.current != null) {
        const storedEl = selectedElementRef.current;
        const selectedEl =
          storedEl?.isConnected && storedEl.getAttribute("data-make-node") === String(selectedNodeIdRef.current)
            ? storedEl
            : iframeDoc.querySelector(`[data-make-node="${selectedNodeIdRef.current}"]`);
        if (selectedEl) showSelection(selectedEl);
      }

      iframeDoc.addEventListener("mousemove", handleMouseMove, true);
      iframeDoc.addEventListener("pointerdown", handlePointerDown, true);
      iframeDoc.addEventListener("mouseleave", handleMouseLeave, true);
      iframeDoc.addEventListener("keydown", handleKeyDown, true);
      window.addEventListener("keydown", handleKeyDown, true);

      cleanupRef.current = () => {
        iframeDoc.removeEventListener("mousemove", handleMouseMove, true);
        iframeDoc.removeEventListener("pointerdown", handlePointerDown, true);
        iframeDoc.removeEventListener("mouseleave", handleMouseLeave, true);
        iframeDoc.removeEventListener("keydown", handleKeyDown, true);
        window.removeEventListener("keydown", handleKeyDown, true);
        // Clean up any lingering drag listeners
        removeDragListeners();
        for (const evt of blockedEvents) {
          iframeDoc.removeEventListener(evt, blockEvent, true);
        }
        if (inspectStyle.parentNode) inspectStyle.parentNode.removeChild(inspectStyle);
        hideHover();
        hideDragGhost();
        hideDropIndicator();
      };
    }

    const cleanupRef = { current: () => {} };
    attach();

    return () => {
      cleanedUp = true;
      if (retryTimer) clearTimeout(retryTimer);
      cleanupRef.current();
    };
  }, [loadCount, onSelect, active]);

  return (
    <>
      {/* ─── Hover overlay (subtle, dashed) ─── */}
      <div
        ref={hoverHighlightRef}
        style={{
          position: "fixed",
          pointerEvents: "none",
          zIndex: 2147483646,
          border: "1.5px dashed #3b82f6",
          borderRadius: "2px",
          display: "none",
        }}
      />
      <div
        ref={hoverLabelRef}
        style={{
          position: "fixed",
          pointerEvents: "none",
          zIndex: 2147483646,
          background: "#3b82f6",
          color: "#fff",
          font: "500 10px/1 system-ui, sans-serif",
          padding: "3px 5px",
          borderRadius: "2px",
          display: "none",
          whiteSpace: "nowrap",
        }}
      />

      {/* ─── Selection overlay (solid, persistent) ─── */}
      <div
        ref={selectionHighlightRef}
        style={{
          position: "fixed",
          pointerEvents: "none",
          zIndex: 2147483647,
          border: "2px solid #3b82f6",
          borderRadius: "3px",
          display: "none",
          boxShadow: "0 0 0 1px rgba(59,130,246,0.15)",
        }}
      />
      <div
        ref={selectionLabelRef}
        style={{
          position: "fixed",
          pointerEvents: "none",
          zIndex: 2147483647,
          background: "#3b82f6",
          color: "#fff",
          font: "500 10px/1 system-ui, sans-serif",
          padding: "3px 5px",
          borderRadius: "2px",
          display: "none",
          whiteSpace: "nowrap",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}
      />

      {/* ─── Drag ghost ─── */}
      <div
        ref={dragGhostRef}
        style={{
          position: "fixed",
          pointerEvents: "none",
          zIndex: 2147483647,
          background: "#3b82f6",
          color: "#fff",
          font: "500 10px/1 system-ui, sans-serif",
          padding: "3px 8px",
          borderRadius: "4px",
          display: "none",
          whiteSpace: "nowrap",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          opacity: 0.9,
        }}
      />

      {/* ─── Drop indicator (dimensions set dynamically for horizontal/vertical) ─── */}
      <div
        ref={dropIndicatorRef}
        style={{
          position: "fixed",
          pointerEvents: "none",
          zIndex: 2147483647,
          background: "#3b82f6",
          borderRadius: "1px",
          display: "none",
          boxShadow: "0 0 4px rgba(59,130,246,0.5)",
        }}
      />

      {/* Same-origin iframe */}
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        onLoad={handleLoad}
        sandbox="allow-scripts allow-same-origin"
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          background: "#fff",
        }}
        title="Inspector preview"
      />
    </>
  );
});

export default SameOriginInspectPreview;

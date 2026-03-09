"use client";

import {
  extractStreamedCode,
  extractValidatedDependencies,
  DEFAULT_REACT_CODE,
} from "@/core/utils/makeUtils";
import { useAppStore } from "@/core/state/store";
import { MakeChatMessage } from "@/types/canvas";
import {
  registerPreview,
  unregisterPreview,
} from "@/core/utils/makePreviewRegistry";
import { instrumentCode, parseJSX } from "@/core/utils/jsxParser";
import SameOriginInspectPreview, {
  SameOriginInspectPreviewHandle,
} from "@/components/SameOriginInspectPreview";
import { nanoid } from "nanoid";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Max number of auto-fix retries for the canvas preview */
const MAX_CANVAS_AUTO_FIX = 2;

// ─── Public component ────────────────────────────────────────────────

interface MakeCanvasPreviewProps {
  code: string;
  objectId: string;
  playing: boolean;
}

/**
 * Canvas preview for a Make node.
 * Uses a same-origin iframe (via SameOriginInspectPreview with inspect
 * disabled) so the context menu can access the live DOM for design
 * generation that captures the current interactive state.
 */
export default function MakeCanvasPreview({
  code,
  objectId,
  playing,
}: MakeCanvasPreviewProps) {
  const validCode = getValidReactCode(code);
  const instrumentedCode = useMemo(() => {
    if (!validCode) return validCode;
    const { roots } = parseJSX(validCode);
    if (roots.length === 0) return validCode;
    return instrumentCode(validCode, roots);
  }, [validCode]);
  const [deps, setDeps] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const previewRef = useRef<SameOriginInspectPreviewHandle>(null);
  const dispatch = useAppStore((s) => s.dispatch);

  const extractMode = useAppStore((s) => s.extractMode);
  const toggleExtractElement = useAppStore((s) => s.toggleExtractElement);
  const clearExtractElements = useAppStore((s) => s.clearExtractElements);
  const isExtractActive = extractMode.isActive && extractMode.makeObjectId === objectId;
  const selectedNodeIds = extractMode.selectedElements.map((e) => e.nodeId);
  const selectedNodeIdsKey = selectedNodeIds.join(",");

  // ── Extract mode: inject a hit-test overlay into the iframe DOM ─────
  // A transparent overlay blocks all native :hover / click behaviour.
  // We peek underneath it with elementFromPoint to detect targets, then
  // tag them with CSS classes. The *visual* overlays (outlines + label)
  // are rendered in screen-space by MakeExtractOverlay in ScreenSpace.
  useEffect(() => {
    if (!isExtractActive) return;

    const handle = previewRef.current;
    if (!handle) return;
    const iframeDoc = handle.getIframeDocument();
    if (!iframeDoc || !iframeDoc.body) return;

    let cleanedUp = false;

    // --- Full-viewport overlay that eats all pointer interaction ---
    const overlay = iframeDoc.createElement("div");
    overlay.setAttribute("data-extract-overlay", "true");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483646",
      cursor: "default",
      background: "transparent",
    });
    iframeDoc.body.appendChild(overlay);

    let currentHoveredEl: Element | null = null;

    /** Hide overlay, hit-test the real content, then restore overlay. */
    function elementUnderPoint(x: number, y: number): Element | null {
      overlay.style.display = "none";
      const el = iframeDoc!.elementFromPoint(x, y);
      overlay.style.display = "";
      if (!el || el === iframeDoc!.body || el === iframeDoc!.documentElement) return null;
      return el;
    }

    function getElementId(el: Element): number {
      return Array.from(iframeDoc!.querySelectorAll("*:not([data-extract-overlay])")).indexOf(el);
    }

    function getElementName(el: Element): string {
      const dataName = el.getAttribute("data-make-name");
      if (dataName) return dataName;
      const tag = el.tagName.toLowerCase();
      const cls = el.className;
      if (typeof cls === "string" && cls.trim()) {
        const firstClass = cls.trim().split(/\s+/)[0];
        if (firstClass.length <= 24 && !firstClass.startsWith("__extract")) {
          return `${tag}.${firstClass}`;
        }
      }
      return tag;
    }

    /** Signal MakeExtractOverlay (in ScreenSpace) to re-read the DOM. */
    function notifyOverlay() {
      window.dispatchEvent(new CustomEvent("extract-overlay-update"));
    }

    // --- Event handlers on the overlay ---
    function handleMouseMove(e: MouseEvent) {
      if (cleanedUp) return;
      const target = elementUnderPoint(e.clientX, e.clientY);
      if (target && target !== currentHoveredEl) {
        if (currentHoveredEl) currentHoveredEl.classList.remove("__extract-hover");
        if (!target.classList.contains("__extract-selected")) {
          target.classList.add("__extract-hover");
        }
        currentHoveredEl = target;
        notifyOverlay();
      } else if (!target && currentHoveredEl) {
        currentHoveredEl.classList.remove("__extract-hover");
        currentHoveredEl = null;
        notifyOverlay();
      }
    }

    function handlePointerDown(e: PointerEvent) {
      if (cleanedUp) return;
      e.preventDefault();
      e.stopPropagation();

      const target = elementUnderPoint(e.clientX, e.clientY);
      if (!target) return;

      target.classList.remove("__extract-hover");
      currentHoveredEl = null;
      const nodeId = getElementId(target);
      const name = getElementName(target);

      if (e.shiftKey) {
        toggleExtractElement({ nodeId, name });
      } else {
        clearExtractElements();
        toggleExtractElement({ nodeId, name });
      }
      notifyOverlay();
    }

    function handleMouseLeave() {
      if (currentHoveredEl) {
        currentHoveredEl.classList.remove("__extract-hover");
        currentHoveredEl = null;
      }
      notifyOverlay();
    }

    overlay.addEventListener("mousemove", handleMouseMove);
    overlay.addEventListener("pointerdown", handlePointerDown);
    overlay.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      cleanedUp = true;
      overlay.removeEventListener("mousemove", handleMouseMove);
      overlay.removeEventListener("pointerdown", handlePointerDown);
      overlay.removeEventListener("mouseleave", handleMouseLeave);
      iframeDoc.querySelectorAll(".__extract-hover, .__extract-selected").forEach((el) => {
        el.classList.remove("__extract-hover", "__extract-selected");
      });
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      notifyOverlay();
    };
  }, [isExtractActive, toggleExtractElement, clearExtractElements]);

  // Sync selection classes in the iframe when selectedNodeIds changes
  useEffect(() => {
    if (!isExtractActive) return;
    const handle = previewRef.current;
    if (!handle) return;
    const iframeDoc = handle.getIframeDocument();
    if (!iframeDoc) return;

    iframeDoc.querySelectorAll(".__extract-selected").forEach((el) => {
      el.classList.remove("__extract-selected");
    });

    const allElements = Array.from(iframeDoc.querySelectorAll("*:not([data-extract-overlay])"));
    for (const nodeId of selectedNodeIds) {
      const el = allElements[nodeId];
      if (el) {
        el.classList.add("__extract-selected");
      }
    }

    window.dispatchEvent(new CustomEvent("extract-overlay-update"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExtractActive, selectedNodeIdsKey]);

  // ── Register/unregister in the global preview registry ──────────
  useEffect(() => {
    if (previewRef.current) {
      registerPreview(objectId, previewRef.current);
    }
    return () => {
      unregisterPreview(objectId);
    };
  }, [objectId]);

  // Re-register when the ref becomes available (after first render)
  const handleRefUpdate = useCallback(
    (handle: SameOriginInspectPreviewHandle | null) => {
      (previewRef as React.MutableRefObject<SameOriginInspectPreviewHandle | null>).current = handle;
      if (handle) {
        registerPreview(objectId, handle);
      } else {
        unregisterPreview(objectId);
      }
    },
    [objectId]
  );

  // ── Validate dependencies ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    extractValidatedDependencies(validCode).then((d) => {
      if (!cancelled) {
        setDeps(d);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [validCode]);

  // ── Auto-fix on error ─────────────────────────────────────────────
  const fixCountRef = useRef(0);
  const fixInProgressRef = useRef(false);
  const lastErrorRef = useRef("");
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeRef = useRef(validCode);

  // Reset fix count when code changes (user made a new edit)
  useEffect(() => {
    if (validCode !== codeRef.current) {
      codeRef.current = validCode;
      fixCountRef.current = 0;
      lastErrorRef.current = "";
      setErrorMessage(null);
    }
  }, [validCode]);

  const doAutoFix = useCallback(
    async (errMsg: string) => {
      if (fixInProgressRef.current || fixCountRef.current >= MAX_CANVAS_AUTO_FIX) return;

      const obj = useAppStore.getState().objects[objectId];
      if (!obj || obj.properties.type !== "make") return;
      const currentCode = obj.properties.code || "";
      const chatHistory: MakeChatMessage[] = obj.properties.chatHistory || [];

      fixInProgressRef.current = true;
      fixCountRef.current += 1;
      setFixing(true);

      console.log(
        `[CanvasAutoFix] Attempt ${fixCountRef.current}/${MAX_CANVAS_AUTO_FIX} — "${errMsg.slice(0, 120)}"`
      );

      try {
        const isUndefinedError =
          errMsg.includes("undefined") ||
          errMsg.includes("is not defined") ||
          errMsg.includes("Element type is invalid");

        const fixHint = isUndefinedError
          ? `\n\nThis error almost always means you imported a component or icon that does not exist in the package. Common mistakes:\n- Importing a named export that doesn't exist\n- Using react-icons which is too large for the bundler — use inline SVGs for brand icons instead\n- Wrong Radix UI import pattern\n- Importing from a package that doesn't exist on npm\n\nFix: check every import statement. For any icon or component you're not 100% sure exists, replace it with an inline SVG or implement it with plain HTML + Tailwind.`
          : "";

        const fixPrompt = `The code you generated has a runtime error:\n\n\`\`\`\n${errMsg}\n\`\`\`${fixHint}\n\nPlease fix the code. Return the complete corrected App.js.`;

        const apiMessages = [
          ...chatHistory
            .filter((m) => m.role === "user" || m.role === "assistant")
            .filter((m) => !m.content.startsWith("__"))
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user" as const, content: fixPrompt },
        ];

        const response = await fetch("/api/make-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            currentCode,
            provider: "claude",
          }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "API request failed");
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let fullOutput = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((l) => l.trim() !== "");
          for (const line of lines) {
            if (line === "data: [DONE]") break;
            if (line.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.token) fullOutput += parsed.token;
              } catch {
                /* skip */
              }
            }
          }
        }

        let codeOutput = fullOutput;
        const thinkEnd = codeOutput.indexOf("</think>");
        if (thinkEnd !== -1) codeOutput = codeOutput.slice(thinkEnd + 8);
        const summaryStart = codeOutput.indexOf("<summary>");
        let fixSummary = "";
        if (summaryStart !== -1) {
          const summaryEnd = codeOutput.indexOf("</summary>");
          if (summaryEnd !== -1) {
            fixSummary = codeOutput.slice(summaryStart + 9, summaryEnd).trim();
          }
          codeOutput = codeOutput.slice(0, summaryStart);
        }
        const cleanCode = extractStreamedCode(codeOutput.trim());

        if (cleanCode) {
          const shortError = errMsg.split("\n")[0].slice(0, 150);
          const newMessages: MakeChatMessage[] = [
            {
              id: nanoid(),
              role: "assistant",
              content: `__ERROR_DETECTED__${shortError}`,
              timestamp: Date.now(),
            },
            {
              id: nanoid(),
              role: "assistant",
              content: fixSummary || "Auto-fixed the error.",
              timestamp: Date.now(),
            },
          ];
          const updatedHistory = [...chatHistory, ...newMessages];

          dispatch({
            type: "object.updated",
            payload: {
              id: objectId,
              changes: {
                properties: {
                  ...obj.properties,
                  code: cleanCode,
                  chatHistory: updatedHistory,
                },
              },
              previousValues: { properties: obj.properties },
            },
          });

          codeRef.current = cleanCode;
          lastErrorRef.current = "";
          setErrorMessage(null);
        }
      } catch (err: any) {
        console.error("[CanvasAutoFix] Failed:", err);
      } finally {
        fixInProgressRef.current = false;
        setFixing(false);
      }
    },
    [objectId, dispatch]
  );

  const handleError = useCallback(
    (errMsg: string) => {
      if (errMsg === lastErrorRef.current) return;
      setErrorMessage(errMsg);

      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => {
        lastErrorRef.current = errMsg;
        doAutoFix(errMsg);
      }, 3000);
    },
    [doAutoFix]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────────

  if (!ready) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, system-ui, sans-serif",
          gap: 8,
          background: "#fafafa",
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            border: "2px solid #e4e4e7",
            borderTopColor: "#a1a1aa",
            borderRadius: "50%",
            animation: "sp-spin 0.8s linear infinite",
          }}
        />
        <span style={{ fontSize: 11, fontWeight: 500, color: "#a1a1aa" }}>
          Loading…
        </span>
        <style>{`@keyframes sp-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <SameOriginInspectPreview
        ref={handleRefUpdate}
        code={instrumentedCode}
        extraDeps={deps}
        active={false}
        onSelect={() => {}}
        onError={handleError}
      />

      {/* Error overlay */}
      {errorMessage && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,0.95)",
            fontFamily: "Inter, system-ui, sans-serif",
            padding: 24,
            gap: 8,
          }}
        >
          {fixing ? (
            <>
              <div
                style={{
                  width: 20,
                  height: 20,
                  border: "2px solid #d4d4d8",
                  borderTopColor: "#71717a",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 500, color: "#71717a" }}>
                Auto-fixing…
              </span>
            </>
          ) : (
            <>
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                style={{ flexShrink: 0 }}
              >
                <circle cx="10" cy="10" r="9" stroke="#ef4444" strokeWidth="1.5" />
                <path d="M10 6v5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="10" cy="14" r="0.75" fill="#ef4444" />
              </svg>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "#71717a",
                  textAlign: "center",
                  maxWidth: 240,
                  lineHeight: "1.4",
                }}
              >
                {errorMessage.split("\n")[0].slice(0, 120)}
              </span>
            </>
          )}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getValidReactCode(code: string | undefined | null): string {
  if (!code) return DEFAULT_REACT_CODE;

  let cleaned = code.trim();

  // Strip unclosed <think> blocks the server didn't remove
  const thinkEnd = cleaned.indexOf("</think>");
  if (thinkEnd !== -1) {
    cleaned = cleaned.slice(thinkEnd + 8).trim();
  } else if (cleaned.startsWith("<think>") || cleaned.startsWith("<think ")) {
    // Unclosed <think> — strip the tag and take the rest
    const lineEnd = cleaned.indexOf("\n");
    if (lineEnd !== -1) cleaned = cleaned.slice(lineEnd + 1).trim();
  }

  // Only reject actual HTML documents, not JSX fragments
  if (
    cleaned.startsWith("<!DOCTYPE") ||
    cleaned.startsWith("<!doctype") ||
    cleaned.startsWith("<html") ||
    cleaned.startsWith("<HTML")
  ) {
    return DEFAULT_REACT_CODE;
  }

  // If code starts with JSX (a tag), wrap it in a default-exported component
  if (cleaned.startsWith("<") && !cleaned.startsWith("<<<")) {
    return `export default function App() {\n  return (\n    ${cleaned}\n  );\n}`;
  }

  return cleaned;
}

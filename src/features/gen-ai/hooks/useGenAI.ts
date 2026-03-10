"use client";

import { useCallback, useRef, useState } from "react";
import { useAppStore } from "@/core/state/store";
import { executeActions, type ExecuteResult } from "../adapter/action-adapter";
import { buildSelectionContext } from "../adapter/selection-adapter";
import { composePrompt, parseLLMResponse, type ApiChatMessage } from "../prompt/prompt-composer";
import { compileGenerator, executeGenerator } from "../runtime/codegen";
import { collectControlDefaults } from "../runtime/template";
import type { ActionDescriptor, UISpec, SelectionContext, UIControl } from "../types";

// ─── Types ───────────────────────────────────────────────────────────

export interface GenAIState {
  isLoading: boolean;
  currentSpec: UISpec | null;
  rootFrameId: string | undefined;
  error: string | null;
}

export interface GenAIChatMessage {
  role: "user" | "assistant" | "error";
  content: string;
  timestamp: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function computeNewOrigin(): { x: number; y: number } {
  const { viewport } = useAppStore.getState();
  const centerX =
    (-viewport.panX + viewport.viewportBounds.width / 2) / viewport.zoom;
  const centerY =
    (-viewport.panY + viewport.viewportBounds.height / 2) / viewport.zoom;
  return { x: Math.round(centerX - 200), y: Math.round(centerY - 200) };
}

function flattenColorStops(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      "stops" in v &&
      Array.isArray((v as Record<string, unknown>).stops)
    ) {
      const fv = v as { stops: unknown[]; gradientType?: string; angle?: number };
      out[k] = fv.stops;
      out[`${k}_type`] = fv.gradientType ?? "linear";
      out[`${k}_angle`] = fv.angle ?? 0;
      out[`${k}_fill`] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Rewrite tempId references in a set of actions so that `targetNodeId: "root"`
 * or similar temp references resolve to the existing frame.
 */
function rewriteActionsForReapply(
  generated: ActionDescriptor[],
  existingFrameId: string,
): ActionDescriptor[] {
  let rootIdx = generated.findIndex(
    (a) => a.method === "createFrame" && !a.parentId,
  );

  // Fallback: if no root createFrame, treat any root create* as the root object
  if (rootIdx === -1) {
    rootIdx = generated.findIndex(
      (a) => a.method.startsWith("create") && !a.parentId,
    );
  }

  if (rootIdx === -1) return generated;

  const rootAction = generated[rootIdx];
  const rootTempId = rootAction.tempId;
  const hasChildren = generated.some(
    (a, i) => i !== rootIdx && a.parentId === rootTempId,
  );
  const result: ActionDescriptor[] = [];

  // Add resize if generator computed dimensions
  if (
    typeof rootAction.args?.width === "number" &&
    typeof rootAction.args?.height === "number"
  ) {
    result.push({
      method: "resize",
      nodeId: existingFrameId,
      args: {
        width: rootAction.args.width as number,
        height: rootAction.args.height as number,
      },
    });
  }

  // For bare shapes (no children), apply fill/cornerRadius from root action to the frame
  if (!hasChildren) {
    if (rootAction.args?.cornerRadius != null) {
      result.push({
        method: "setCornerRadius",
        nodeId: existingFrameId,
        args: { radius: rootAction.args.cornerRadius as number },
      });
    }
  }

  // Delete existing children only if the root had children
  if (hasChildren) {
    result.push({
      method: "deleteChildren",
      nodeId: existingFrameId,
      args: {},
    });
  }

  // Rewrite remaining actions to use existing frame
  for (let i = 0; i < generated.length; i++) {
    if (i === rootIdx) continue;
    const action = { ...generated[i], args: { ...generated[i].args } };

    if (action.parentId === rootTempId) {
      action.parentId = existingFrameId;
    }
    if (action.nodeId === rootTempId) {
      action.nodeId = existingFrameId;
    }

    // Resolve targetNodeId in action args
    if (action.args?.targetNodeId === rootTempId || action.args?.targetNodeId === "root") {
      action.args.targetNodeId = existingFrameId;
    }

    result.push(action);
  }

  return result;
}

// ─── Hardcoded test generator ────────────────────────────────────────

function buildCircleGridActions(origin: { x: number; y: number }): ActionDescriptor[] {
  const cols = 5;
  const rows = 5;
  const size = 400;
  const gap = 10;
  const cellW = (size - gap * (cols + 1)) / cols;
  const cellH = (size - gap * (rows + 1)) / rows;
  const radius = Math.min(cellW, cellH);

  const actions: ActionDescriptor[] = [
    {
      method: "createFrame",
      tempId: "frame1",
      args: {
        name: "Circle Grid",
        x: origin.x,
        y: origin.y,
        width: size,
        height: size,
        fills: [{ type: "SOLID", color: { r: 0.95, g: 0.95, b: 0.95 }, opacity: 1 }],
        clipsContent: true,
      },
    },
  ];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = gap + col * (cellW + gap);
      const cy = gap + row * (cellH + gap);
      const hue = ((row * cols + col) / (rows * cols)) * 360;
      const r = Math.cos((hue * Math.PI) / 180) * 0.5 + 0.5;
      const g = Math.cos(((hue - 120) * Math.PI) / 180) * 0.5 + 0.5;
      const b = Math.cos(((hue - 240) * Math.PI) / 180) * 0.5 + 0.5;

      actions.push({
        method: "createEllipse",
        tempId: `circle_${row}_${col}`,
        parentId: "frame1",
        args: {
          name: `Circle ${row}-${col}`,
          x: cx,
          y: cy,
          width: radius,
          height: radius,
        },
      });

      actions.push({
        method: "setFill",
        nodeId: `circle_${row}_${col}`,
        args: {
          fills: [{ type: "SOLID", color: { r: r * 0.8 + 0.1, g: g * 0.8 + 0.1, b: b * 0.8 + 0.1 }, opacity: 1 }],
        },
      });
    }
  }

  return actions;
}

// ─── Hook ────────────────────────────────────────────────────────────

export function useGenAI() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-frame gen-ai state
  const currentSpecRef = useRef<UISpec | null>(null);
  const rootFrameIdRef = useRef<string | undefined>(undefined);
  const chatHistoryRef = useRef<GenAIChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Phase 1 test: hardcoded circle grid
   */
  const runCircleGridTest = useCallback(() => {
    const origin = computeNewOrigin();
    const actions = buildCircleGridActions(origin);
    const result = executeActions(actions);

    if (result.rootFrameId) {
      rootFrameIdRef.current = result.rootFrameId;
      useAppStore.getState().dispatch({
        type: "selection.set",
        payload: { ids: [result.rootFrameId] },
      });
    }

    return result;
  }, []);

  /**
   * Send a prompt to the gen-ai LLM pipeline and execute the result.
   */
  const sendPrompt = useCallback(async (
    promptText: string,
    opts?: {
      onStreamingUpdate?: (partialText: string) => void;
      onComplete?: (summary: string | undefined, frameId: string | undefined) => void;
    },
  ): Promise<ExecuteResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      // Build selection context from current clone selection
      const state = useAppStore.getState();
      const selectedIds = state.selection.selectedIds || [];
      const selCtx = buildSelectionContext(selectedIds, state.objects);

      // Include existing spec for follow-up prompts
      const uiSpec = currentSpecRef.current;

      // Build chat history for the prompt composer
      const history = chatHistoryRef.current
        .filter((m) => m.role !== "error")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      // Add user message to history
      chatHistoryRef.current.push({
        role: "user",
        content: promptText,
        timestamp: Date.now(),
      });

      // Compose the prompt
      const { system, messages: apiMessages } = composePrompt(
        selCtx,
        uiSpec,
        history,
        promptText,
      );

      // Estimate if generator-heavy to set max_tokens
      const generatorLikely =
        /\b(grid|pattern|dots|circle|generate|create.*\d|layout|arrange|distribute|carousel|randomize|gradient|spiral|scatter|wavy|noise|organic|palette|color.*scale|saturate|desaturate|darken|lighten|hue.*shift|3d|sphere|cube|fractal|tree|qr|halftone|dither|posterize|flow.*field|chart|voronoi|rough|sketch|mosaic|superformula|blob|turing|reaction.*diffusion|attractor|metaballs|circle.*pack|dla|cellular.*automata|wave.*function)\b/i.test(
          promptText,
        );
      const maxTokens = generatorLikely ? 8192 : 4096;

      // Call the API with streaming
      const controller = new AbortController();
      abortRef.current = controller;

      const response = await fetch("/api/gen-ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: system,
          messages: apiMessages,
          maxTokens,
          temperature: 0.5,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: "API request failed" }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      // Stream the response
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line === "data: [DONE]") continue;
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.type === "token") {
                fullText += parsed.content;
                opts?.onStreamingUpdate?.(fullText);
              } else if (parsed.type === "error") {
                throw new Error(parsed.message);
              }
            } catch (e) {
              if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
                throw e;
              }
            }
          }
        }
      }

      console.log("[gen-ai] Raw LLM response:", fullText);

      // Parse the response
      const parsed = parseLLMResponse(fullText);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      const { actions, ui, message: assistantMessage, generate } = parsed.data;

      // Add assistant message to history — always store the raw JSON so the LLM
      // sees its own structured output on follow-up turns and stays in JSON mode.
      chatHistoryRef.current.push({
        role: "assistant",
        content: fullText,
        timestamp: Date.now(),
      });

      // Merge UI spec
      const normalizedUi: UISpec = {
        ...(ui as UISpec),
        generate: generate ?? (ui as UISpec).generate,
      };

      const mergedUi: UISpec = (() => {
        const prev = currentSpecRef.current;
        if (!prev || normalizedUi.replace) return normalizedUi;
        const existingById = new Map(prev.controls.map((c: UIControl) => [c.id, c]));
        if (normalizedUi.removeControls?.length) {
          for (const id of normalizedUi.removeControls) existingById.delete(id);
        }
        for (const c of normalizedUi.controls) {
          const existing = existingById.get(c.id);
          if (existing && existing.props?.defaultValue !== undefined) {
            // Existing control has a stamped value from the user — always preserve
            // it. The LLM doesn't know the user's current runtime value, so its
            // defaultValue (if any) is stale. Take the LLM's structural changes
            // (label, min, max, step, etc.) but keep the user's value.
            existingById.set(c.id, {
              ...c,
              props: { ...c.props, defaultValue: existing.props.defaultValue },
            });
          } else {
            existingById.set(c.id, c);
          }
        }
        const merged = {
          ...prev,
          ...normalizedUi,
          generate: normalizedUi.generate ?? prev.generate,
          actionTemplate: normalizedUi.actionTemplate ?? prev.actionTemplate,
          controls: Array.from(existingById.values()),
        };
        delete merged.removeControls;
        return merged;
      })();

      currentSpecRef.current = mergedUi;

      if (normalizedUi.replace) {
        rootFrameIdRef.current = undefined;
      }

      const existingFrameId = rootFrameIdRef.current;

      // Execute actions or run generator
      let result: ExecuteResult;
      let usedControlValues: Record<string, unknown> | null = null;

      if ((actions as ActionDescriptor[]).length > 0) {
        let finalActions = actions as ActionDescriptor[];

        if (existingFrameId) {
          finalActions = rewriteActionsForReapply(finalActions, existingFrameId);
        }

        result = executeActions(finalActions);
      } else if (mergedUi.generate) {
        // collectControlDefaults reads props.defaultValue, which is stamped
        // with the user's current values by specWithCurrentValues. For existing
        // controls that survived the merge, this returns their last user value.
        // For new controls from the LLM, it returns the LLM-provided defaults.
        const defaults = collectControlDefaults(mergedUi.controls);
        let rawValues = { ...defaults };

        // Secondary fallback: overlay genAiValues for any values not captured
        // by the stamped spec (e.g., controls whose defaultValue wasn't stamped yet).
        if (existingFrameId) {
          const existingObj = useAppStore.getState().objects[existingFrameId];
          if (existingObj?.genAiValues) {
            try {
              const persisted = JSON.parse(existingObj.genAiValues) as Record<string, unknown>;
              for (const c of mergedUi.controls) {
                if (c.id in persisted && !(c.props?.defaultValue !== undefined)) {
                  rawValues[c.id] = persisted[c.id];
                }
              }
            } catch { /* use defaults */ }
          }
        }

        const controlValues = flattenColorStops(rawValues);
        const fn = compileGenerator(mergedUi.generate);
        let generated = executeGenerator(fn, controlValues);
        usedControlValues = rawValues;

        if (existingFrameId) {
          generated = rewriteActionsForReapply(generated, existingFrameId);
        }

        result = executeActions(generated);
      } else {
        result = { createdIds: [], rootFrameId: undefined, tempIdMap: new Map() };
      }

      // Track the root object (frame or first created object)
      if (!existingFrameId) {
        rootFrameIdRef.current = result.rootFrameId ?? result.createdIds[0];
      }

      // On first creation, center the root object in the viewport and scroll to it
      const centerNodeId = rootFrameIdRef.current;
      if (!existingFrameId && centerNodeId) {
        const state = useAppStore.getState();
        const obj = state.objects[centerNodeId];
        if (obj) {
          const { viewport } = state;
          // viewportBounds may be stale (800×600 default); use actual window size
          const screenW = typeof window !== "undefined" ? window.innerWidth : viewport.viewportBounds.width;
          const screenH = typeof window !== "undefined" ? window.innerHeight : viewport.viewportBounds.height;

          const vpCenterX = (-viewport.panX + screenW / 2) / viewport.zoom;
          const vpCenterY = (-viewport.panY + screenH / 2) / viewport.zoom;

          const newX = Math.round(vpCenterX - obj.width / 2);
          const newY = Math.round(vpCenterY - obj.height / 2);

          state.dispatch({
            type: "object.updated",
            payload: {
              id: centerNodeId,
              changes: { x: newX, y: newY },
              previousValues: { x: obj.x, y: obj.y },
            },
          });

          // Pan viewport so the object is centered on screen (preserve zoom)
          const newPanX = -(newX + obj.width / 2) * viewport.zoom + screenW / 2;
          const newPanY = -(newY + obj.height / 2) * viewport.zoom + screenH / 2;

          state.dispatch({
            type: "viewport.changed",
            payload: {
              viewport: { ...viewport, panX: newPanX, panY: newPanY },
              previousViewport: viewport,
            },
          });
        }
      }

      // Rewrite temp IDs in control action templates to real IDs
      if (result.tempIdMap.size > 0 && mergedUi.controls) {
        for (const control of mergedUi.controls) {
          const act = (control as unknown as Record<string, unknown>).action as
            | { nodeId?: string; args?: Record<string, unknown> }
            | undefined;
          if (act?.nodeId) {
            act.nodeId = result.tempIdMap.get(act.nodeId) ?? act.nodeId;
          }
        }
      }

      // Persist spec and current control values on the root object
      if (rootFrameIdRef.current) {
        const specJson = JSON.stringify(mergedUi);
        const changes: Record<string, unknown> = { genAiSpec: specJson };
        if (usedControlValues) {
          changes.genAiValues = JSON.stringify(usedControlValues);
        }
        useAppStore.getState().dispatch({
          type: "object.updated",
          payload: {
            id: rootFrameIdRef.current,
            changes,
            previousValues: {},
          },
        });

        // Select the root object
        useAppStore.getState().dispatch({
          type: "selection.set",
          payload: { ids: [rootFrameIdRef.current] },
        });
      }

      opts?.onComplete?.(assistantMessage, rootFrameIdRef.current);
      setIsLoading(false);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[gen-ai] Error:", message);
      setError(message);
      setIsLoading(false);

      chatHistoryRef.current.push({
        role: "error",
        content: message,
        timestamp: Date.now(),
      });

      return null;
    }
  }, []);

  /**
   * Re-run the current generator with updated control values.
   */
  const rerunGenerator = useCallback(
    (controlValues: Record<string, unknown>) => {
      const spec = currentSpecRef.current;
      if (!spec?.generate) return null;

      const frameId = rootFrameIdRef.current;
      if (!frameId) return null;

      try {
        const fn = compileGenerator(spec.generate);
        const params = flattenColorStops(controlValues);
        let generated = executeGenerator(fn, params);

        generated = rewriteActionsForReapply(generated, frameId);
        const result = executeActions(generated);

        // Update spec on frame
        const specJson = JSON.stringify(spec);
        useAppStore.getState().dispatch({
          type: "object.updated",
          payload: {
            id: frameId,
            changes: { genAiSpec: specJson },
            previousValues: {},
          },
        });

        return result;
      } catch (err) {
        console.error("[gen-ai] Generator re-run error:", err);
        return null;
      }
    },
    [],
  );

  /**
   * Stop the current LLM request.
   */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  /**
   * Restore spec from a selected frame's genAiSpec data.
   */
  const restoreFromFrame = useCallback((frameId: string, specJson: string) => {
    try {
      const spec = JSON.parse(specJson) as UISpec;
      currentSpecRef.current = spec;
      rootFrameIdRef.current = frameId;
    } catch {
      console.warn("[gen-ai] Failed to parse genAiSpec");
    }
  }, []);

  return {
    isLoading,
    error,
    currentSpec: currentSpecRef.current,
    rootFrameId: rootFrameIdRef.current,
    runCircleGridTest,
    sendPrompt,
    rerunGenerator,
    stop,
    restoreFromFrame,
  };
}

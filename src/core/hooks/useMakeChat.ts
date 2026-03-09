"use client";

import { useAppStore } from "@/core/state/store";
import {
  applySearchReplace,
  DEFAULT_REACT_CODE,
  extractStreamedCode,
  extractValidatedDependencies,
  isLikelyTruncated,
  isSearchReplaceFormat,
  validateJSX,
} from "@/core/utils/makeUtils";
import { MakeChatMessage, MakeProperties, MakeVersion } from "@/types/canvas";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useRef, useState } from "react";

export type AIProvider = "openai" | "claude";

/** Ensure stored code is valid React (migrate old HTML Makes) */
function getValidReactCode(code: string | undefined): string {
  if (!code || code.trim().startsWith("<") || code.trim().startsWith("<!")) {
    return DEFAULT_REACT_CODE;
  }
  return code;
}

export interface UseMakeChatOptions {
  /** The Make object ID to operate on */
  objectId: string | null | undefined;
  /** Whether this hook's consumer is active (mounted / visible) */
  active: boolean;
  /** Optional callback when code changes (for live preview in MakeEditorOverlay) */
  onCodeUpdate?: (code: string) => void;
  /** Optional callback after a complete exchange (code + deps changed) */
  onExchangeComplete?: (code: string) => void;
}

export interface UseMakeChatReturn {
  chatHistory: MakeChatMessage[];
  setChatHistory: React.Dispatch<React.SetStateAction<MakeChatMessage[]>>;
  currentCode: string;
  setCurrentCode: (code: string) => void;
  message: string;
  setMessage: (msg: string) => void;
  isLoading: boolean;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  aiProvider: AIProvider;
  setAiProvider: (p: AIProvider) => void;
  handleSend: (overrideMessage?: string) => Promise<void>;
  handleSendRef: React.MutableRefObject<((overrideMessage?: string) => Promise<void>) | undefined>;
  handleStop: () => void;
  flushToStore: () => void;
  saveToStore: (code: string, history: MakeChatMessage[]) => void;
}

/**
 * Shared hook encapsulating Make chat logic:
 * - Local chat state synced to the store
 * - Streaming SSE send to /api/make-chat
 * - Code extraction, search/replace, summary parsing
 */
export function useMakeChat({
  objectId,
  active,
  onCodeUpdate,
  onExchangeComplete,
}: UseMakeChatOptions): UseMakeChatReturn {
  const dispatch = useAppStore((state) => state.dispatch);
  const objects = useAppStore((state) => state.objects);
  const setMakeGenerating = useAppStore((state) => state.setMakeGenerating);

  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [aiProvider, setAiProvider] = useState<AIProvider>("claude");
  const [chatHistory, setChatHistory] = useState<MakeChatMessage[]>([]);
  const [currentCode, setCurrentCodeState] = useState(() => {
    if (!objectId) return DEFAULT_REACT_CODE;
    const obj = objects[objectId];
    if (!obj || obj.properties.type !== "make") return DEFAULT_REACT_CODE;
    return getValidReactCode(obj.properties.code);
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const handleSendRef = useRef<((overrideMessage?: string) => Promise<void>) | undefined>(undefined);

  // Refs to avoid stale closures
  const currentCodeRef = useRef(currentCode);
  const chatHistoryRef = useRef(chatHistory);
  const isLoadingRef = useRef(false);
  useEffect(() => { currentCodeRef.current = currentCode; }, [currentCode]);
  useEffect(() => { chatHistoryRef.current = chatHistory; }, [chatHistory]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);

  // Sync generating state to the store so canvas objects can show a pulse
  useEffect(() => {
    if (!objectId) return;
    setMakeGenerating(objectId, isLoading);
    return () => { setMakeGenerating(objectId, false); };
  }, [objectId, isLoading, setMakeGenerating]);

  // Flag: skip the next debounced flush (set after syncing FROM the store to
  // prevent writing back the same values we just read).
  const skipNextFlushRef = useRef(false);

  // Wrapper so onCodeUpdate callback can be called
  const setCurrentCode = useCallback(
    (code: string) => {
      setCurrentCodeState(code);
      currentCodeRef.current = code;
      onCodeUpdate?.(code);
    },
    [onCodeUpdate]
  );

  // ─── Sync from store when objectId changes ───────────────────────
  useEffect(() => {
    if (!active || !objectId) return;
    const obj = objects[objectId];
    if (!obj || obj.properties.type !== "make") return;
    const props = obj.properties;
    const history = props.chatHistory || [];
    setChatHistory(history);
    chatHistoryRef.current = history;
    const code = getValidReactCode(props.code);
    setCurrentCodeState(code);
    currentCodeRef.current = code;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId, active]);

  // ─── Cross-instance sync: detect store changes from other consumers ──
  // Lightweight selectors that re-render only when the object's code or
  // chat history changes in the store.
  const storeCode = useAppStore(
    useCallback(
      (s: ReturnType<typeof useAppStore.getState>) => {
        if (!objectId) return undefined;
        const obj = s.objects[objectId];
        if (!obj || obj.properties.type !== "make") return undefined;
        return obj.properties.code;
      },
      [objectId]
    )
  );

  const storeHistoryKey = useAppStore(
    useCallback(
      (s: ReturnType<typeof useAppStore.getState>) => {
        if (!objectId) return "";
        const obj = s.objects[objectId];
        if (!obj || obj.properties.type !== "make") return "";
        const h = obj.properties.chatHistory;
        if (!h || h.length === 0) return "0:";
        const last = h[h.length - 1];
        // Include content length so intermediate streaming updates are detected
        return `${h.length}:${last.id}:${last.content.length}`;
      },
      [objectId]
    )
  );

  useEffect(() => {
    if (!active || !objectId || isLoading) return;

    const obj = useAppStore.getState().objects[objectId];
    if (!obj || obj.properties.type !== "make") return;

    const storeHistory = obj.properties.chatHistory || [];
    const code = getValidReactCode(obj.properties.code);

    // Compare with local state — only sync if they genuinely differ
    const localLast = chatHistoryRef.current[chatHistoryRef.current.length - 1];
    const storeLast = storeHistory[storeHistory.length - 1];

    const codeChanged = code !== currentCodeRef.current;
    const historyChanged =
      storeHistory.length !== chatHistoryRef.current.length ||
      storeLast?.id !== localLast?.id ||
      storeLast?.content !== localLast?.content;

    if (codeChanged || historyChanged) {
      skipNextFlushRef.current = true; // prevent debounced write-back
      setChatHistory(storeHistory);
      chatHistoryRef.current = storeHistory;
      setCurrentCodeState(code);
      currentCodeRef.current = code;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeCode, storeHistoryKey, active, objectId, isLoading]);

  // ─── Flush to store ──────────────────────────────────────────────
  const flushToStore = useCallback(() => {
    if (!objectId) return;
    const obj = useAppStore.getState().objects[objectId];
    if (!obj || obj.properties.type !== "make") return;
    dispatch({
      type: "object.updated",
      payload: {
        id: objectId,
        changes: {
          properties: {
            ...obj.properties,
            code: currentCodeRef.current,
            chatHistory: chatHistoryRef.current,
          },
        },
        previousValues: { properties: obj.properties },
      },
    });
  }, [objectId, dispatch]);

  const MAX_VERSIONS = 50;

  const saveToStore = useCallback(
    (code: string, history: MakeChatMessage[], prompt?: string) => {
      currentCodeRef.current = code;
      chatHistoryRef.current = history;

      if (prompt) {
        if (!objectId) return;
        const obj = useAppStore.getState().objects[objectId];
        if (!obj || obj.properties.type !== "make") return;
        const props = obj.properties as MakeProperties;
        const prevVersions = props.versions ?? [];
        const newVersion: MakeVersion = {
          id: nanoid(),
          code,
          prompt,
          timestamp: Date.now(),
        };
        const versions = [...prevVersions, newVersion].slice(-MAX_VERSIONS);
        dispatch({
          type: "object.updated",
          payload: {
            id: objectId,
            changes: {
              properties: {
                ...props,
                code,
                chatHistory: history,
                versions,
                currentVersionIndex: versions.length - 1,
              },
            },
            previousValues: { properties: props },
          },
        });
      } else {
        flushToStore();
      }
    },
    [flushToStore, objectId, dispatch]
  );

  // Auto-sync to store whenever currentCode changes (debounced 300ms).
  // Skip during active streaming — partial code would break the canvas preview.
  useEffect(() => {
    if (!objectId || !active) return;
    if (isLoadingRef.current) return; // don't push partial code during streaming
    // Skip the flush if we just synced FROM the store (avoids writing back
    // the same values we just read, which would create a pointless dispatch).
    if (skipNextFlushRef.current) {
      skipNextFlushRef.current = false;
      return;
    }
    const timer = setTimeout(() => flushToStore(), 300);
    return () => clearTimeout(timer);
  }, [currentCode, active, objectId, flushToStore]);

  // Periodic flush during streaming — ensures the other consumer (sidebar /
  // editor) sees intermediate chat history updates in real-time.
  // Only flushes chat history — NOT the code — because partial/streaming code
  // would cause Babel errors in the canvas preview (Sandpack).  The code is
  // flushed once at the end when generation completes.
  const flushHistoryOnly = useCallback(() => {
    if (!objectId) return;
    const obj = useAppStore.getState().objects[objectId];
    if (!obj || obj.properties.type !== "make") return;
    dispatch({
      type: "object.updated",
      payload: {
        id: objectId,
        changes: {
          properties: {
            ...obj.properties,
            // keep the existing (valid) code in the store
            chatHistory: chatHistoryRef.current,
          },
        },
        previousValues: { properties: obj.properties },
      },
    });
  }, [objectId, dispatch]);

  useEffect(() => {
    if (!objectId || !isLoading) return;
    const interval = setInterval(() => {
      flushHistoryOnly();
    }, 500);
    return () => clearInterval(interval);
  }, [objectId, isLoading, flushHistoryOnly]);

  // ─── handleSend ──────────────────────────────────────────────────
  const handleSend = async (overrideMessage?: string) => {
    const msgText = (overrideMessage ?? message).trim();
    if (!msgText || isLoading) return;

    const userMessage: MakeChatMessage = {
      id: nanoid(),
      role: "user",
      content: msgText,
      timestamp: Date.now(),
    };

    const newHistory = [...chatHistory, userMessage];
    setChatHistory(newHistory);
    if (!overrideMessage) setMessage("");
    setIsLoading(true);

    // Placeholder assistant message for streaming
    const aiMessageId = nanoid();
    const codeMessageId = nanoid();
    const aiMessage: MakeChatMessage = {
      id: aiMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };
    const historyWithPlaceholder = [...newHistory, aiMessage];
    setChatHistory(historyWithPlaceholder);

    const startTime = Date.now();

    try {
      // Build message history for the API
      const apiMessages = newHistory
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const controller = new AbortController();
      abortControllerRef.current = controller;

      const response = await fetch("/api/make-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          currentCode: currentCodeRef.current,
          provider: aiProvider,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "API request failed");
      }

      // Read the SSE stream
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let fullOutput = "";
      let reasoning = "";
      let streamedCode = "";
      let summary = "";
      let inThink = false;
      let thinkDone = false;
      let codeMessageAdded = false;
      let lastCodeStreamUpdate = 0;

      // Throttle preview updates
      let lastPreviewUpdate = 0;
      let pendingPreviewTimer: ReturnType<typeof setTimeout> | null = null;
      const PREVIEW_THROTTLE_MS = 800;

      const updatePreview = (rawCode: string) => {
        const cleaned = extractStreamedCode(rawCode);
        if (!cleaned) return;
        if (cleaned.includes("<<<")) return;
        // During streaming, only push to the preview when the code looks
        // structurally complete (balanced braces, ends at a statement boundary).
        // This avoids flooding the same-origin preview with partial JSX that
        // causes Babel errors.  The chat code-streaming display still shows
        // progress; the live preview just updates less frequently.
        if (isLikelyTruncated(cleaned)) return;
        const now = Date.now();
        if (now - lastPreviewUpdate >= PREVIEW_THROTTLE_MS) {
          lastPreviewUpdate = now;
          setCurrentCode(cleaned);
          if (pendingPreviewTimer) {
            clearTimeout(pendingPreviewTimer);
            pendingPreviewTimer = null;
          }
        } else if (!pendingPreviewTimer) {
          pendingPreviewTimer = setTimeout(() => {
            lastPreviewUpdate = Date.now();
            setCurrentCode(cleaned);
            pendingPreviewTimer = null;
          }, PREVIEW_THROTTLE_MS - (now - lastPreviewUpdate));
        }
      };

      // Helper to get the code portion (between </think> and <summary>)
      const extractCodePortion = (output: string): string => {
        const thinkEnd = output.indexOf("</think>");
        if (thinkEnd === -1) return "";
        const afterThink = output.slice(thinkEnd + 8);
        const summaryStart = afterThink.indexOf("<summary>");
        if (summaryStart !== -1) {
          return afterThink.slice(0, summaryStart).trim();
        }
        return afterThink.trim();
      };

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
              if (parsed.token) {
                fullOutput += parsed.token;

                // Phase 1: Parse <think> block (reasoning)
                if (!thinkDone) {
                  if (!inThink && fullOutput.includes("<think>")) {
                    inThink = true;
                  }

                  if (inThink) {
                    const thinkStart = fullOutput.indexOf("<think>") + 7;
                    const thinkEnd = fullOutput.indexOf("</think>");

                    if (thinkEnd !== -1) {
                      reasoning = fullOutput.slice(thinkStart, thinkEnd).trim();
                      thinkDone = true;
                      streamedCode = extractCodePortion(fullOutput);
                    } else {
                      reasoning = fullOutput.slice(thinkStart).trim();
                    }

                    setChatHistory((prev) => {
                      const updated = [...prev];
                      const lastIdx = updated.length - 1;
                      if (lastIdx >= 0 && updated[lastIdx].id === aiMessageId) {
                        updated[lastIdx] = {
                          ...updated[lastIdx],
                          content: "",
                          thinking: reasoning,
                        };
                      }
                      return updated;
                    });
                  } else if (fullOutput.length > 20) {
                    // Model isn't using <think> tags — treat output as code directly
                    thinkDone = true;
                    streamedCode = fullOutput;
                  }
                } else {
                  // Phase 2: Accumulate code
                  streamedCode = extractCodePortion(fullOutput);

                  if (!codeMessageAdded && streamedCode.length > 0) {
                    codeMessageAdded = true;
                    setChatHistory((prev) =>
                      prev
                        .filter((m) => m.id !== aiMessageId)
                        .concat({
                          id: codeMessageId,
                          role: "assistant" as const,
                          content: "",
                          timestamp: Date.now(),
                          thinking: reasoning || undefined,
                          isCodeStreaming: true,
                          messageType: "code_streaming" as const,
                        })
                    );
                  }

                  if (codeMessageAdded) {
                    const now = Date.now();
                    if (now - lastCodeStreamUpdate >= 150) {
                      lastCodeStreamUpdate = now;
                      const codeLines = streamedCode.split("\n");
                      const visibleLines = codeLines.slice(-15).join("\n");
                      setChatHistory((prev) => {
                        const updated = [...prev];
                        const codeIdx = updated.findIndex((m) => m.id === codeMessageId);
                        if (codeIdx !== -1) {
                          updated[codeIdx] = {
                            ...updated[codeIdx],
                            content: visibleLines,
                            isCodeStreaming: true,
                            messageType: "code_streaming" as const,
                          };
                        }
                        return updated;
                      });
                    }
                  }

                  // Check for <summary>
                  const summaryStart = fullOutput.indexOf("<summary>");
                  const summaryEnd = fullOutput.indexOf("</summary>");
                  if (summaryStart !== -1 && summaryEnd !== -1) {
                    summary = fullOutput.slice(summaryStart + 9, summaryEnd).trim();
                  }
                }

                // Throttled preview update
                if (thinkDone && streamedCode && !isSearchReplaceFormat(streamedCode) && !streamedCode.includes("<<<")) {
                  updatePreview(streamedCode);
                }
              }
            } catch {
              // Skip unparseable
            }
          }
        }
      }

      // Clean up pending timer
      if (pendingPreviewTimer) {
        clearTimeout(pendingPreviewTimer);
      }

      // If the model didn't use <think> tags, treat whole output as code
      if (!thinkDone) {
        streamedCode = fullOutput;
        const summaryStart = streamedCode.indexOf("<summary>");
        const summaryEnd = streamedCode.indexOf("</summary>");
        if (summaryStart !== -1 && summaryEnd !== -1) {
          summary = streamedCode.slice(summaryStart + 9, summaryEnd).trim();
          streamedCode = streamedCode.slice(0, summaryStart).trim();
        }
      }

      // Apply search/replace or strip fences
      let cleanCode: string;
      let patchFailed = false;
      let patchPartialFail = false;
      let patchFailedCount = 0;
      let patchTotalCount = 0;
      if (isSearchReplaceFormat(streamedCode)) {
        const { result, applied, failedCount, totalCount } = applySearchReplace(currentCodeRef.current, streamedCode);
        patchTotalCount = totalCount || 0;
        patchFailedCount = failedCount || 0;
        if (applied) {
          cleanCode = result;
          if (patchFailedCount > 0) {
            patchPartialFail = true;
          }
        } else {
          patchFailed = true;
          const extracted = extractStreamedCode(streamedCode);
          if (isSearchReplaceFormat(extracted)) {
            cleanCode = currentCodeRef.current;
          } else {
            cleanCode = extracted;
          }
        }
      } else {
        cleanCode = extractStreamedCode(streamedCode);
      }

      // ── Truncation guard ───────────────────────────────────
      // If the model hit max_tokens and the code was cut off mid-expression,
      // keep the previous working code and notify the user.
      const truncated = isLikelyTruncated(cleanCode);
      if (truncated) {
        console.warn("[useMakeChat] Code appears truncated — keeping previous code");
        cleanCode = currentCodeRef.current;
      }

      // ── Syntax validation guard ────────────────────────────
      // Parse with Babel to catch corrupted search/replace output
      if (!truncated && cleanCode !== currentCodeRef.current) {
        const jsxCheck = validateJSX(cleanCode);
        if (!jsxCheck.valid) {
          console.warn("[useMakeChat] Generated code has syntax errors — keeping previous code:", jsxCheck.error);
          cleanCode = currentCodeRef.current;
          patchFailed = true;
        }
      }

      // Calculate elapsed time
      const elapsed = Date.now() - startTime;
      const elapsedStr = elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`;

      // Build final chat
      const finalMessages: MakeChatMessage[] = [];
      finalMessages.push({
        id: codeMessageId,
        role: "assistant",
        content: `Worked for ${elapsedStr}`,
        messageType: "elapsed",
        thinking: reasoning || undefined,
        timestamp: Date.now(),
      });

      if (truncated) {
        finalMessages.push({
          id: nanoid(),
          role: "assistant",
          content:
            "The response was too long and got cut off. I kept your previous code. Try asking for a smaller, targeted change so the model can use search/replace patches instead of rewriting the entire file.",
          messageType: "status",
          timestamp: Date.now(),
        });
      } else if (patchFailed) {
        finalMessages.push({
          id: nanoid(),
          role: "assistant",
          content: `Patches didn't match — retrying with full file…`,
          messageType: "auto_fix",
          timestamp: Date.now(),
        });
        const retryHistory = [...newHistory, ...finalMessages];
        setChatHistory(retryHistory);
        chatHistoryRef.current = retryHistory;
        saveToStore(currentCodeRef.current, retryHistory);
        setIsLoading(false);
        setTimeout(() => {
          handleSend(
            "Your search/replace patches could not be applied because the SEARCH text did not match the current code. Please output the COMPLETE updated file (Format A — full file) instead of patches. Apply all the same changes you intended."
          );
        }, 100);
        return;
      } else if (patchPartialFail) {
        finalMessages.push({
          id: nanoid(),
          role: "assistant",
          content:
            `⚠ ${patchFailedCount} of ${patchTotalCount} patches could not be applied (search text didn't match). The other patches were applied successfully.`,
          messageType: "status",
          timestamp: Date.now(),
        });
        if (summary) {
          finalMessages.push({
            id: nanoid(),
            role: "assistant",
            content: summary,
            thinking: reasoning || undefined,
            timestamp: Date.now(),
          });
        }
      } else if (summary) {
        finalMessages.push({
          id: nanoid(),
          role: "assistant",
          content: summary,
          thinking: reasoning || undefined,
          timestamp: Date.now(),
        });
      }

      const finalHistory = [...newHistory, ...finalMessages];
      setChatHistory(finalHistory);
      setCurrentCode(cleanCode);
      saveToStore(cleanCode, finalHistory, msgText);

      // Notify consumer that exchange is complete
      onExchangeComplete?.(cleanCode);
    } catch (error: any) {
      if (error.name === "AbortError") {
        setChatHistory((prev) =>
          prev.map((m) =>
            m.id === aiMessageId
              ? { ...m, content: "Generation stopped.", messageType: "status" as const }
              : m
          )
        );
      } else {
        const errorMsg: MakeChatMessage = {
          ...aiMessage,
          content: `Error: ${error.message}. Make sure your API key is configured in .env.local`,
          messageType: "error",
        };
        const finalHistory = newHistory.concat(errorMsg);
        setChatHistory(finalHistory);
      }
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  // Keep ref in sync
  handleSendRef.current = handleSend;

  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  return {
    chatHistory,
    setChatHistory,
    currentCode,
    setCurrentCode,
    message,
    setMessage,
    isLoading,
    setIsLoading,
    aiProvider,
    setAiProvider,
    handleSend,
    handleSendRef,
    handleStop,
    flushToStore,
    saveToStore,
  };
}

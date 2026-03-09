"use client";

import { ChatMessage as ChatMessageCompact } from "@/components/chat";
import { NavigationContext } from "@/contexts/NavigationContext";
import {
  findOverlappingSessionForNodes,
  getSessionById,
} from "@/core/hooks/useDesignChat";
import { useAppStore, useObjects } from "@/core/state/store";
import { useTransientStore } from "@/core/state/transientStore";
import { worldToScreen } from "@/core/utils/coordinates";
import {
  calculateGroupBounds,
  groupSelectionsByParent,
} from "@/core/utils/selection";
import { nanoid } from "nanoid";
import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Icon16AiAssistant } from "../icons/icon-16-ai-assistant";
import { Icon16AiAssistantFilled } from "../icons/icon-16-ai-assistant-filled";
import { Icon16Check } from "../icons/icon-16-check";
import { Icon24ApprovedCheckmark } from "../icons/icon-24-approved-checkmark";
import { Icon24ChevronDownLarge } from "../icons/icon-24-chevron-down-large";
import { Icon24ChevronUpLarge } from "../icons/icon-24-chevron-up-large";
import { Icon24DockToSide } from "../icons/icon-24-dock-to-side";
import { Icon24Send } from "../icons/icon-24-send";

type EntrypointState = "loading" | "done" | null;

type EntrypointItem = {
  key: string;
  left: number;
  top: number;
  state: EntrypointState | "idle";
  type: "selection" | "persistent";
  sessionId?: string;
  objectIds?: string[];
};

const ENTRYPOINT_SIZE = 16;
const ENTRYPOINT_MARGIN = 4; // spacing from object (left and top)
const DONE_ENTRYPOINT_HOVER_GROUP = "done-entrypoint-hover";

/**
 * Unified on-canvas AI: selection star (when selection active), persistent entrypoint (loading/done), + mini prompt.
 * All portaled to document.body so clicks work. Same behavior as SelectionBox AI button.
 */
export default function OnCanvasAiPrompt({
  containerRef,
  isInteractive = true,
}: {
  containerRef?: React.RefObject<HTMLDivElement | null>;
  isInteractive?: boolean;
}) {
  const dragPositions = useTransientStore((s) => s.dragPositions);
  const resizeStates = useTransientStore((s) => s.resizeStates);
  const prompt = useAppStore((s) => s.onCanvasAiPrompt);
  const closePrompt = useAppStore((s) => s.closeOnCanvasAiPrompt);
  const openOnCanvasAiPrompt = useAppStore((s) => s.openOnCanvasAiPrompt);
  const dispatch = useAppStore((s) => s.dispatch);
  const navContext = useContext(NavigationContext);
  const viewport = useAppStore((s) => s.viewport);
  const objects = useObjects();
  const selectedIds = useAppStore((s) => s.selection.selectedIds) ?? [];
  const cropMode = useAppStore((s) => s.cropMode);
  const aiSessionStatuses = useAppStore((s) => s.aiSessionStatuses);

  // Entrypoint state (multiple threads: loading + done per session)
  const aiEditingGroups = useAppStore((s) => s.aiEditingGroups);
  const setAiEditingObjectsGroup = useAppStore(
    (s) => s.setAiEditingObjectsGroup,
  );
  const aiDesignChatLoadingSessionIds = useAppStore(
    (s) => s.aiDesignChatLoadingSessionIds,
  );
  const aiDesignChatDoneEntrypoints = useAppStore(
    (s) => s.aiDesignChatDoneEntrypoints,
  );
  const setAiDesignChatDoneEntrypointForSession = useAppStore(
    (s) => s.setAiDesignChatDoneEntrypointForSession,
  );
  const addAiDesignChatDoneSeenSession = useAppStore(
    (s) => s.addAiDesignChatDoneSeenSession,
  );
  const doneSeenSessionIds = useAppStore(
    (s) => s.aiDesignChatDoneSeenSessionIds,
  );

  const entrypointOpenGroupKeyRef = useRef<string | null>(null);
  const suppressSelectionCloseRef = useRef(false);

  const [message, setMessage] = useState("");
  const [forceNewThread, setForceNewThread] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const genAiModifyFrameRef = useRef<string | null>(null);
  const [persistentEntrypointPositions, setPersistentEntrypointPositions] =
    useState<
      {
        key: string;
        sessionId: string;
        objectIds: string[];
        state: EntrypointState;
        left: number;
        top: number;
      }[]
    >([]);
  const [hoveredEntrypointKey, setHoveredEntrypointKey] = useState<
    string | null
  >(null);

  const {
    isOpen,
    worldX,
    worldY,
    selectionFingerprint,
    resumeSessionId,
    resumeSessionTitle,
    openWithMiniChatExpanded,
  } = prompt;

  const setOnCanvasAiPromptOpenWithMiniChatExpanded = useAppStore(
    (s) => s.setOnCanvasAiPromptOpenWithMiniChatExpanded,
  );

  const effectiveSessionId = forceNewThread ? null : resumeSessionId;
  const effectiveSessionTitle = forceNewThread ? null : resumeSessionTitle;

  const sessionStatus = useAppStore((s) => {
    const id = effectiveSessionId || selectionFingerprint;
    return id ? s.aiSessionStatuses[id] : undefined;
  });

  const latestMessage = useAppStore((s) => {
    const id = effectiveSessionId || selectionFingerprint;
    return id ? s.aiSessionLatestMessage[id] : undefined;
  });

  const storedTitle = useAppStore((s) => {
    const id = effectiveSessionId || selectionFingerprint;
    return id ? s.aiSessionTitles[id] : undefined;
  });

  // Build list of persistent entrypoints (one per loading session, one per done session not seen)
  const persistentEntrypointsList = useMemo(() => {
    const list: {
      sessionId: string;
      objectIds: string[];
      state: EntrypointState;
    }[] = [];
    for (const sessionId of Object.keys(aiDesignChatLoadingSessionIds)) {
      const ids =
        aiEditingGroups[sessionId] &&
        Object.keys(aiEditingGroups[sessionId]).length > 0
          ? Object.keys(aiEditingGroups[sessionId])
          : [];
      if (ids.length > 0) {
        list.push({ sessionId, objectIds: ids, state: "loading" });
      }
    }
    for (const sessionId of Object.keys(aiDesignChatDoneEntrypoints)) {
      if (doneSeenSessionIds[sessionId]) continue;
      if (aiDesignChatLoadingSessionIds[sessionId]) continue;
      const { objectIds } = aiDesignChatDoneEntrypoints[sessionId];
      if (objectIds.length > 0) {
        list.push({ sessionId, objectIds, state: "done" });
      }
    }
    return list;
  }, [
    aiDesignChatLoadingSessionIds,
    aiDesignChatDoneEntrypoints,
    aiEditingGroups,
    doneSeenSessionIds,
  ]);

  // Clear done entrypoint for a session when it becomes "seen"
  useEffect(() => {
    for (const sessionId of Object.keys(aiDesignChatDoneEntrypoints)) {
      if (doneSeenSessionIds[sessionId]) {
        setAiDesignChatDoneEntrypointForSession(sessionId, null);
      }
    }
  }, [
    aiDesignChatDoneEntrypoints,
    doneSeenSessionIds,
    setAiDesignChatDoneEntrypointForSession,
  ]);

  // Selection matches any persistent entrypoint's objects (hide selection star to avoid duplicate)
  const selectionMatchesAnyPersistent =
    selectedIds.length > 0 &&
    persistentEntrypointsList.some(
      (p) =>
        p.objectIds.length === selectedIds.length &&
        p.objectIds.every((id) => selectedIds.includes(id)),
    );

  // Overlay transient resize states onto objects for accurate bounds during resize
  const effectiveObjects = useMemo(() => {
    if (!resizeStates || Object.keys(resizeStates).length === 0) return objects;
    const merged = { ...objects };
    for (const [id, rs] of Object.entries(resizeStates)) {
      if (merged[id]) {
        merged[id] = { ...merged[id], ...rs };
      }
    }
    return merged;
  }, [objects, resizeStates]);

  // Compute viewport positions for each persistent entrypoint
  const persistentEntrypointsBoundsKey = persistentEntrypointsList
    .map((p) => `${p.sessionId}:${p.objectIds.join(",")}`)
    .sort()
    .join("|");
  useLayoutEffect(() => {
    if (typeof document === "undefined" || !containerRef?.current) return;
    if (persistentEntrypointsList.length === 0) {
      setPersistentEntrypointPositions([]);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const next = persistentEntrypointsList
      .map(({ sessionId, objectIds, state }) => {
        const b = calculateGroupBounds(objectIds, effectiveObjects, dragPositions);
        if (!b || b.width <= 0 || b.height <= 0) return null;
        const left =
          Math.round(
            (rect.left +
              b.x * viewport.zoom +
              viewport.panX +
              b.width * viewport.zoom +
              2 +
              ENTRYPOINT_MARGIN) *
              10,
          ) / 10;
        const top =
          Math.round(
            (rect.top +
              b.y * viewport.zoom +
              viewport.panY +
              4 +
              ENTRYPOINT_MARGIN) *
              10,
          ) / 10;
        return {
          key: `persistent-${sessionId}`,
          sessionId,
          objectIds,
          state,
          left,
          top,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
    setPersistentEntrypointPositions((prev) => {
      if (prev.length !== next.length) return next;
      if (
        next.every(
          (n, i) =>
            prev[i]?.key === n.key &&
            prev[i]?.left === n.left &&
            prev[i]?.top === n.top &&
            prev[i]?.state === n.state,
        )
      )
        return prev;
      return next;
    });
  }, [
    persistentEntrypointsBoundsKey,
    persistentEntrypointsList,
    containerRef,
    effectiveObjects,
    dragPositions,
    viewport.zoom,
    viewport.panX,
    viewport.panY,
  ]);

  // Selection star: same as SelectionBox AI button when selection is active
  const overlapInfo = useMemo(
    () => findOverlappingSessionForNodes(selectedIds),
    [selectedIds, aiSessionStatuses],
  );
  const selectionStarStatus = overlapInfo?.status ?? "idle";

  const selectedIdsKey = selectedIds.join(",");
  const selectionStarKeysAndBounds = useMemo(() => {
    if (selectedIds.length === 0 || !isInteractive) return [];
    const groups = groupSelectionsByParent(selectedIds, effectiveObjects);
    const out: { key: string; screenLeft: number; screenTop: number }[] = [];
    for (const [parentId, objectIds] of Object.entries(groups)) {
      const inCropMode =
        cropMode.isActive &&
        objectIds.length === 1 &&
        objectIds[0] === cropMode.objectId;
      if (inCropMode) continue;
      const b = calculateGroupBounds(objectIds, effectiveObjects, dragPositions);
      if (b.width <= 0 || b.height <= 0) continue;
      const screenLeft =
        b.x * viewport.zoom + viewport.panX + b.width * viewport.zoom + 2;
      const screenTop = b.y * viewport.zoom + viewport.panY + 4;
      out.push({ key: parentId, screenLeft, screenTop });
    }
    return out;
  }, [
    selectedIdsKey,
    isInteractive,
    effectiveObjects,
    dragPositions,
    viewport.zoom,
    viewport.panX,
    viewport.panY,
    cropMode.isActive,
    cropMode.objectId,
  ]);

  const [selectionStarPositions, setSelectionStarPositions] = useState<
    { key: string; left: number; top: number }[]
  >([]);
  // Show selection star for any selection. When selection overlaps a session's last-touched objects, show idle/seen state and clicking resumes that thread; when it doesn't (e.g. original object after AI created variations), show idle only and clicking starts a new thread.
  const showSelectionStars =
    typeof document !== "undefined" &&
    isInteractive &&
    selectedIds.length > 0 &&
    selectionStarKeysAndBounds.length > 0 &&
    !!containerRef?.current;

  const selectionStarBoundsKey =
    showSelectionStars && selectionStarKeysAndBounds.length > 0
      ? selectionStarKeysAndBounds
          .map(
            ({ key, screenLeft, screenTop }) =>
              `${key}:${Math.round(screenLeft)}:${Math.round(screenTop)}`,
          )
          .join("|")
      : "";
  useLayoutEffect(() => {
    if (!showSelectionStars || !containerRef?.current) {
      setSelectionStarPositions([]);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    const next = selectionStarKeysAndBounds.map(
      ({ key, screenLeft, screenTop }) => ({
        key,
        left:
          Math.round((rect.left + screenLeft + ENTRYPOINT_MARGIN) * 10) / 10,
        top: Math.round((rect.top + screenTop + ENTRYPOINT_MARGIN) * 10) / 10,
      }),
    );
    setSelectionStarPositions((prev) => {
      if (prev.length !== next.length) return next;
      if (
        next.every(
          (n, i) => prev[i] && prev[i].left === n.left && prev[i].top === n.top,
        )
      )
        return prev;
      return next;
    });
  }, [showSelectionStars, selectionStarBoundsKey, containerRef]);

  const handleSelectionStarClick = useCallback(() => {
    if (selectedIds.length === 0) return;
    if (typeof window === "undefined") return;
    const groupKey = `prompt-${nanoid()}`;
    entrypointOpenGroupKeyRef.current = groupKey;
    setAiEditingObjectsGroup(groupKey, selectedIds, true);
    window.dispatchEvent(new CustomEvent("ai-assistant-open-with-selection"));
    const overlap = findOverlappingSessionForNodes(selectedIds);
    const worldBounds = calculateGroupBounds(selectedIds, objects);
    if (worldBounds) {
      let fp = [...selectedIds].sort().join(",");
      const wx = worldBounds.x + worldBounds.width;
      const wy = worldBounds.y;
      const sid = overlap?.sessionId ?? null;
      const title = overlap?.title ?? null;
      if (!sid) {
        const existingSession = getSessionById(fp);
        if (existingSession && existingSession.chatHistory.length > 0) {
          fp = `${fp}:${nanoid(6)}`;
        }
      }
      queueMicrotask(() => openOnCanvasAiPrompt(fp, wx, wy, sid, title));
    }
  }, [selectedIds, objects, openOnCanvasAiPrompt, setAiEditingObjectsGroup]);

  // Same flow as SelectionBox onAiAssistantClick: set selection (if needed), open-with-selection, then open prompt for that session.
  const handleEntrypointClick = useCallback(
    (
      sessionId: string,
      objectIds: string[],
      state: EntrypointState,
      e: React.MouseEvent,
    ) => {
      e.stopPropagation();
      e.preventDefault();
      if (objectIds.length === 0) return;

      const groupKey = `prompt-${nanoid()}`;
      entrypointOpenGroupKeyRef.current = groupKey;
      setAiEditingObjectsGroup(groupKey, objectIds, true);

      suppressSelectionCloseRef.current = true;
      dispatch({
        type: "selection.changed",
        payload: { selectedIds: objectIds, previousSelection: selectedIds },
      });

      window.dispatchEvent(new CustomEvent("ai-assistant-open-with-selection"));
      const overlap = findOverlappingSessionForNodes(objectIds);
      const worldBounds = calculateGroupBounds(objectIds, objects);
      if (worldBounds) {
        const fp = [...objectIds].sort().join(",");
        const wx = worldBounds.x + worldBounds.width;
        const wy = worldBounds.y;
        const sid = overlap?.sessionId ?? sessionId;
        const title = overlap?.title ?? undefined;
        queueMicrotask(() =>
          openOnCanvasAiPrompt(fp, wx, wy, sid, title ?? null),
        );
      }

      if (state === "done") {
        addAiDesignChatDoneSeenSession(sessionId);
        setAiDesignChatDoneEntrypointForSession(sessionId, null);
      }
    },
    [
      selectedIds,
      dispatch,
      openOnCanvasAiPrompt,
      addAiDesignChatDoneSeenSession,
      setAiDesignChatDoneEntrypointForSession,
      setAiEditingObjectsGroup,
      objects,
    ],
  );

  useEffect(() => {
    setForceNewThread(false);
    setExpanded(false);
    setMessage("");
  }, [selectionFingerprint]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      const id = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isOpen, selectionFingerprint]);

  useEffect(() => {
    if (!isOpen && entrypointOpenGroupKeyRef.current) {
      setAiEditingObjectsGroup(entrypointOpenGroupKeyRef.current, [], false);
      entrypointOpenGroupKeyRef.current = null;
    }
    if (!isOpen) {
      genAiModifyFrameRef.current = null;
    }
  }, [isOpen, setAiEditingObjectsGroup]);

  // Listen for "Modify controls" from the gen-ai popover
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { frameId: string } | undefined;
      if (!detail?.frameId) return;
      const fid = detail.frameId;
      genAiModifyFrameRef.current = fid;

      const obj = objects[fid];
      if (!obj) return;

      // Ensure the object is selected
      dispatch({
        type: "selection.set",
        payload: { ids: [fid] },
      });

      // Open the on-canvas prompt near the object
      const wx = obj.x + obj.width;
      const wy = obj.y;
      queueMicrotask(() => openOnCanvasAiPrompt(fid, wx, wy, null, null));
    };
    window.addEventListener("gen-ai-open-modify", handler);
    return () => window.removeEventListener("gen-ai-open-modify", handler);
  }, [objects, dispatch, openOnCanvasAiPrompt]);

  // When opening from entrypoint after a text-only response, expand mini chat by default
  useEffect(() => {
    if (isOpen && openWithMiniChatExpanded) {
      setExpanded(true);
      setOnCanvasAiPromptOpenWithMiniChatExpanded(false);
    }
  }, [
    isOpen,
    openWithMiniChatExpanded,
    setOnCanvasAiPromptOpenWithMiniChatExpanded,
  ]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 80)}px`;
    }
  }, [message]);

  // Close prompt when selection is cleared
  const selectionLabel = React.useMemo(() => {
    const names = selectedIds
      .map((id) => objects[id]?.name)
      .filter(Boolean)
      .slice(0, 3);
    if (names.length === 0) return "Selection";
    return names.length < selectedIds.length
      ? `${names.join(", ")} +${selectedIds.length - names.length}`
      : names.join(", ");
  }, [selectedIds, objects]);

  const prevSelectionRef = useRef(selectedIds);
  useEffect(() => {
    if (!isOpen) {
      prevSelectionRef.current = selectedIds;
      return;
    }
    // Explicitly close when selection is cleared (e.g. user clicked canvas background)
    if (selectedIds.length === 0) {
      suppressSelectionCloseRef.current = false;
      closePrompt();
      prevSelectionRef.current = selectedIds;
      return;
    }
    if (prevSelectionRef.current !== selectedIds) {
      if (suppressSelectionCloseRef.current) {
        suppressSelectionCloseRef.current = false;
      } else {
        closePrompt();
      }
    }
    prevSelectionRef.current = selectedIds;
  }, [selectedIds, isOpen, closePrompt]);

  const handleSend = useCallback(() => {
    const text = message.trim();
    if (!text || !selectionFingerprint) return;

    // If opened via "Modify controls", route through gen-ai pipeline
    if (genAiModifyFrameRef.current) {
      window.dispatchEvent(
        new CustomEvent("gen-ai-modify-send", {
          detail: {
            message: text,
            frameId: genAiModifyFrameRef.current,
          },
        }),
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("ai-mini-prompt-send", {
          detail: {
            message: text,
            fingerprint: selectionFingerprint,
            sessionId: effectiveSessionId ?? undefined,
          },
        }),
      );
    }

    setMessage("");
    closePrompt();
  }, [
    message,
    selectionFingerprint,
    effectiveSessionId,
    closePrompt,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === "Escape") {
        closePrompt();
      }
    },
    [handleSend, closePrompt],
  );

  const handleOpenChat = useCallback(() => {
    const sessionToOpen = effectiveSessionId || selectionFingerprint;
    if (navContext && sessionToOpen) {
      window.dispatchEvent(new CustomEvent("ai-assistant-open-with-selection"));
      window.dispatchEvent(
        new CustomEvent("ai-open-chat-session", {
          detail: { sessionId: sessionToOpen },
        }),
      );
      navContext.setActiveTab("ai-assistant");
    }
    closePrompt();
  }, [navContext, effectiveSessionId, selectionFingerprint, closePrompt]);

  const isDone = sessionStatus === "done";
  const isLoading = sessionStatus === "loading";
  const bounds =
    selectedIds.length > 0 ? calculateGroupBounds(selectedIds, objects) : null;
  const hasDrag = selectedIds.some((id) => dragPositions[id]);
  const hasResize = selectedIds.some((id) => resizeStates[id]);
  let anchorWorld: { x: number; y: number };
  if (hasResize) {
    let maxRight = -Infinity;
    let minTop = Infinity;
    for (const id of selectedIds) {
      const rs = resizeStates[id];
      if (rs) {
        if (rs.x + rs.width > maxRight) maxRight = rs.x + rs.width;
        if (rs.y < minTop) minTop = rs.y;
      } else {
        const obj = objects[id];
        if (!obj) continue;
        if (obj.x + obj.width > maxRight) maxRight = obj.x + obj.width;
        if (obj.y < minTop) minTop = obj.y;
      }
    }
    anchorWorld = { x: maxRight, y: minTop };
  } else if (hasDrag && bounds) {
    let maxRight = -Infinity;
    let minTop = Infinity;
    for (const id of selectedIds) {
      const obj = objects[id];
      if (!obj) continue;
      const pos = dragPositions[id] || { x: obj.x, y: obj.y };
      if (pos.x + obj.width > maxRight) maxRight = pos.x + obj.width;
      if (pos.y < minTop) minTop = pos.y;
    }
    anchorWorld = { x: maxRight, y: minTop };
  } else if (bounds) {
    anchorWorld = { x: bounds.x + bounds.width, y: bounds.y };
  } else {
    anchorWorld = { x: worldX, y: worldY };
  }
  const screenPos = worldToScreen(anchorWorld, viewport);
  const win = typeof window !== "undefined" ? window : null;
  const promptLeft = win
    ? Math.min(screenPos.x + 80, win.innerWidth - 320)
    : screenPos.x + 80;
  const promptTopBase = win
    ? Math.max(40, Math.min(screenPos.y, win.innerHeight - 200)) - 8
    : screenPos.y - 8;
  const promptTop =
    isDone || isLoading ? Math.max(40, promptTopBase - 40) : promptTopBase;

  // Single list: selection entrypoints (one per group) + multiple persistent (one per loading/done session)
  // When selection matches any persistent's context, hide selection stars to avoid duplicate entrypoints
  const unifiedEntrypoints = useMemo((): EntrypointItem[] => {
    const out: EntrypointItem[] = [];
    const hideSelectionStarsWhenPersistentShown = selectionMatchesAnyPersistent;
    if (
      showSelectionStars &&
      selectionStarPositions.length > 0 &&
      !hideSelectionStarsWhenPersistentShown
    ) {
      for (const { key, left, top } of selectionStarPositions) {
        out.push({
          key: `selection-${key}`,
          left,
          top,
          state:
            selectionStarStatus === "loading"
              ? "loading"
              : selectionStarStatus === "done"
                ? "done"
                : "idle",
          type: "selection",
        });
      }
    }
    for (const {
      key,
      sessionId,
      objectIds,
      state,
      left,
      top,
    } of persistentEntrypointPositions) {
      out.push({
        key,
        left,
        top,
        state,
        type: "persistent",
        sessionId,
        objectIds,
      });
    }
    return out;
  }, [
    showSelectionStars,
    selectionStarPositions,
    selectionStarStatus,
    selectionMatchesAnyPersistent,
    persistentEntrypointPositions,
  ]);

  // Seen = selection overlaps a session that the user has already acknowledged (only when we have overlap)
  const isSelectionSeen = !!(
    overlapInfo?.sessionId && doneSeenSessionIds[overlapInfo.sessionId]
  );

  const getEntrypointTitle = (state: EntrypointState | "idle") =>
    state === "loading"
      ? "AI is working..."
      : state === "done"
        ? "AI finished — click to follow up"
        : "Ask AI Assistant";

  const handleUnifiedEntrypointClick = useCallback(
    (
      type: "selection" | "persistent",
      e: React.MouseEvent,
      item?: EntrypointItem,
    ) => {
      e.stopPropagation();
      e.preventDefault();
      if (type === "selection") handleSelectionStarClick();
      else if (item?.sessionId && item?.objectIds && item.state !== "idle")
        handleEntrypointClick(
          item.sessionId,
          item.objectIds,
          item.state as EntrypointState,
          e,
        );
    },
    [handleSelectionStarClick, handleEntrypointClick],
  );

  const entrypointNodes =
    unifiedEntrypoints.length > 0 ? (
      <>
        {unifiedEntrypoints.map((item) => {
          const { key, left, top, state, type } = item;
          const isHovered = hoveredEntrypointKey === key;
          const isActive = isOpen;
          const isHighlighted = isHovered || isActive;
          const isSeen = type === "selection" && isSelectionSeen;
          // Once seen, re-selecting shows white + outline (seen state), not green checkmark (done state).
          // When the prompt is open, always show filled star + blue bg (unless done state takes precedence).
          const doneTakesPrecedence = state === "done" && !isSeen;
          const showHighlightedStyle =
            (isHighlighted && !doneTakesPrecedence && !isSeen) ||
            (isOpen && !doneTakesPrecedence);
          const isLoadingState = state === "loading";
          const hasSolidBg =
            showHighlightedStyle ||
            isSeen ||
            doneTakesPrecedence ||
            isLoadingState;
          return (
            <button
              key={key}
              type="button"
              className={hasSolidBg ? "shadow-200" : undefined}
              onClick={(e) =>
                handleUnifiedEntrypointClick(
                  type,
                  e,
                  unifiedEntrypoints.find((i) => i.key === key),
                )
              }
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
              onMouseEnter={() => {
                setHoveredEntrypointKey(key);
                if (
                  type === "persistent" &&
                  state === "done" &&
                  item.objectIds &&
                  item.objectIds.length > 0
                ) {
                  setAiEditingObjectsGroup(
                    DONE_ENTRYPOINT_HOVER_GROUP,
                    item.objectIds,
                    true,
                  );
                }
              }}
              onMouseLeave={() => {
                setHoveredEntrypointKey(null);
                setAiEditingObjectsGroup(
                  DONE_ENTRYPOINT_HOVER_GROUP,
                  [],
                  false,
                );
              }}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleUnifiedEntrypointClick(
                    type,
                    e as unknown as React.MouseEvent,
                  );
                }
              }}
              aria-label={getEntrypointTitle(state)}
              title={getEntrypointTitle(state)}
              style={{
                position: "fixed",
                left,
                top,
                width: ENTRYPOINT_SIZE,
                height: ENTRYPOINT_SIZE,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10,
                borderRadius: "5px",
                backgroundColor: doneTakesPrecedence
                  ? "var(--color-success, #0D99FF)"
                  : showHighlightedStyle || isLoadingState
                    ? "var(--color-bg-brand, #0D99FF)"
                    : isSeen
                      ? "var(--color-bg, #ffffff)"
                      : "transparent",
                pointerEvents: "auto",
                border: "none",
                padding: 0,
              }}
            >
              <span style={{ display: "flex", pointerEvents: "none" }}>
                {state === "loading" ? (
                  <svg
                    width={12}
                    height={12}
                    viewBox="0 0 16 16"
                    fill="none"
                    className="animate-spin"
                    style={{ color: "white", flexShrink: 0 }}
                  >
                    <circle
                      cx="8"
                      cy="8"
                      r="6"
                      stroke="currentColor"
                      strokeOpacity="0.25"
                      strokeWidth="2"
                    />
                    <path
                      d="M14 8a6 6 0 0 0-6-6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : doneTakesPrecedence ? (
                  <Icon16Check className="text-white" />
                ) : showHighlightedStyle ? (
                  <Icon16AiAssistantFilled
                    className="text-white"
                    style={{ width: 16, height: 16 }}
                  />
                ) : isSeen ? (
                  <Icon16AiAssistant
                    style={{
                      width: 16,
                      height: 16,
                      color: "var(--color-bg-brand, #0D99FF)",
                    }}
                  />
                ) : (
                  <Icon16AiAssistant
                    className="group-hover:text-brand text-secondary"
                    style={{ width: 16, height: 16 }}
                  />
                )}
              </span>
            </button>
          );
        })}
      </>
    ) : null;

  const promptNode = isOpen ? (
    <div
      className="fixed z-[10000]"
      style={{
        left: `${promptLeft}px`,
        top: `${promptTop}px`,
        pointerEvents: "auto",
        borderRadius: "13px",
        backgroundColor: "var(--color-bg)",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="flex flex-col rounded-[13px] shadow-200 overflow-hidden"
        style={{
          width: "320px",
          backgroundColor: "var(--color-bg-secondary)",
        }}
      >
        {/* Thread status header */}
        {(isDone || isLoading) && (
          <div className="flex items-center gap-2 w-full px-2 py-1 bg-secondary">
            {isDone && (
              <Icon24ApprovedCheckmark
                className="flex-shrink-0"
                style={{ color: "var(--color-icon-success, #0fa958)" }}
              />
            )}
            <button
              onClick={handleOpenChat}
              className="flex-1 text-[12px] truncate text-left transition-colors hover:underline"
              style={{
                color: "var(--color-text-secondary)",
                cursor: "default",
              }}
            >
              {isLoading && latestMessage
                ? latestMessage
                : storedTitle || effectiveSessionTitle || selectionLabel}
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={handleOpenChat}
                className="flex-shrink-0 rounded-md p-1 transition-colors hover:bg-[var(--color-bg-secondary)]"
                title="Dock to side"
                aria-label="Dock to side"
              >
                <Icon24DockToSide className="flex-shrink-0" />
              </button>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex-shrink-0 rounded-md transition-colors hover:bg-[var(--color-bg-secondary)]"
              >
                {!expanded ? (
                  <Icon24ChevronUpLarge className="flex-shrink-0" />
                ) : (
                  <Icon24ChevronDownLarge className="flex-shrink-0" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Continuing thread hint */}
        {effectiveSessionTitle && !isDone && !isLoading && (
          <div
            className="flex items-center justify-between px-3 pt-2 pb-0 text-[11px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            <span className="truncate">
              Continuing: {effectiveSessionTitle}
            </span>
            <button
              onClick={() => setForceNewThread(true)}
              className="flex-shrink-0 ml-2 hover:underline"
              style={{ color: "var(--color-text-secondary)" }}
            >
              New thread
            </button>
          </div>
        )}
        <div className="flex flex-col gap-2 bg-[var(--color-bg-secondary)] rounded-[13px] shadow-200 overflow-hidden">
          <div className="flex flex-col bg-[var(--color-bg)]">
            {/* Expanded thread preview */}
            {expanded && (isDone || isLoading) && (
              <ThreadPreview
                sessionId={effectiveSessionId || selectionFingerprint}
              />
            )}
            <div className="flex items-end gap-1.5 p-3 bg-[var(--color-bg)]">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  effectiveSessionTitle ? "Follow up..." : "Describe your edit"
                }
                disabled={isLoading}
                rows={1}
                className="flex-1 text-[13px] leading-[24px] resize-none outline-none bg-transparent placeholder:text-[var(--color-text-tertiary)]"
                style={{
                  color: "var(--color-text)",
                  minHeight: "24px",
                  maxHeight: "80px",
                }}
              />
              <button
                onClick={handleSend}
                disabled={!message.trim() || isLoading}
                className="flex-shrink-0 w-6 h-6 rounded-[9999] flex items-center justify-center transition-colors"
                style={{
                  backgroundColor:
                    message.trim() && !isLoading
                      ? "var(--color-bg-brand, #0D99FF)"
                      : "var(--color-bg-tertiary)",
                  cursor:
                    message.trim() && !isLoading ? "default" : "not-allowed",
                }}
              >
                <Icon24Send className="text-white ml-px" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  if (!entrypointNodes && !promptNode) return null;

  return createPortal(
    <>
      {entrypointNodes}
      {promptNode}
    </>,
    document.body,
  );
}

function ThreadPreview({ sessionId }: { sessionId: string | null }) {
  if (!sessionId) return null;
  const session = getSessionById(sessionId);
  if (!session || session.chatHistory.length === 0) return null;

  const history = session.chatHistory;
  const lastAssistant = [...history]
    .reverse()
    .find(
      (m) =>
        m.role === "assistant" &&
        m.messageType !== "tool_activity" &&
        m.messageType !== "status",
    );
  const lastUser = [...history]
    .reverse()
    .find((m) => m.role === "user" && m.messageType !== "auto_followup");

  const messages = [lastUser, lastAssistant].filter(Boolean);
  if (messages.length === 0) return null;

  return (
    <div
      className="flex flex-col gap-2.5 px-4 py-4 overflow-y-auto border-b"
      style={{
        maxHeight: "240px",
        borderColor: "var(--color-border)",
      }}
    >
      {messages.map((msg) => (
        <ChatMessageCompact key={msg!.id} msg={msg!} variant="compact" />
      ))}
    </div>
  );
}

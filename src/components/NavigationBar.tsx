"use client";

import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon24Figma } from "./icons/icon-24-figma";
import { Icon24PageSmall } from "./icons/icon-24-page-small";
import { Icon24Insert } from "./icons/icon-24-insert";
import { Icon24AiAssistant } from "./icons/icon-24-ai-assistant";
import { Icon24Search } from "./icons/icon-24-search";
import { Icon24ChevronDown } from "./icons/icon-24-chevron-down";
import { Icon16Check } from "./icons/icon-16-check";

import FigmaMenu from "./FigmaMenu";
import { useNavigation, NavigationTab } from "@/contexts/NavigationContext";
import { useAppStore } from "@/core/state/store";

const AI_POPOVER_HOVER_OPEN_MS = 600;
const AI_POPOVER_HOVER_CLOSE_MS = 150;
const AI_POPOVER_WIDTH = 320;
const AI_POPOVER_MAX_HEIGHT = 380;
const THUMBNAIL_SIZE = 32;

function formatThreadTime(shownAt: number): string {
  if (!shownAt) return "In progress";
  const diff = Date.now() - shownAt;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} mins ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}



function RailDivider({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div 
        className="absolute h-px left-0 right-0 top-1/2 translate-y-[-50%]"
        style={{ backgroundColor: "var(--color-border)" }}
      />
    </div>
  );
}


interface NavigationBarProps {
  className?: string;
}

export default function NavigationBar({ className }: NavigationBarProps) {
  const { activeTab, setActiveTab } = useNavigation();
  const closeMakeEditor = useAppStore((state) => state.closeMakeEditor);
  const isMakeEditorOpen = useAppStore((state) => state.makeEditor.isOpen);

  const aiDesignChatLoadingSessionIds = useAppStore((s) => s.aiDesignChatLoadingSessionIds);
  const aiDesignChatDoneEntrypoints = useAppStore((s) => s.aiDesignChatDoneEntrypoints);
  const aiDesignChatDoneSeenSessionIds = useAppStore((s) => s.aiDesignChatDoneSeenSessionIds);
  const aiDesignChatSessionLastActivity = useAppStore(
    (s) => s.aiDesignChatSessionLastActivity,
  );
  const aiSessionTitles = useAppStore((s) => s.aiSessionTitles);
  const aiSessionLastPrompt = useAppStore((s) => s.aiSessionLastPrompt);

  const hasLoadingThreads = Object.keys(aiDesignChatLoadingSessionIds).length > 0;
  const hasUnseenDoneThreads = Object.keys(aiDesignChatDoneEntrypoints).some(
    (sessionId) => !aiDesignChatDoneSeenSessionIds[sessionId],
  );
  const aiAssistantStatus: "loading" | "done" | null = hasLoadingThreads
    ? "loading"
    : hasUnseenDoneThreads
      ? "done"
      : null;

  // Last 5 chats by most recent activity (message sent or AI completed)
  const LAST_CHATS_COUNT = 5;
  const aiThreadsForPopover = React.useMemo(() => {
    const entries = Object.entries(aiDesignChatSessionLastActivity)
      .sort(([, a], [, b]) => b - a)
      .slice(0, LAST_CHATS_COUNT)
      .map(([sessionId, lastActivityAt]) => {
        const isLoading = !!aiDesignChatLoadingSessionIds[sessionId];
        const doneData = aiDesignChatDoneEntrypoints[sessionId];
        const isDone =
          !!doneData &&
          doneData.objectIds.length > 0 &&
          !aiDesignChatDoneSeenSessionIds[sessionId];
        const status: "loading" | "done" | "idle" = isLoading
          ? "loading"
          : isDone
            ? "done"
            : "idle";
        return { sessionId, lastActivityAt, status };
      });
    return entries;
  }, [
    aiDesignChatSessionLastActivity,
    aiDesignChatLoadingSessionIds,
    aiDesignChatDoneEntrypoints,
    aiDesignChatDoneSeenSessionIds,
  ]);

  const [aiPopoverOpen, setAiPopoverOpen] = useState(false);
  const [aiPopoverPosition, setAiPopoverPosition] = useState({ left: 56, top: 120 });
  const aiButtonRef = useRef<HTMLButtonElement>(null);
  const aiPopoverRef = useRef<HTMLDivElement>(null);
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    if (!aiPopoverOpen || !aiButtonRef.current) return;
    const rect = aiButtonRef.current.getBoundingClientRect();
    setAiPopoverPosition({ left: rect.right + 8, top: rect.top });
  }, [aiPopoverOpen]);

  const clearAiPopoverTimeouts = useCallback(() => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const handleAiButtonMouseEnter = useCallback(() => {
    clearAiPopoverTimeouts();
    closeTimeoutRef.current = null;
    openTimeoutRef.current = setTimeout(() => setAiPopoverOpen(true), AI_POPOVER_HOVER_OPEN_MS);
  }, [clearAiPopoverTimeouts]);

  const handleAiButtonMouseLeave = useCallback(() => {
    clearAiPopoverTimeouts();
    openTimeoutRef.current = null;
    closeTimeoutRef.current = setTimeout(() => setAiPopoverOpen(false), AI_POPOVER_HOVER_CLOSE_MS);
  }, [clearAiPopoverTimeouts]);

  const handleAiPopoverMouseEnter = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const handleAiPopoverMouseLeave = useCallback(() => {
    setAiPopoverOpen(false);
  }, []);

  const handleThreadClick = useCallback(
    (sessionId: string) => {
      clearAiPopoverTimeouts();
      setAiPopoverOpen(false);
      setActiveTab("ai-assistant");
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("ai-open-chat-session", { detail: { sessionId } }),
        );
      }
    },
    [setActiveTab, clearAiPopoverTimeouts],
  );

  const handleTabClick = (tab: NavigationTab) => {
    if (isMakeEditorOpen) {
      closeMakeEditor();
    }
    setActiveTab(tab);
  };

  // Define the button configurations
  const canvasActions = [
    {
      id: 'page' as NavigationTab,
      icon: Icon24PageSmall,
      onClick: () => handleTabClick('page'),
    },
    {
      id: 'insert' as NavigationTab,
      icon: Icon24Insert,
      onClick: () => handleTabClick('insert'),
    },
    {
      id: 'search' as NavigationTab,
      icon: Icon24Search,
      onClick: () => handleTabClick('search'),
    },
    {
      id: 'ai-assistant' as NavigationTab,
      icon: Icon24AiAssistant,
      onClick: () => {
        clearAiPopoverTimeouts();
        setAiPopoverOpen(false);
        handleTabClick('ai-assistant');
      },
    },
  ];

  return (
    <div 
      className={`h-full w-[48px] border-r select-none flex-shrink-0 ${className || ""}`}
      style={{
        backgroundColor: "var(--color-bg-elevated)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="box-border flex flex-col h-full items-center overflow-hidden pb-0 pt-[8px] px-0">
        {/* Figma Logo */}
        <div className="relative shrink-0 size-[32px] mb-0">
              <FigmaMenu />

        </div>

        {/* Top Divider */}
        <div className="h-[16px] overflow-hidden relative shrink-0 w-[48px]">
          <RailDivider className="absolute h-px left-1/2 top-[calc(50%+0.5px)] translate-x-[-50%] translate-y-[-50%] w-[16px]" />
        </div>

        {/* Canvas Actions */}
        <div className="box-border flex flex-col gap-[8px] items-center px-0 py-[4px] relative shrink-0 w-full">
          {canvasActions.map((action) => {
            const isSelected = activeTab === action.id;
            const showAiStatus = action.id === "ai-assistant" && aiAssistantStatus != null;
            const isAiAssistant = action.id === "ai-assistant";
            return (
              <div
                key={action.id}
                className="relative"
                onMouseEnter={isAiAssistant ? handleAiButtonMouseEnter : undefined}
                onMouseLeave={isAiAssistant ? handleAiButtonMouseLeave : undefined}
              >
                <button
                  ref={isAiAssistant ? aiButtonRef : undefined}
                  className={`relative shrink-0 size-[32px] flex items-center justify-center rounded-[4px] ${
                    isSelected
                      ? ""
                      : "hover:bg-[var(--color-bg-secondary)] transition-colors"
                  }`}
                  style={isSelected ? { backgroundColor: "var(--color-bg-selected)" } : {}}
                  onClick={action.onClick}
                >
                  <div
                    style={isSelected ? { color: "var(--color-icon-brand)" } : {}}
                    className="flex items-center justify-center"
                  >
                    <action.icon />
                  </div>
                  {showAiStatus && (
                    <div
                      className="absolute right-0 bottom-0 flex items-center justify-center rounded-full"
                      style={{
                        width: aiAssistantStatus === "done" ? 8 : 14,
                        height: aiAssistantStatus === "done" ? 8 : 14,
                        backgroundColor:
                          aiAssistantStatus === "loading"
                            ? "var(--color-bg)"
                            : "var(--color-bg-brand)",
                      }}
                    >
                      {aiAssistantStatus === "loading" ? (
                        <svg
                          width={8}
                          height={8}
                          viewBox="0 0 16 16"
                          fill="none"
                          className="animate-spin"
                          style={{ color: "var(--color-icon)", flexShrink: 0 }}
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
                          />
                        </svg>
                      ) : (
                        <span className="[&_path]:!fill-white" style={{ display: "flex" }}>
                        </span>
                      )}
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* AI threads popover (hover on rail entrypoint) — styled like "Active chat threads" design */}
        {typeof document !== "undefined" &&
          aiPopoverOpen &&
          createPortal(
            <div
              ref={aiPopoverRef}
              className="overflow-hidden"
              style={{
                position: "fixed",
                left: aiPopoverPosition.left,
                top: aiPopoverPosition.top,
                width: AI_POPOVER_WIDTH,
                borderRadius: 12,
                boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                maxHeight: AI_POPOVER_MAX_HEIGHT,
                backgroundColor: "#ffffff",
                border: "1px solid var(--color-border)",
                zIndex: 10000,
              }}
              onMouseEnter={handleAiPopoverMouseEnter}
              onMouseLeave={handleAiPopoverMouseLeave}
            >
              <div
                className="px-4 pt-4 pb-3 border-b"
                style={{
                  borderColor: "var(--color-border)",
                }}
              >
                <div
                  className="font-semibold text-[11px]"
                  style={{
                    color: "var(--color-text)",
                    margin: 0,
                  }}
                >
                  Latest chats
                </div>
              </div>
              <div
                className="overflow-y-auto"
                style={{ maxHeight: AI_POPOVER_MAX_HEIGHT - 52 }}
              >
                {aiThreadsForPopover.length === 0 ? (
                  <div
                    className="px-4 py-6 text-center"
                    style={{
                      color: "var(--color-text-secondary)",
                      fontSize: 11,
                    }}
                  >
                    No recent chats
                  </div>
                ) : (
                  <div className="py-2">
                    {aiThreadsForPopover.map(({ sessionId, status, lastActivityAt }) => {
                      const title = aiSessionTitles[sessionId] || "Untitled";
                      const lastPrompt = aiSessionLastPrompt[sessionId];
                      const timeLabel = formatThreadTime(lastActivityAt);
                      const isDone = status === "done";
                      const isLoading = status === "loading";
                      const description =
                        isLoading
                          ? "AI is working…"
                          : lastPrompt
                            ? lastPrompt
                            : isDone
                              ? "Continue conversation…"
                              : "Open thread…";
                      return (
                        <button
                          key={sessionId}
                          type="button"
                          className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[var(--color-bg-secondary)] transition-colors"
                          onClick={() => handleThreadClick(sessionId)}
                        >
                          {/* Thumbnail area (rounded square) with optional status overlay */}
                          <div
                            className="relative flex-shrink-0 flex items-center justify-center rounded-[5px]"
                            style={{
                              width: THUMBNAIL_SIZE,
                              height: THUMBNAIL_SIZE,
                              backgroundColor: "var(--color-bg-secondary)",
                              border: "1px solid var(--color-border)",
                            }}
                          >
                            {isLoading && (
                              <div
                                className="absolute bottom-[-4px] right-[-4px] rounded-[5px] flex items-center justify-center"
                                style={{
                                  width: 20,
                                  height: 20,
                                  backgroundColor: "var(--color-bg)",
                                }}
                              >
                                <span
                                  className="font-bold leading-none"
                                  style={{
                                    color: "var(--color-icon)",
                                    fontSize: 10,
                                    letterSpacing: 0.5,
                                  }}
                                >
                                    <svg
                                    width={12}
                                    height={12}
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    className="animate-spin"
                                    style={{ color: "var(--color-icon)", flexShrink: 0 }}
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
                                    />
                                  </svg>
                                </span>
                              </div>
                            )}
                            {isDone && (
                              <Icon16Check
                                className="flex-shrink-0 [&_path]:!fill-[var(--color-success)]"
                                style={{ width: 20, height: 20 }}
                              />
                            )}
                          </div>
                          {/* Title, timestamp, and description */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap justify-between">
                              <span
                                className="font-semibold truncate"
                                style={{
                                  color: "var(--color-text)",
                                  fontSize: 11,
                                }}
                              >
                                {title}
                              </span>
                              <div className="flex items-center gap-2">
                              <span
                                className="flex-shrink-0"
                                style={{
                                  color: "var(--color-text-secondary)",
                                  fontSize: 11,
                                }}
                              >
                                {timeLabel}.
                              </span>
                              {isDone && (
                                <span
                                  className="flex-shrink-0 rounded-full"
                                  style={{
                                    width: 6,
                                    height: 6,
                                    backgroundColor: "var(--color-bg-brand, #0D99FF)",
                                  }}
                                  aria-hidden
                                />
                              )}
                              </div>
                            </div>
                            <p
                              className="mt-0.5 line-clamp-2"
                              style={{
                                color: "var(--color-text-secondary)",
                                fontSize: 11,
                                margin: 0,
                              }}
                            >
                              {description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )}

        {/* Bottom Spacer - pushes notifications to bottom */}
        <div className="flex-1" />

        {/* Notifications Section - positioned at bottom */}
        <div className="box-border flex flex-col gap-[8px] items-center justify-end pb-[8px] pt-0 px-0 w-[48px]">
          {/* Placeholder for future notification icons */}
        </div>
      </div>
    </div>
  );
}

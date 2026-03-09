"use client";

import { useMakeChat } from "@/core/hooks/useMakeChat";
import { useAppStore } from "@/core/state/store";
import { useEffect, useRef } from "react";

/**
 * Headless component that processes pending Make chat messages
 * (e.g. "Update from design" prompts) without showing any UI.
 * The actual AI processing happens via useMakeChat; results
 * are written directly to the Make's code and chat history.
 */
export default function OnCanvasMakeChat() {
  const onCanvasMakeChat = useAppStore((s) => s.onCanvasMakeChat);
  const { isOpen, makeId, pendingMessage } = onCanvasMakeChat;

  const { isLoading, handleSendRef } = useMakeChat({
    objectId: makeId,
    active: isOpen && !!makeId,
  });

  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  const pendingMessageRef = useRef(pendingMessage);
  pendingMessageRef.current = pendingMessage;

  // Auto-send pending message, polling until the hook is ready
  useEffect(() => {
    if (!isOpen || !makeId) return;

    const id = setInterval(() => {
      const msg = pendingMessageRef.current;
      if (!msg) {
        clearInterval(id);
        return;
      }
      if (handleSendRef.current && !isLoadingRef.current) {
        handleSendRef.current(msg);
        useAppStore.setState((draft) => {
          draft.onCanvasMakeChat.pendingMessage = null;
        });
        clearInterval(id);
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, makeId, pendingMessage]);

  return null;
}

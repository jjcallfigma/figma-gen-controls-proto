"use client";

import { useAppStore, useObjects } from "@/core/state/store";
import {
  buildUpdateMakePrompt,
  serializeDesignTree,
} from "@/core/utils/designSerializer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";

/**
 * Floating toolbar shown when the user selects extracted design objects
 * that have been modified since extraction. Offers an "Update make"
 * action that opens the sidebar AI chat with a diff-based prompt.
 */
export default function DesignChangesToolbar() {
  const objects = useObjects();
  const dispatch = useAppStore((state) => state.dispatch);
  const selectedIds = useAppStore((state) => state.selection.selectedIds);
  const extractMode = useAppStore((state) => state.extractMode);
  const aiSessionStatuses = useAppStore((state) => state.aiSessionStatuses);


  const [activeFingerprint, setActiveFingerprint] = useState<string | null>(
    null,
  );
  const extractedRootIdRef = useRef<string | null>(null);

  const extractedRoot = useMemo(() => {
    if (extractMode.isActive) return null;

    for (const id of selectedIds) {
      const obj = objects[id];
      if (!obj) continue;

      if (obj.sourceMakeId && obj.sourceDesignSnapshot && objects[obj.sourceMakeId]) {
        return obj;
      }

      // Walk up parent chain to find extracted root from nested selections
      if (obj.sourceMakeId) {
        let parent = obj.parentId ? objects[obj.parentId] : undefined;
        while (parent) {
          if (parent.sourceMakeId && parent.sourceDesignSnapshot && objects[parent.sourceMakeId]) {
            return parent;
          }
          parent = parent.parentId ? objects[parent.parentId] : undefined;
        }
      }
    }
    return null;
  }, [selectedIds, objects, extractMode.isActive]);

  const hasChanges = useMemo(() => {
    if (!extractedRoot) return false;
    const currentTree = serializeDesignTree(extractedRoot.id, objects);
    return currentTree !== extractedRoot.sourceDesignSnapshot;
  }, [extractedRoot, objects]);

  const sessionStatus = activeFingerprint
    ? aiSessionStatuses[activeFingerprint]
    : undefined;
  const isUpdating = sessionStatus === "loading";

  // When the session finishes, reset the snapshot so the toolbar disappears
  useEffect(() => {
    if (sessionStatus !== "done" || !extractedRootIdRef.current) return;

    const rootId = extractedRootIdRef.current;
    const obj = useAppStore.getState().objects[rootId];
    if (obj) {
      const tmpObjects = useAppStore.getState().objects;
      const newSnapshot = serializeDesignTree(rootId, tmpObjects);
      dispatch({
        type: "object.updated",
        payload: {
          id: rootId,
          changes: { sourceDesignSnapshot: newSnapshot },
          previousValues: {
            sourceDesignSnapshot: obj.sourceDesignSnapshot,
          },
        },
      });
    }

    setActiveFingerprint(null);
    extractedRootIdRef.current = null;
  }, [sessionStatus, dispatch]);

  const handleUpdateMake = useCallback(() => {
    if (!extractedRoot || !extractedRoot.sourceMakeId) return;

    const sourceMakeId = extractedRoot.sourceMakeId;
    const currentTree = serializeDesignTree(extractedRoot.id, objects);
    const updateMessage = buildUpdateMakePrompt(
      currentTree,
      extractedRoot.sourceDesignSnapshot,
    );

    const fingerprint = `update-make-${sourceMakeId}-${Date.now()}`;
    setActiveFingerprint(fingerprint);
    extractedRootIdRef.current = extractedRoot.id;

    window.dispatchEvent(new CustomEvent("ai-assistant-show"));

    window.dispatchEvent(
      new CustomEvent("ai-mini-prompt-send", {
        detail: {
          message: updateMessage,
          fingerprint,
          objectIds: [sourceMakeId],
        },
      }),
    );
  }, [extractedRoot, objects]);

  if (!extractedRoot || (!hasChanges && !isUpdating)) return null;

  const sourceMake = objects[extractedRoot.sourceMakeId!];
  const makeName = sourceMake?.name || "Make";

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[9999] bg-default px-2 py-2 shadow-300 rounded-[13px] h-10"
      style={{
        bottom: 68,
        pointerEvents: "auto",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 h-full">
        {isUpdating ? (
          <span
            className="text-[11px] font-medium px-1.5 whitespace-nowrap flex items-center gap-1.5"
            style={{ color: "var(--color-text-secondary, #666)" }}
          >
            <span
              className="inline-block w-3 h-3 border-[1.5px] border-current rounded-full animate-spin"
              style={{ borderTopColor: "transparent" }}
            />
            Updating {makeName}…
          </span>
        ) : (
          <>
            <span
              className="text-[11px] font-medium px-1.5 whitespace-nowrap"
              style={{ color: "var(--color-text-secondary, #666)" }}
            >
              Design changes
            </span>

            <Button
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                handleUpdateMake();
              }}
            >
              Update {makeName}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

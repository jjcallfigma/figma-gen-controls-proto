"use client";

import { Icon24CloseSmall } from "@/components/icons/icon-24-close-small";
import { Icon24Expand } from "@/components/icons/icon-24-expand";
import { Icon24PlaySmall } from "@/components/icons/icon-24-play-small";
import { Icon24StopSmall } from "@/components/icons/icon-24-stop-small";
import { toast } from "@/components/ui/toast";
import { useAppStore, useObjects } from "@/core/state/store";
import { serializeDesignTree } from "@/core/utils/designSerializer";
import {
  domToDesignWithMeta,
  refineAutoLayoutSizing,
  triggerAutoLayoutForObjects,
} from "@/core/utils/domToDesign";
import { getPreviewDocument } from "@/core/utils/makePreviewRegistry";
import {
  extractViewsFromMake,
  extractViewsWithPlaywright,
  pasteExtractedViews,
} from "@/core/utils/viewExtractor";
import { MakeProperties } from "@/types/canvas";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button";

// ─── Component ──────────────────────────────────────────────────────

export default function MakeToolbar() {
  const objects = useObjects();
  const dispatch = useAppStore((state) => state.dispatch);
  const selectedIds = useAppStore((state) => state.selection.selectedIds);
  const extractMode = useAppStore((state) => state.extractMode);
  const openExtractMode = useAppStore((state) => state.openExtractMode);
  const closeExtractMode = useAppStore((state) => state.closeExtractMode);
  const openMakeEditor = useAppStore((state) => state.openMakeEditor);

  const singleMakeId =
    selectedIds.length === 1 &&
    objects[selectedIds[0]]?.type === "make" &&
    objects[selectedIds[0]]?.properties?.type === "make"
      ? selectedIds[0]
      : null;

  const makeObj = singleMakeId ? objects[singleMakeId] : null;
  const makeProps =
    makeObj?.properties.type === "make"
      ? (makeObj.properties as MakeProperties)
      : null;

  useEffect(() => {
    if (
      extractMode.isActive &&
      extractMode.makeObjectId &&
      extractMode.makeObjectId !== singleMakeId
    ) {
      closeExtractMode();
    }
  }, [
    singleMakeId,
    extractMode.isActive,
    extractMode.makeObjectId,
    closeExtractMode,
  ]);

  const handleTogglePlay = useCallback(() => {
    if (!singleMakeId || !makeProps) return;
    dispatch({
      type: "object.updated",
      payload: {
        id: singleMakeId,
        changes: {
          properties: { ...makeProps, playing: !makeProps.playing },
        },
        previousValues: { properties: makeProps },
      },
    });
  }, [singleMakeId, makeProps, dispatch]);

  const handleEditWithChat = useCallback(() => {
    if (!singleMakeId) return;

    window.dispatchEvent(new CustomEvent("ai-assistant-show"));
    window.dispatchEvent(
      new CustomEvent("ai-start-new-chat", {
        detail: { objectIds: [singleMakeId] },
      }),
    );
  }, [singleMakeId]);

  const [extractingViews, setExtractingViews] = useState<string | null>(null);

  const handleExtractAllViews = useCallback(async () => {
    if (!singleMakeId || !makeProps) return;

    const obj = objects[singleMakeId];
    if (!obj) return;

    setExtractingViews("Analyzing...");

    try {
      const res = await fetch("/api/analyze-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: makeProps.code }),
      });

      if (!res.ok) throw new Error("Failed to analyze views");

      const { views } = await res.json();

      if (!views || views.length === 0) {
        toast.error("No distinct views found");
        setExtractingViews(null);
        return;
      }

      let extractResult;
      try {
        extractResult = await extractViewsWithPlaywright(
          makeProps.code,
          views,
          { width: obj.width, height: obj.height },
          { baseX: obj.x + obj.width + 60, baseY: obj.y },
          singleMakeId,
          setExtractingViews,
        );
      } catch {
        extractResult = await extractViewsFromMake(
          makeProps.code,
          views,
          { width: obj.width, height: obj.height },
          { baseX: obj.x + obj.width + 60, baseY: obj.y },
          singleMakeId,
          setExtractingViews,
        );
      }
      const { extractedObjects, viewCount, failedViews } = extractResult;

      if (extractedObjects.length === 0) {
        toast.error("No views could be extracted");
        setExtractingViews(null);
        return;
      }

      pasteExtractedViews(dispatch, extractedObjects);
      if (failedViews.length > 0) {
        toast.error(
          `Extracted ${viewCount}/${views.length} views. Failed: ${failedViews.join(", ")}`,
        );
      } else {
        toast.success(`Extracted ${viewCount} view${viewCount > 1 ? "s" : ""} from Make`);
      }
    } catch (e: any) {
      console.error("Extract all views failed:", e);
      toast.error(e.message || "Failed to extract views");
    } finally {
      setExtractingViews(null);
    }
  }, [singleMakeId, makeProps, objects, dispatch]);

  const handleExtractConfirm = useCallback(() => {
    const makeObjectId = extractMode.makeObjectId;
    if (!makeObjectId || extractMode.selectedElements.length === 0) return;

    const obj = objects[makeObjectId];
    if (!obj) return;

    const liveDoc = getPreviewDocument(makeObjectId);
    if (!liveDoc) {
      toast.error("Cannot access make preview");
      closeExtractMode();
      return;
    }

    const allExtracted: any[] = [];
    let offsetY = 0;
    const targetX = obj.x + obj.width + 40;

    const allElements = Array.from(
      liveDoc.querySelectorAll(
        "*:not([data-extract-overlay]):not([data-extract-label]):not([data-extract-inspector])",
      ),
    );
    for (const sel of extractMode.selectedElements) {
      const el = allElements[sel.nodeId];
      if (!el) continue;

      const { objects: designObjects, flexMetaMap } = domToDesignWithMeta(
        liveDoc,
        el,
        targetX,
        obj.y + offsetY,
      );

      if (designObjects.length > 0) {
        refineAutoLayoutSizing(designObjects, flexMetaMap);
        const rootObj = designObjects[0];
        offsetY += rootObj.height + 20;
        allExtracted.push(...designObjects);
      }
    }

    if (allExtracted.length === 0) {
      toast.error("No elements could be extracted");
      closeExtractMode();
      return;
    }

    const tmpObjects: Record<string, any> = {};
    for (const o of allExtracted) {
      o.sourceMakeId = makeObjectId;
      tmpObjects[o.id] = o;
    }
    for (const o of allExtracted) {
      if (!o.parentId || !tmpObjects[o.parentId]) {
        o.sourceDesignSnapshot = serializeDesignTree(o.id, tmpObjects);
      }
    }

    dispatch({
      type: "objects.pasted" as any,
      payload: { pastedObjects: allExtracted },
    });
    triggerAutoLayoutForObjects(allExtracted);

    const count = extractMode.selectedElements.length;
    toast.success(
      `Extracted ${count} element${count > 1 ? "s" : ""} from Make`,
    );
    closeExtractMode();
  }, [extractMode, objects, dispatch, closeExtractMode]);

  if (!singleMakeId) return null;

  const isExtractActive =
    extractMode.isActive && extractMode.makeObjectId === singleMakeId;
  const selectedCount = extractMode.selectedElements.length;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[9999] bg-default px-2 py-0 shadow-200 rounded-[13px] h-10"
      style={{
        bottom: 68,
        pointerEvents: "auto",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {isExtractActive ? (
        <div className="flex items-center gap-1 h-10">
          <span className="text-[11px] font-medium px-1.5 whitespace-nowrap">
            {selectedCount === 0
              ? "Select elements…"
              : `${selectedCount} selected`}
          </span>

          <Button
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              handleExtractConfirm();
            }}
            disabled={selectedCount === 0}
            title="Extract selected elements"
          >
            Extract
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              closeExtractMode();
            }}
            title="Cancel"
          >
            <Icon24CloseSmall className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePlay();
            }}
            title={makeProps?.playing ? "Stop" : "Play"}
          >
            {makeProps?.playing ? <Icon24StopSmall /> : <Icon24PlaySmall />}
          </Button>

          <div
            className="mx-1.5 h-10 "
            style={{
              width: 1,
              backgroundColor: "var(--color-border, #e5e5e5)",
            }}
          />

          <Button
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              handleEditWithChat();
            }}
            title="Edit with chat"
          >
            Edit with chat
          </Button>

          <Button
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              openExtractMode(singleMakeId);
            }}
          >
            Extract designs
          </Button>

          <Button
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              handleExtractAllViews();
            }}
            disabled={!!extractingViews}
          >
            {extractingViews || "Extract all views"}
          </Button>

          <div
            className="mx-1.5 h-10 "
            style={{
              width: 1,
              backgroundColor: "var(--color-border, #e5e5e5)",
            }}
          />

          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              openMakeEditor(singleMakeId);
            }}
            title="Open Make editor"
          >
            <Icon24Expand />
          </Button>
        </div>
      )}
    </div>
  );
}

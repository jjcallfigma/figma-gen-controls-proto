"use client";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from "@/components/ui/toast";
import { ClipboardOperations } from "@/core/services/clipboardOperations";
import { useAppStore, useObjects } from "@/core/state/store";
import { hybridGenerateDesign, type HybridDesignResult } from "@/core/utils/aiDesignGenerator";
import { generateDesignFromLiveDocument, triggerAutoLayoutForObjects } from "@/core/utils/domToDesign";
import { getPreviewDocument } from "@/core/utils/makePreviewRegistry";
import { DEFAULT_REACT_CODE } from "@/core/utils/makeUtils";
import { buildUpdateMakePrompt, serializeDesignTree } from "@/core/utils/designSerializer";
import { MakeProperties, getDefaultAutoLayoutSizing } from "@/types/canvas";
import { nanoid } from "nanoid";
import React, { useState } from "react";

interface CanvasContextMenuProps {
  children: React.ReactNode;
}

export function CanvasContextMenu({ children }: CanvasContextMenuProps) {
  const selectedIds = useAppStore((state) => state.selection.selectedIds);
  const objects = useObjects();
  const dispatch = useAppStore((state) => state.dispatch);
  const getViewport = () => useAppStore.getState().viewport;
  const getSelectedObjects = useAppStore((state) => state.getSelectedObjects);
  const createComponent = useAppStore((state) => state.createComponent);
  const createInstance = useAppStore((state) => state.createInstance);
  const resetInstanceToMain = useAppStore((state) => state.resetInstanceToMain);
  const getComponentByObjectId = useAppStore(
    (state) => state.getComponentByObjectId
  );

  const openMakeEditor = useAppStore((state) => state.openMakeEditor);
  const openOnCanvasMakeChat = useAppStore((state) => state.openOnCanvasMakeChat);

  const selectedObjects = selectedIds.map((id) => objects[id]).filter(Boolean);

  // Determine what actions are available based on selection
  const hasSelection = selectedObjects.length > 0;
  const isSingleSelection = selectedObjects.length === 1;
  const selectedObject = isSingleSelection ? selectedObjects[0] : null;

  // Check if selection contains or is a component instance
  const isComponentInstance = selectedObject?.isComponentInstance;
  const hasComponentId = selectedObject?.componentId;

  // Check if selection is a main component
  const isMainComponent = selectedObject?.isMainComponent;

  // Check if we can create an instance (selection is or contains a main component)
  const canCreateInstance = isSingleSelection && isMainComponent;

  // Get component for instance creation
  const componentForInstance = selectedObject
    ? getComponentByObjectId(selectedObject.id)
    : null;

  // Check if selection can be converted to Make (non-make frames/groups)
  const canConvertToMake =
    isSingleSelection &&
    selectedObject &&
    selectedObject.type !== "make" &&
    (selectedObject.type === "frame" || selectedObject.type === "rectangle" || selectedObject.type === "text");

  // Check if selection is a Make that can be exported to design
  const canGenerateDesign =
    isSingleSelection &&
    selectedObject?.type === "make" &&
    selectedObject.properties?.type === "make";

  // Check if selected design was generated from a Make and that Make still exists
  const sourceMakeId = selectedObject?.sourceMakeId;
  const sourceMake = sourceMakeId ? objects[sourceMakeId] : null;
  const canUpdateMake =
    isSingleSelection &&
    selectedObject &&
    selectedObject.type !== "make" &&
    !!sourceMake &&
    sourceMake.type === "make";

  const [isGenerating, setIsGenerating] = useState(false);

  const handleCreateComponent = () => {
    if (hasSelection) {
      const componentName =
        selectedIds.length === 1
          ? `${selectedObjects[0]?.name || "Object"} Component`
          : `Component ${Date.now().toString().slice(-4)}`;

      createComponent(componentName, selectedIds);
    }
  };

  const handleCreateInstance = () => {
    if (canCreateInstance && componentForInstance && selectedObject) {
      // Create instance at a slight offset from the original
      const position = {
        x: selectedObject.x + 50,
        y: selectedObject.y + 50,
      };
      createInstance(
        componentForInstance.id,
        position,
        selectedObject.parentId
      );
    }
  };

  const handleResetInstance = () => {
    if (isComponentInstance && selectedObject) {
      resetInstanceToMain(selectedObject.id);
    }
  };

  const handleConvertToMake = () => {
    if (!selectedObject) return;

    // Default Make code (same as new Make objects)
    const defaultCode = DEFAULT_REACT_CODE;

    // Create a new Make object — chatHistory is empty; the editor will
    // detect sourceObjectId + empty history and auto-send the conversion prompt.
    const newId = nanoid();
    const makeObject = {
      id: newId,
      type: "make" as const,
      name: `Make — ${selectedObject.name}`,
      createdAt: Date.now(),
      x: selectedObject.x,
      y: selectedObject.y,
      width: selectedObject.width,
      height: selectedObject.height,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      parentId: selectedObject.parentId,
      childIds: [],
      zIndex: selectedObject.zIndex + 1,
      fills: [],
      autoLayoutSizing: getDefaultAutoLayoutSizing(),
      properties: {
        type: "make" as const,
        mode: "react" as const,
        code: defaultCode,
        chatHistory: [],
        playing: false,
        borderRadius: 0,
        overflow: "hidden" as const,
        sourceObjectId: selectedObject.id,
      } as MakeProperties,
    };

    // Create the object
    dispatch({
      type: "object.created",
      payload: { object: makeObject as any },
    });

    // Select it
    dispatch({
      type: "selection.set",
      payload: { selectedIds: [newId] },
    });

    // Open Make editor (with small delay so the object is created first)
    setTimeout(() => {
      openMakeEditor(newId);
    }, 200);
  };

  const handleUpdateMake = () => {
    if (!selectedObject || !sourceMakeId || !sourceMake) return;

    // Walk up to extracted root for proper diff-based reconciliation
    let extractedRoot = selectedObject;
    if (!extractedRoot.sourceDesignSnapshot && extractedRoot.sourceMakeId) {
      let parent = extractedRoot.parentId ? objects[extractedRoot.parentId] : undefined;
      while (parent) {
        if (parent.sourceMakeId && parent.sourceDesignSnapshot) {
          extractedRoot = parent;
          break;
        }
        parent = parent.parentId ? objects[parent.parentId] : undefined;
      }
    }

    const currentTree = serializeDesignTree(extractedRoot.id, objects);
    const baselineSnapshot = extractedRoot.sourceDesignSnapshot;
    const updateMessage = buildUpdateMakePrompt(currentTree, baselineSnapshot);

    openOnCanvasMakeChat(sourceMakeId, updateMessage);
  };

  const handleGenerateDesign = () => {
    if (!selectedObject || selectedObject.type !== "make") return;
    const makeProps = selectedObject.properties as MakeProperties;
    if (!makeProps.code) return;

    const targetX = selectedObject.x + selectedObject.width + 40;
    const targetY = selectedObject.y;
    const w = selectedObject.width;
    const h = selectedObject.height;
    const code = makeProps.code;
    const sourceObjectId = makeProps.sourceObjectId;
    const clampSize = { width: Math.round(w), height: Math.round(h) };

    // Helper: tag generated objects with source Make ID and store a baseline snapshot
    const makeId = selectedObject.id;
    const tagWithMake = (objs: any[]) => {
      // Build a temporary object map for serialization
      const tmpObjects: Record<string, any> = {};
      for (const o of objs) {
        o.sourceMakeId = makeId;
        tmpObjects[o.id] = o;
      }
      // Find root objects (no parent or parent not in this batch) and store baseline snapshot
      for (const o of objs) {
        if (!o.parentId || !tmpObjects[o.parentId]) {
          o.sourceDesignSnapshot = serializeDesignTree(o.id, tmpObjects);
        }
      }
    };

    // ── Try live document first (captures current interactive state) ──
    const liveDoc = getPreviewDocument(selectedObject.id);
    if (liveDoc) {
      try {
        const liveObjects = generateDesignFromLiveDocument(
          liveDoc, targetX, targetY, clampSize
        );
        if (liveObjects.length > 0) {
          tagWithMake(liveObjects);
          dispatch({
            type: "objects.pasted" as any,
            payload: { pastedObjects: liveObjects },
          });
          triggerAutoLayoutForObjects(liveObjects);
          toast.success(
            `Design generated! (${liveObjects.length} object${liveObjects.length > 1 ? "s" : ""} created)`
          );
          return;
        }
      } catch (err) {
        console.warn("[handleGenerateDesign] Live DOM walk failed, falling back to fresh iframe:", err);
      }
    }

    // ── Fallback: fresh iframe render ────────────────────────────────

    // 1. Create placeholder frame immediately
    const placeholderId = nanoid();
    dispatch({
      type: "object.created",
      payload: {
        object: {
          id: placeholderId,
          type: "frame",
          name: "Generating design…",
          createdAt: Date.now(),
          x: targetX,
          y: targetY,
          width: w,
          height: h,
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 0.5,
          parentId: undefined,
          childIds: [],
          zIndex: 0,
          fills: [{ id: nanoid(), type: "solid", visible: true, opacity: 1, color: "#F9FAFB" }],
          strokes: [{ id: nanoid(), type: "solid", visible: true, opacity: 1, color: "#E5E7EB" }],
          strokeWidth: 1,
          autoLayoutSizing: { horizontal: "fixed", vertical: "fixed" },
          properties: {
            type: "frame",
            borderRadius: 8,
            overflow: "visible",
            autoLayout: { mode: "none" },
          },
        } as any,
      },
    });
    dispatch({
      type: "selection.set",
      payload: { selectedIds: [placeholderId] },
    });

    // 2. Show loading toast
    const loadingToastId = toast.loading("Generating design from Make…");
    setIsGenerating(true);

    // 3. Call hybrid pipeline with fresh iframe
    let phase1Placed = false;
    hybridGenerateDesign(
      code,
      targetX,
      targetY,
      w,
      h,
      (phase1Objects) => {
        dispatch({
          type: "object.deleted" as any,
          payload: { id: placeholderId },
        });
        if (phase1Objects.length > 0) {
          tagWithMake(phase1Objects);
          dispatch({
            type: "objects.pasted" as any,
            payload: { pastedObjects: phase1Objects },
          });
          triggerAutoLayoutForObjects(phase1Objects);
          phase1Placed = true;
          toast.dismiss(loadingToastId);
          toast.success(
            `Design generated! (${phase1Objects.length} object${phase1Objects.length > 1 ? "s" : ""} created)`
          );
        }
      }
    ).then((result: HybridDesignResult) => {
      setIsGenerating(false);

      if (!phase1Placed && result.objects.length > 0) {
        // Callback didn't fire — place objects now
        dispatch({
          type: "object.deleted" as any,
          payload: { id: placeholderId },
        });
        toast.dismiss(loadingToastId);
        tagWithMake(result.objects);
        dispatch({
          type: "objects.pasted" as any,
          payload: { pastedObjects: result.objects },
        });
        triggerAutoLayoutForObjects(result.objects);
        toast.success(
          `Design generated! (${result.objects.length} object${result.objects.length > 1 ? "s" : ""} created)`
        );
      } else if (!phase1Placed) {
        dispatch({
          type: "object.deleted" as any,
          payload: { id: placeholderId },
        });
        toast.dismiss(loadingToastId);
        toast.error("Failed to generate design");
      }
    });
  };

  const handleDuplicate = async () => {
    if (hasSelection) {
      await ClipboardOperations.duplicateSelectedObjects(
        selectedObjects,
        objects,
        dispatch
      );
    }
  };

  // Clipboard operations
  const handleCopy = async () => {
    if (hasSelection) {
      await ClipboardOperations.copySelectedObjects(
        selectedObjects,
        objects,
        dispatch
      );
    }
  };

  const handleCut = async () => {
    if (hasSelection) {
      await ClipboardOperations.cutSelectedObjects(
        selectedObjects,
        objects,
        dispatch
      );
    }
  };

  const handlePaste = async () => {
    // Calculate canvas center for pasting
    const vp = getViewport();
    const canvasCenter = {
      x: (-vp.panX + window.innerWidth / 2) / vp.zoom,
      y: (-vp.panY + window.innerHeight / 2) / vp.zoom,
    };

    await ClipboardOperations.pasteObjects(
      dispatch,
      vp,
      selectedObjects,
      objects,
      canvasCenter
    );
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    // Prevent context menu when Ctrl is pressed to avoid conflicts with Ctrl+click
    if (e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenu={handleContextMenu}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {hasSelection && (
          <>
            {/* Clipboard Actions */}
            <ContextMenuItem onClick={handleCopy}>
              Copy
              <ContextMenuShortcut>⌘C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCut}>
              Cut
              <ContextMenuShortcut>⌘X</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onClick={handlePaste}>
              Paste
              <ContextMenuShortcut>⌘V</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            {/* Component Actions */}
            <ContextMenuItem onClick={handleCreateComponent}>
              Create Component
              <ContextMenuShortcut>⌘K</ContextMenuShortcut>
            </ContextMenuItem>

            {canCreateInstance && (
              <ContextMenuItem onClick={handleCreateInstance}>
                Create Instance
                <ContextMenuShortcut>⌘I</ContextMenuShortcut>
              </ContextMenuItem>
            )}

            {isComponentInstance && (
              <ContextMenuItem onClick={handleResetInstance}>
                Reset to Main Component
              </ContextMenuItem>
            )}

            {canConvertToMake && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleConvertToMake}>
                  Convert to Make
                </ContextMenuItem>
              </>
            )}

            {canGenerateDesign && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleGenerateDesign} disabled={isGenerating}>
                  {isGenerating ? "Generating…" : "Generate Design from Make"}
                </ContextMenuItem>
              </>
            )}

            {canUpdateMake && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={handleUpdateMake}>
                  Update Make from Design
                </ContextMenuItem>
              </>
            )}

            <ContextMenuSeparator />

            {/* General Actions */}
            <ContextMenuItem onClick={handleDuplicate}>
              Duplicate
              <ContextMenuShortcut>⌘D</ContextMenuShortcut>
            </ContextMenuItem>

            <ContextMenuSeparator />

            {/* Object Info */}
            {isSingleSelection && (
              <>
                {isMainComponent && (
                  <ContextMenuItem disabled>Main Component</ContextMenuItem>
                )}
                {isComponentInstance && (
                  <ContextMenuItem disabled>Component Instance</ContextMenuItem>
                )}
                {hasComponentId && !isMainComponent && !isComponentInstance && (
                  <ContextMenuItem disabled>Part of Component</ContextMenuItem>
                )}
              </>
            )}
          </>
        )}

        {/* Paste is always available */}
        {!hasSelection && (
          <>
            <ContextMenuItem onClick={handlePaste}>
              Paste
              <ContextMenuShortcut>⌘V</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        {!hasSelection && (
          <ContextMenuItem disabled>No selection</ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

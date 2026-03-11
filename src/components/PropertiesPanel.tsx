"use client";

import AppearancePanel from "@/components/AppearancePanel";
import CanvasBackgroundPanel from "@/components/CanvasBackgroundPanel";
import EffectPropertiesPanel from "@/components/EffectPropertiesPanel";
import FillPropertiesPanel from "@/components/FillPropertiesPanel";
import FramePresetPanel from "@/components/FramePresetPanel";
import LayoutPanel from "@/components/LayoutPanel";
import MakeVersionPanel from "@/components/MakeVersionPanel";
import PositionPanel from "@/components/PositionPanel";
import StrokePropertiesPanel from "@/components/StrokePropertiesPanel";
import TypographyPanel from "@/components/TypographyPanel";
import { CustomControlsSection } from "@/features/gen-ai/components/CustomControlsSection";
import { useNavigation } from "@/contexts/NavigationContext";
import { useAppStore, useSelectedObjects } from "@/core/state/store";

import { useCallback, useEffect, useState } from "react";
import { Icon16ChevronDown } from "./icons/icon-16-chevron-down";
import { Icon24Play } from "./icons/icon-24-play";

import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

// Zoom Indicator Component with Dropdown Menu
function ZoomIndicator() {
  const zoom = useAppStore((state) => state.viewport.zoom);

  const formatZoom = (z: number) => {
    return `${Math.round(z * 100)}%`;
  };

  const getCurrentZoomPercent = () => {
    return Math.round(zoom * 100);
  };

  // Access zoom functions from global window object
  const handleZoomToLevel = (level: number) => {
    const globalRefs = window as any;
    if (level === 100 && globalRefs.__figmaCloneZoomTo100?.current) {
      globalRefs.__figmaCloneZoomTo100.current();
    } else if (globalRefs.__figmaCloneZoomToPercent?.current) {
      // Use the centered zoom function for other levels
      globalRefs.__figmaCloneZoomToPercent.current(level);
    } else {
      // Fallback to direct viewport update (not centered)
      const targetZoom = level / 100;
      const store = useAppStore.getState();
      store.dispatch({
        type: "viewport.changed",
        payload: {
          viewport: {
            ...store.viewport,
            zoom: targetZoom,
          },
          previousViewport: store.viewport,
        },
      });
    }
  };

  const handleZoomToFit = () => {
    const globalRefs = window as any;
    if (globalRefs.__figmaCloneZoomToFit?.current) {
      globalRefs.__figmaCloneZoomToFit.current();
    }
  };

  const handleZoomIn = () => {
    const globalRefs = window as any;
    if (globalRefs.__figmaCloneZoomIn?.current) {
      globalRefs.__figmaCloneZoomIn.current();
    }
  };

  const handleZoomOut = () => {
    const globalRefs = window as any;
    if (globalRefs.__figmaCloneZoomOut?.current) {
      globalRefs.__figmaCloneZoomOut.current();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex items-center text-xs hover:bg-secondary rounded pl-2 pr-0 py-1 gap-2  justify-center select-none data-[state=open]:bg-selected data-[state=open]:text-brand">
          {formatZoom(zoom)}
          <Icon16ChevronDown className="w-4 h-4" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {/* Zoom In */}
        <DropdownMenuItem onClick={handleZoomIn}>
          <span className="text-xs">Zoom in</span>
          <span className="ml-auto text-onbrand-tertiary tracking-wide">
            ⌘+
          </span>
        </DropdownMenuItem>

        {/* Zoom Out */}
        <DropdownMenuItem onClick={handleZoomOut}>
          <span className="text-xs">Zoom out</span>
          <span className="ml-auto text-onbrand-tertiary tracking-wide">
            ⌘-
          </span>
        </DropdownMenuItem>

        {/* Zoom to Fit */}
        <DropdownMenuItem onClick={handleZoomToFit}>
          <span className="text-xs">Zoom to fit</span>
          <span className="ml-auto text-onbrand-tertiary tracking-wide">
            ⇧1
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handleZoomToLevel(50)}>
          <span className="text-xs flex items-center justify-between w-full">
            Zoom to 50%
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handleZoomToLevel(100)}>
          <span className="text-xs flex items-center justify-between w-full">
            Zoom to 100%
          </span>
          <span className="ml-auto text-onbrand-tertiary tracking-wide">
            ⌘0
          </span>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handleZoomToLevel(200)}>
          <span className="text-xs flex items-center justify-between w-full">
            Zoom to 200%
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Properties Panel - Right sidebar for editing object properties
 * Handles mixed states for multi-selection and different object types
 */
export default function PropertiesPanel({
  dragCurrentPositions = {},
  isDragging = false,
  setShowSelectionUI = null,
}: {
  dragCurrentPositions?: Record<string, { x: number; y: number }>;
  isDragging?: boolean;
  setShowSelectionUI?: ((show: boolean) => void) | null;
}) {
  const selectedObjects = useSelectedObjects();
  const activeTool = useAppStore((state) => state.tools.activeTool);
  const [panelWidth, setPanelWidth] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const { isPropertiesPanelCollapsed, setIsPropertiesPanelCollapsed } =
    useNavigation();

  const showPresets =
    selectedObjects.length === 0 &&
    (activeTool === "frame" || activeTool === "make");

  // Auto-expand when objects are selected
  useEffect(() => {
    if (selectedObjects.length > 0 && isPropertiesPanelCollapsed) {
      setIsPropertiesPanelCollapsed(false);
    }
  }, [
    selectedObjects.length,
    isPropertiesPanelCollapsed,
    setIsPropertiesPanelCollapsed,
  ]);

  // Handle panel resizing
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = panelWidth;

      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = startX - e.clientX; // Invert for west resize
        const newWidth = Math.max(240, Math.min(500, startWidth + deltaX));
        setPanelWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelWidth],
  );

  return (
    <>
      {/* Collapsed floating pill */}
      {isPropertiesPanelCollapsed && (
        <div className="fixed top-[12px] right-[12px] z-40 h-[48px]">
          <div
            className="rounded-[13px] pr-2 pl-3 py-2 shadow-100 flex h-[48px] items-center gap-2 cursor-pointer"
            style={{
              backgroundColor: "var(--color-bg-elevated)",
            }}
          >
            {/* Avatar */}
            <div className="flex items-center hover:bg-[var(--color-bg-secondary)] rounded-full">
              <Avatar className="h-6 w-6 ">
                <AvatarImage
                  src="https://cdn.creazilla.com/cliparts/7831832/smiling-emoji-clipart-lg.png"
                  alt="User"
                />
                <AvatarFallback>GC</AvatarFallback>
              </Avatar>
              <Icon16ChevronDown />
            </div>

            {/* Zoom Control */}
            <div className="flex items-center gap-1 pl-2 mx-1 py-1 hover:bg-[var(--color-bg-secondary)] border rounded">
              <span
                className="text-[11px] font-medium"
                style={{ color: "var(--color-text)" }}
              >
                100%
              </span>
              <Icon16ChevronDown />
            </div>

            <div className="flex items-center gap-1">
              <div className="flex items-center gap-1 py-1 hover:bg-[var(--color-bg-secondary)] rounded">
                <Icon24Play />
                <Icon16ChevronDown />
              </div>

              {/* Share Button */}
              <Button size="sm">Share</Button>
            </div>
          </div>
        </div>
      )}

      {/* Full Properties Panel */}
      {!isPropertiesPanelCollapsed && (
        <div
          className="overflow-y-auto relative flex-shrink-0 border-l select-none"
          style={{
            width: `${panelWidth}px`,
            backgroundColor: "var(--color-bg-elevated)",
            borderColor: "var(--color-border)",
          }}
        >
          {/* Resize Handle */}
          <div
            className="absolute left-0 top-0 w-1 h-full cursor-ew-resize"
            onMouseDown={handleMouseDown}
          />

          <div className="flex flex-col gap-0">
            {/* User Avatar Section */}

            {/* Panel Header - Figma style */}
            <div className="flex flex-col">
              <div className="flex items-center gap-3 pl-3 pr-2 pt-2 pb-2 border-gray-200 justify-between">
                <Avatar className="h-6 w-6 ">
                  <AvatarImage
                    src="https://cdn.creazilla.com/cliparts/7831832/smiling-emoji-clipart-lg.png"
                    alt="User"
                  />
                  <AvatarFallback>GC</AvatarFallback>
                </Avatar>
                <Button size="sm">Share</Button>
              </div>

              <div className="flex items-center justify-between pb-2 pt-0 h-[33px] pl-1 pr-2 border-b">
                <Tabs defaultValue="design">
                  <TabsList>
                    <TabsTrigger value="design">Design</TabsTrigger>
                    <TabsTrigger value="mask">Prototype</TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Zoom Level Indicator */}
                <ZoomIndicator />
              </div>

              {selectedObjects.length > 0 && (
                <div className="flex gap-2 py-3 px-4 border-b flex-col">
                  <span
                    className="text-[13px] font-medium"
                    style={{ color: "var(--color-text)" }}
                  >
                    {selectedObjects[0].type.charAt(0).toUpperCase() +
                      selectedObjects[0].type.slice(1)}
                  </span>
                  {selectedObjects.length > 1 && (
                    <span
                      className="text-xs"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      +{selectedObjects.length - 1}
                    </span>
                  )}
                  {selectedObjects.length === 1 &&
                    selectedObjects[0].type === "make" &&
                    (selectedObjects[0].properties as any).versions?.length >
                      0 && (
                      <div className="w-full">
                        <MakeVersionPanel object={selectedObjects[0]} />
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Content */}
            {showPresets ? (
              <FramePresetPanel />
            ) : selectedObjects.length === 0 ? (
              <CanvasBackgroundPanel />
            ) : (
              <div className="space-y-0">
                {/* Position Panel - X, Y coordinates */}
                <PositionPanel
                  objects={selectedObjects}
                  dragCurrentPositions={dragCurrentPositions}
                  isDragging={isDragging}
                  setShowSelectionUI={setShowSelectionUI}
                />

                {/* Section Divider */}
                <div
                  className="my-0"
                  style={{ borderTop: "1px solid var(--color-border)" }}
                />

                {/* Layout Panel - Width, Height, and frame-specific layout properties */}
                <LayoutPanel
                  objects={selectedObjects}
                  setShowSelectionUI={setShowSelectionUI}
                />

                {/* Section Divider */}
                <div
                  className="my-0"
                  style={{ borderTop: "1px solid var(--color-border)" }}
                />

                {/* Appearance Panel - Opacity and Border Radius */}
                <AppearancePanel
                  objects={selectedObjects}
                  setShowSelectionUI={setShowSelectionUI}
                />

                {/* Section Divider */}
                <div
                  className="my-0"
                  style={{ borderTop: "1px solid var(--color-border)" }}
                />

                {/* Fill Properties Panel - Shown for fillable objects (rectangles, ellipses, frames, vectors) */}
                {selectedObjects.some(
                  (obj) =>
                    obj.type === "rectangle" ||
                    obj.type === "ellipse" ||
                    obj.type === "frame" ||
                    obj.type === "vector",
                ) && (
                  <>
                    <FillPropertiesPanel
                      objects={selectedObjects.filter(
                        (obj) =>
                          obj.type === "rectangle" ||
                          obj.type === "ellipse" ||
                          obj.type === "frame" ||
                          obj.type === "vector",
                      )}
                    />
                    <div
                      className="my-0"
                      style={{ borderTop: "1px solid var(--color-border)" }}
                    />
                  </>
                )}

                {/* Stroke Properties Panel - Stroke properties for shapes (placed after Fill) */}
                {selectedObjects.some(
                  (obj) =>
                    obj.type === "rectangle" ||
                    obj.type === "ellipse" ||
                    obj.type === "frame" ||
                    obj.type === "vector",
                ) && (
                  <>
                    <StrokePropertiesPanel
                      objects={selectedObjects.filter(
                        (obj) =>
                          obj.type === "rectangle" ||
                          obj.type === "ellipse" ||
                          obj.type === "frame" ||
                          obj.type === "vector",
                      )}
                    />
                    <div
                      className="my-0"
                      style={{ borderTop: "1px solid var(--color-border)" }}
                    />
                  </>
                )}

                {/* Effects Panel - Drop shadows, inner shadows, layer blur */}
                {selectedObjects.some(
                  (obj) =>
                    obj.type === "rectangle" ||
                    obj.type === "ellipse" ||
                    obj.type === "frame" ||
                    obj.type === "text" ||
                    obj.type === "vector",
                ) && (
                  <>
                    <EffectPropertiesPanel
                      objects={selectedObjects.filter(
                        (obj) =>
                          obj.type === "rectangle" ||
                          obj.type === "ellipse" ||
                          obj.type === "frame" ||
                          obj.type === "text" ||
                          obj.type === "vector",
                      )}
                      setShowSelectionUI={setShowSelectionUI}
                    />
                    <div
                      className="my-0"
                      style={{ borderTop: "1px solid var(--color-border)" }}
                    />
                  </>
                )}

                {/* Typography Panel - Text-specific properties */}
                {selectedObjects.some((obj) => obj.type === "text") && (
                  <>
                    <TypographyPanel objects={selectedObjects} />
                    <div
                      className="my-0"
                      style={{ borderTop: "1px solid var(--color-border)" }}
                    />
                  </>
                )}

                {/* Gen-AI Custom Controls */}
                {selectedObjects.length >= 1 && (
                  <>
                    <CustomControlsSection objects={selectedObjects} />
                    <div
                      className="my-0"
                      style={{ borderTop: "1px solid var(--color-border)" }}
                    />
                  </>
                )}

              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// All panels extracted to separate components

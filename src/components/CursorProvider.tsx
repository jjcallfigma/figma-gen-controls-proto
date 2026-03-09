"use client";

import { useAppStore } from "@/core/state/store";
import { CURSOR_ASSETS, CURSOR_HOTSPOTS } from "@/types/cursor";
import { createTransformedCursor } from "@/utils/cursorUtils";
import React, { useEffect, useState } from "react";
import { CursorStateMonitor } from "./CursorStateMonitor";

/**
 * CursorProvider component that manages global cursor state
 *
 * This component:
 * 1. Listens to cursor state changes from the global store
 * 2. Applies CSS cursor styles to the document body
 * 3. Handles custom cursor images from our cursor assets
 * 4. Provides fallbacks for unsupported cursor types
 */
export function CursorProvider({ children }: { children: React.ReactNode }) {
  const cursor = useAppStore((state) => state.cursor);
  const [transformedCursorUrl, setTransformedCursorUrl] = useState<
    string | null
  >(null);

  // Create transformed cursor when cursor changes
  useEffect(() => {
    const createCursor = async () => {
      const assetPath =
        CURSOR_ASSETS[cursor.type as keyof typeof CURSOR_ASSETS];
      if (
        assetPath &&
        (cursor.type.startsWith("resize-") ||
          cursor.type === "default" ||
          cursor.type === "move" ||
          cursor.type === "hand" ||
          cursor.type === "hand-press" ||
          cursor.type === "pen" ||
          cursor.type === "pencil" ||
          cursor.type === "frame" ||
          cursor.type === "crosshair" ||
          cursor.type === "duplicate")
      ) {
        try {
          const hotspot = cursor.hotspot ||
            CURSOR_HOTSPOTS[cursor.type] || { x: 16, y: 16 };
          const transformedUrl = await createTransformedCursor(
            assetPath,
            cursor.type,
            hotspot
          );
          setTransformedCursorUrl(transformedUrl);
        } catch (error) {
          console.error("Error creating transformed cursor:", error);
          setTransformedCursorUrl(null);
        }
      } else {
        setTransformedCursorUrl(null);
      }
    };

    createCursor();
  }, [cursor.type, cursor.hotspot]);

  useEffect(() => {
    const body = document.body;

    // Remove any existing cursor classes
    const existingCursorClasses = Array.from(body.classList).filter(
      (className) => className.startsWith("cursor-custom-")
    );
    body.classList.remove(...existingCursorClasses);

    // Helper function to apply cursor to both body and canvas areas
    const applyCursorToAll = (cursorStyle: string) => {
      body.style.cursor = cursorStyle;
      const canvasElements = document.querySelectorAll(
        '[data-canvas-area="true"]'
      );
      canvasElements.forEach((el) => {
        (el as HTMLElement).style.cursor = cursorStyle;
      });
    };

    // Helper function to apply cursor only to canvas (for default cursor)
    const applyCursorToCanvasOnly = (cursorStyle: string) => {
      body.style.cursor = "default"; // Keep body as normal default
      const canvasElements = document.querySelectorAll(
        '[data-canvas-area="true"]'
      );
      canvasElements.forEach((el) => {
        (el as HTMLElement).style.cursor = cursorStyle;
      });
    };

    // Apply cursor based on type
    const applyCursor = () => {
      switch (cursor.type) {
        case "default":
          if (transformedCursorUrl) {
            // Apply custom default cursor only to canvas areas
            const hotspot = cursor.hotspot || CURSOR_HOTSPOTS["default"];
            const customCursor = `url("${transformedCursorUrl}") ${hotspot.x} ${hotspot.y}, default`;
            applyCursorToCanvasOnly(customCursor);
          } else {
            applyCursorToCanvasOnly("default");
          }
          break;

        case "pointer":
          applyCursorToAll("pointer");
          break;

        case "grab":
          applyCursorToAll("grab");
          break;

        case "grabbing":
          applyCursorToAll("grabbing");
          break;

        case "text":
          applyCursorToAll("text");
          break;

        case "not-allowed":
          applyCursorToAll("not-allowed");
          break;

        // Resize cursors using custom assets with rotation
        case "resize-n":
        case "resize-ne":
        case "resize-e":
        case "resize-se":
        case "resize-s":
        case "resize-sw":
        case "resize-w":
        case "resize-nw":
          if (transformedCursorUrl) {
            const hotspot = cursor.hotspot ||
              CURSOR_HOTSPOTS[cursor.type] || { x: 16, y: 16 };
            const customCursor = `url("${transformedCursorUrl}") ${hotspot.x} ${hotspot.y}, auto`;
            applyCursorToAll(customCursor);
          } else {
            // Fallback to standard CSS cursors
            const fallbackCursors = {
              "resize-n": "n-resize",
              "resize-ne": "ne-resize",
              "resize-e": "e-resize",
              "resize-se": "se-resize",
              "resize-s": "s-resize",
              "resize-sw": "sw-resize",
              "resize-w": "w-resize",
              "resize-nw": "nw-resize",
            };
            const fallbackCursor =
              fallbackCursors[cursor.type as keyof typeof fallbackCursors] ||
              "default";
            applyCursorToAll(fallbackCursor);
          }
          break;

        // Custom cursors that need our assets
        case "move":
        case "resize-scale":
        case "hand":
        case "hand-press":
        case "pen":
        case "pencil":
        case "frame":
        case "crosshair":
        case "brush":
        case "dropper":
        case "zoom-in":
        case "zoom-out":
        case "click":
        case "duplicate":
        case "snap":
        case "break":
        case "convert":
        case "invisible":
          if (
            transformedCursorUrl &&
            (cursor.type === "move" ||
              cursor.type === "hand" ||
              cursor.type === "hand-press" ||
              cursor.type === "pen" ||
              cursor.type === "pencil" ||
              cursor.type === "frame" ||
              cursor.type === "crosshair" ||
              cursor.type === "duplicate")
          ) {
            const hotspot = cursor.hotspot ||
              CURSOR_HOTSPOTS[cursor.type] || { x: 16, y: 16 };
            const cursorUrl = `url("${transformedCursorUrl}") ${hotspot.x} ${hotspot.y}, auto`;

            applyCursorToAll(cursorUrl);
          } else {
            const assetPath =
              CURSOR_ASSETS[cursor.type as keyof typeof CURSOR_ASSETS];
            if (assetPath) {
              const hotspot = cursor.hotspot ||
                CURSOR_HOTSPOTS[cursor.type] || { x: 16, y: 16 };
              const cursorUrl = `url("${assetPath}") ${hotspot.x} ${hotspot.y}, auto`;

              applyCursorToAll(cursorUrl);
            } else {
              // Fallback to default if asset not found

              applyCursorToAll("default");
            }
          }
          break;

        // Pan cursor - use hand as fallback
        case "pan":
          const panAssetPath = CURSOR_ASSETS["hand"];
          if (panAssetPath) {
            const hotspot = cursor.hotspot || CURSOR_HOTSPOTS["pan"];
            const cursorUrl = `url("${panAssetPath}") ${hotspot.x} ${hotspot.y}, grab`;
            applyCursorToAll(cursorUrl);
          } else {
            applyCursorToAll("grab");
          }
          break;

        default:
          // Custom cursor with URL
          if (cursor.customUrl) {
            const hotspot = cursor.hotspot || { x: 0, y: 0 }; // Keep default for custom URLs
            const cursorUrl = `url("${cursor.customUrl}") ${hotspot.x} ${hotspot.y}, auto`;
            applyCursorToAll(cursorUrl);
          } else {
            applyCursorToAll("default");
          }
          break;
      }
    };

    applyCursor();

    // Cleanup function to reset cursor when component unmounts
    return () => {
      applyCursorToAll("default");
      body.classList.remove(...existingCursorClasses);
    };
  }, [cursor, transformedCursorUrl]);

  return (
    <>
      <CursorStateMonitor />
      {children}
    </>
  );
}

/**
 * Higher-order component to wrap apps with cursor management
 */
export function withCursorProvider<P extends object>(
  Component: React.ComponentType<P>
) {
  const WrappedComponent = (props: P) => (
    <CursorProvider>
      <Component {...props} />
    </CursorProvider>
  );

  WrappedComponent.displayName = `withCursorProvider(${
    Component.displayName || Component.name
  })`;

  return WrappedComponent;
}

/**
 * Hook to temporarily override cursor for a specific element
 * This is useful for hover states that need different cursors
 */
export function useElementCursor(cursorType: string, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleMouseEnter = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      target.style.cursor = cursorType;
    };

    const handleMouseLeave = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      target.style.cursor = "";
    };

    // We can't add these to elements directly, so this is more for documentation
    // Real usage would be in component event handlers

    return () => {
      // Cleanup if needed
    };
  }, [cursorType, enabled]);
}

"use client";

import { Icon24PlaySmall } from "@/components/icons/icon-24-play-small";
import { Icon24StopSmall } from "@/components/icons/icon-24-stop-small";
import { useAppStore, useObjects } from "@/core/state/store";
import { getAbsolutePosition, worldToScreen } from "@/core/utils/coordinates";
import { MakeProperties } from "@/types/canvas";
import { Icon24Expand } from "../icons/icon-24-expand";

interface MakeControlsProps {
  dragPositions?: Record<string, { x: number; y: number }>;
}

/**
 * Renders play/pause and edit controls for Make nodes in screen space.
 * Positioned in the ScreenSpace layer so they are never clipped by
 * parent frames with overflow:hidden.
 */
export default function MakeControls({
  dragPositions = {},
}: MakeControlsProps) {
  const viewport = useAppStore((state) => state.viewport);
  const objects = useObjects();
  const dispatch = useAppStore((state) => state.dispatch);
  const openMakeEditor = useAppStore((state) => state.openMakeEditor);
  const selectedIds = useAppStore((state) => state.selection.selectedIds);

  // Find all visible Make objects (including nested ones)
  const makeObjects = Object.values(objects).filter(
    (obj) => obj.type === "make" && obj.visible
  );

  if (makeObjects.length === 0) return null;

  return (
    <>
      {makeObjects.map((makeObj) => {
        const makeProps =
          makeObj.properties.type === "make"
            ? (makeObj.properties as MakeProperties)
            : null;
        if (!makeProps) return null;

        // Use drag position if available, otherwise use the stored absolute position
        let worldPos;
        if (dragPositions[makeObj.id]) {
          worldPos = dragPositions[makeObj.id];
        } else {
          worldPos = getAbsolutePosition(makeObj.id, objects);
        }

        // Convert top-right corner of the Make node to screen coords
        const screenTopRight = worldToScreen(
          { x: worldPos.x + makeObj.width, y: worldPos.y },
          viewport
        );

        // Only show controls when the node is selected
        const isSelected = selectedIds.includes(makeObj.id);
        if (!isSelected) return null;

        return (
          <div
            key={`make-controls-${makeObj.id}`}
            className="absolute flex gap-1"
            style={{
              left: screenTopRight.x,
              top: screenTopRight.y,
              transform: "translate(-100%, -100%)",
              transformOrigin: "bottom right",
              pointerEvents: "auto",
              zIndex: 9999,
              padding: "0 0 0px 0",
            }}
            onPointerDown={(e) => {
              // Stop propagation so the canvas doesn't capture the pointer
              // and eat the click with its selection/drag logic
              e.stopPropagation();
            }}
          >

            {/* Edit button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                openMakeEditor(makeObj.id);
              }}
              className="flex items-center justify-center"
              style={{
                width: "24px",
                height: "24px",
                backgroundColor: "transparent",
                border: "none",
                cursor: "default",
              }}
              title="Edit Make"
            >
              <Icon24Expand className="text-brand" />
            </button>

            {/* Play / Stop button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                dispatch({
                  type: "object.updated",
                  payload: {
                    id: makeObj.id,
                    changes: {
                      properties: {
                        ...makeProps,
                        playing: !makeProps.playing,
                      },
                    },
                    previousValues: {
                      properties: makeProps,
                    },
                  },
                });
              }}
              className=""
              style={{
                width: "24px",
                height: "24px",
                border: "none",
                cursor: "default",
              }}
              title={makeProps.playing ? "Stop" : "Play"}
            >
              {makeProps.playing ? (
                <Icon24StopSmall className="text-brand " />
              ) : (
                <Icon24PlaySmall className="text-brand " />
              )}
            </button>

            
          </div>
        );
      })}
    </>
  );
}

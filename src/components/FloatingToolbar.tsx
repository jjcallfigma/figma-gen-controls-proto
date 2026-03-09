"use client";

import { useAppStore, useSelectedObjects } from "@/core/state/store";
import { createSolidFill } from "@/core/utils/fills";
import { nanoid } from "nanoid";
import { Icon24Actions } from "./icons/icon-24-actions";
import { Icon24ChevronDown } from "./icons/icon-24-chevron-down";
import { Icon24CodeLayer } from "./icons/icon-24-code-layer";
import { Icon24CommentLarge } from "./icons/icon-24-comment-large";
import { Icon24Frame } from "./icons/icon-24-frame";
import { Icon24Move } from "./icons/icon-24-move";
import { Icon24Pen } from "./icons/icon-24-pen";
import { Icon24Rectangle } from "./icons/icon-24-rectangle";
import { Icon24TextLarge } from "./icons/icon-24-text-large";

export default function FloatingToolbar() {
  const dispatch = useAppStore((state) => state.dispatch);
  const activeTool = useAppStore((state) => state.tools.activeTool);
  const canUndo = useAppStore((state) => state.pastStates.length > 0);
  const canRedo = useAppStore((state) => state.futureStates.length > 0);
  const selectedObjects = useSelectedObjects();
  const getViewport = () => useAppStore.getState().viewport;

  // Tool switching
  const switchToSelectTool = () => {
    dispatch({
      type: "tool.changed",
      payload: {
        tool: "select",
        previousTool: activeTool,
      },
    });
  };

  const switchToRectangleTool = () => {
    dispatch({
      type: "tool.changed",
      payload: {
        tool: "rectangle",
        previousTool: activeTool,
      },
    });
  };

  const switchToFrameTool = () => {
    dispatch({
      type: "tool.changed",
      payload: {
        tool: "frame",
        previousTool: activeTool,
      },
    });
  };

  const switchToEllipseTool = () => {
    dispatch({
      type: "tool.changed",
      payload: {
        tool: "ellipse",
        previousTool: activeTool,
      },
    });
  };

  const switchToTextTool = () => {
    dispatch({
      type: "tool.changed",
      payload: {
        tool: "text",
        previousTool: activeTool,
      },
    });
  };

  const switchToMakeTool = () => {
    dispatch({
      type: "tool.changed",
      payload: {
        tool: "make",
        previousTool: activeTool,
      },
    });
  };

  // Legacy create functions
  const createFrame = () => {
    dispatch({
      type: "object.created",
      payload: {
        object: {
          id: nanoid(),
          type: "frame",
          name: "Frame",
          createdAt: Date.now(),
          x: Math.round(50 + Math.random() * 200),
          y: Math.round(50 + Math.random() * 200),
          width: 200,
          height: 150,
          rotation: 0,
          fills: [createSolidFill("#ffffff", 1, true)],
          fill: undefined,
          stroke: undefined,
          strokeWidth: 0,
          opacity: 1,
          parentId: undefined,
          childIds: [],
          zIndex: selectedObjects.length,
          visible: true,
          locked: false,
          properties: {
            type: "frame",
            borderRadius: 0,
            overflow: "hidden",
            autoLayout: {
              mode: "none",
              gap: 8,
              padding: { top: 16, right: 16, bottom: 16, left: 16 },
              alignItems: "start",
              justifyContent: "start",
              frameSizing: {
                horizontal: "fixed",
                vertical: "fixed",
              },
            },
          },
        },
      },
    });
  };

  const createRectangle = () => {
    dispatch({
      type: "object.created",
      payload: {
        object: {
          id: nanoid(),
          type: "rectangle",
          name: "Rectangle",
          createdAt: Date.now(),
          x: Math.round(100 + Math.random() * 200),
          y: Math.round(100 + Math.random() * 200),
          width: 100,
          height: 80,
          rotation: 0,
          fills: [createSolidFill("#D9D9D9", 1, true)],
          fill: undefined,
          stroke: undefined,
          strokeWidth: 0,
          opacity: 1,
          parentId: undefined,
          childIds: [],
          zIndex: 1,
          visible: true,
          locked: false,
          properties: {
            type: "rectangle",
            borderRadius: 0,
          },
        },
      },
    });
  };

  const createText = () => {
    const newTextId = nanoid();

    dispatch({
      type: "object.created",
      payload: {
        object: {
          id: newTextId,
          type: "text",
          name: "Text",
          createdAt: Date.now(),
          x: Math.round(150 + Math.random() * 200),
          y: Math.round(150 + Math.random() * 200),
          width: 1, // Minimal width - will auto-resize based on content
          height: 22, // Minimal height - will auto-resize based on content
          rotation: 0,
          fill: "#1f2937",
          opacity: 1,
          parentId: undefined,
          childIds: [],
          zIndex: 2,
          visible: true,
          locked: false,
          autoLayoutSizing: { horizontal: "hug", vertical: "hug" },
          properties: {
            type: "text",
            content: "Hello World!",
            fontSize: 18,
            fontFamily: "Inter, sans-serif",
            fontWeight: 400,
            textAlign: "left",
            lineHeight: {
              value: 120,
              unit: "%",
            },
            letterSpacing: { value: 0, unit: "px" },
            resizeMode: "auto-width", // Default to auto-width mode
            isEditing: true, // Start in edit mode by default
          },
        },
      },
    });

    // Also select the newly created text object
    dispatch({
      type: "selection.changed",
      payload: {
        selectedIds: [newTextId],
        previousSelection: [],
      },
    });
  };

  const createEllipse = () => {
    dispatch({
      type: "object.created",
      payload: {
        object: {
          id: nanoid(),
          type: "ellipse",
          name: "Ellipse",
          createdAt: Date.now(),
          x: Math.round(200 + Math.random() * 200),
          y: Math.round(200 + Math.random() * 200),
          width: 100,
          height: 100,
          rotation: 0,
          fills: [createSolidFill("#f59e0b", 1, true)],
          fill: undefined,
          stroke: "#d97706",
          strokeWidth: 2,
          opacity: 1,
          parentId: undefined,
          childIds: [],
          zIndex: 3,
          visible: true,
          locked: false,
          properties: {
            type: "ellipse",
          },
        },
      },
    });
  };

  // Zoom functions
  const zoomIn = () => {
    dispatch({
      type: "viewport.changed",
      payload: {
        viewport: {
          ...getViewport(),
          zoom: Math.min(getViewport().zoom * 1.2, 10),
        },
        previousViewport: getViewport(),
      },
    });
  };

  const zoomOut = () => {
    dispatch({
      type: "viewport.changed",
      payload: {
        viewport: {
          ...getViewport(),
          zoom: Math.max(getViewport().zoom / 1.2, 0.1),
        },
        previousViewport: getViewport(),
      },
    });
  };

  const resetZoom = () => {
    dispatch({
      type: "viewport.changed",
      payload: {
        viewport: {
          ...getViewport(),
          zoom: 1,
          panX: 0,
          panY: 0,
        },
        previousViewport: getViewport(),
      },
    });
  };

  const undo = () => {
    useAppStore.getState().undo();
  };

  const redo = () => {
    useAppStore.getState().redo();
  };

  return (
    <div
      className="fixed bottom-3 left-1/2 transform -translate-x-1/2 rounded-[13px] shadow-200 px-2 py-2 items-center z-50"
      style={{
        backgroundColor: "var(--color-bg-elevated)",
        borderColor: "var(--color-border)",
      }}
    >
      {/* Tool selection */}
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0">
          <button
            onClick={switchToSelectTool}
            className={`w-8 h-8 rounded-[5px] flex items-center justify-center  ${
              activeTool === "select" ? "text-white" : ""
            }`}
            style={{
              backgroundColor:
                activeTool === "select"
                  ? "var(--color-bg-brand)"
                  : "transparent",
            }}
            onMouseEnter={(e) => {
              if (activeTool !== "select") {
                e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
              }
            }}
            onMouseLeave={(e) => {
              if (activeTool !== "select") {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
            title="Select (V)"
          >
            <Icon24Move />
          </button>
          <Icon24ChevronDown className="-ml-1" />
        </div>
        <div className="flex items-center gap-0">
          <button
            onClick={switchToFrameTool}
            className={`w-8 h-8 rounded-[5px] flex items-center justify-center  ${
              activeTool === "frame" ? "text-white" : ""
            }`}
            style={{
              backgroundColor:
                activeTool === "frame"
                  ? "var(--color-bg-brand)"
                  : "transparent",
            }}
            onMouseEnter={(e) => {
              if (activeTool !== "frame") {
                e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
              }
            }}
            onMouseLeave={(e) => {
              if (activeTool !== "frame") {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
            title="Frame (F)"
          >
            <Icon24Frame />
          </button>
          <Icon24ChevronDown className="-ml-1" />
        </div>

        <div className="flex items-center gap-0">
          <button
            onClick={switchToRectangleTool}
            className={`w-8 h-8 rounded-[5px] flex items-center justify-center  ${
              activeTool === "rectangle" ? "text-white" : ""
            }`}
            style={{
              backgroundColor:
                activeTool === "rectangle"
                  ? "var(--color-bg-brand)"
                  : "transparent",
            }}
            onMouseEnter={(e) => {
              if (activeTool !== "rectangle") {
                e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
              }
            }}
            onMouseLeave={(e) => {
              if (activeTool !== "rectangle") {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
            title="Rectangle (R)"
          >
            <Icon24Rectangle />
          </button>
          <Icon24ChevronDown className="-ml-1" />
        </div>

        <div className="flex items-center gap-0">
          <button
            className={`w-8 h-8 rounded-[5px] flex items-center justify-center  hover:bg-hover`}
            title="Pen (P)"
          >
            <Icon24Pen />
          </button>
          <Icon24ChevronDown className="-ml-1" />
        </div>

        {/* <button
          onClick={switchToEllipseTool}
          className={`w-8 h-8 rounded-[5px] flex items-center justify-center transition-colors ${
            activeTool === "ellipse" ? "text-white" : ""
          }`}
          style={{
            backgroundColor:
              activeTool === "ellipse"
                ? "var(--color-bg-brand)"
                : "transparent",
          }}
          onMouseEnter={(e) => {
            if (activeTool !== "ellipse") {
              e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
            }
          }}
          onMouseLeave={(e) => {
            if (activeTool !== "ellipse") {
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
          title="Ellipse (O)"
        >
          <Icon24Ellipse />
        </button> */}

        <button
          onClick={switchToTextTool}
          className={`w-8 h-8 rounded-[5px] mr-1 flex items-center justify-center ${
            activeTool === "text" ? "text-white" : ""
          }`}
          style={{
            backgroundColor:
              activeTool === "text" ? "var(--color-bg-brand)" : "transparent",
          }}
          onMouseEnter={(e) => {
            if (activeTool !== "text") {
              e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
            }
          }}
          onMouseLeave={(e) => {
            if (activeTool !== "text") {
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
          title="Text (T)"
        >
          <Icon24TextLarge />
        </button>

        <button
          onClick={switchToMakeTool}
          className={`w-8 h-8 rounded-[5px] flex items-center justify-center ${
            activeTool === "make" ? "text-white" : ""
          }`}
          style={{
            backgroundColor:
              activeTool === "make" ? "var(--color-bg-brand)" : "transparent",
          }}
          onMouseEnter={(e) => {
            if (activeTool !== "make") {
              e.currentTarget.style.backgroundColor = "var(--color-bg-hover)";
            }
          }}
          onMouseLeave={(e) => {
            if (activeTool !== "make") {
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
          title="Make (E)"
        >
          <Icon24CodeLayer />
        </button>

        <div className="flex items-center gap-0">
          <button
            className={`w-8 h-8 rounded-[5px] flex items-center justify-center hover:bg-hover `}
            title="Comment"
          >
            <Icon24CommentLarge />
          </button>
          <Icon24ChevronDown className="-ml-1" />
        </div>

        <button
          className={`w-8 h-8 rounded-[5px] flex items-center justify-center hover:bg-hover `}
          title="AI"
        >
          <Icon24Actions />
        </button>
      </div>

      {/* Theme Toggle */}
      {/* <ThemeToggle /> */}
    </div>
  );
}

"use client";

import { useAppStore } from "@/core/state/store";
import { screenToWorld } from "@/core/utils/coordinates";
import { DEFAULT_REACT_CODE } from "@/core/utils/makeUtils";
import type { CanvasObject } from "@/types/canvas";
import { getDefaultAutoLayoutSizing } from "@/types/canvas";
import { nanoid } from "nanoid";

interface DevicePreset {
  name: string;
  width: number;
  height: number;
}

interface PresetCategory {
  label: string;
  presets: DevicePreset[];
}

const PRESET_CATEGORIES: PresetCategory[] = [
  {
    label: "Phone",
    presets: [
      { name: "iPhone 16 Pro Max", width: 440, height: 956 },
      { name: "iPhone 16 Pro", width: 402, height: 874 },
      { name: "iPhone 16", width: 393, height: 852 },
      { name: "iPhone SE", width: 320, height: 568 },
      { name: "Android Large", width: 412, height: 915 },
      { name: "Android Small", width: 360, height: 800 },
    ],
  },
  {
    label: "Tablet",
    presets: [
      { name: "iPad Pro 12.9\"", width: 1024, height: 1366 },
      { name: "iPad Pro 11\"", width: 834, height: 1194 },
      { name: "iPad Mini", width: 744, height: 1133 },
      { name: "Surface Pro", width: 912, height: 1368 },
    ],
  },
  {
    label: "Desktop",
    presets: [
      { name: "Desktop", width: 1440, height: 1024 },
      { name: "MacBook Pro 16\"", width: 1728, height: 1117 },
      { name: "MacBook Pro 14\"", width: 1512, height: 982 },
      { name: "MacBook Air", width: 1280, height: 832 },
      { name: "iMac", width: 1440, height: 900 },
    ],
  },
  {
    label: "Presentation",
    presets: [
      { name: "Slide 16:9", width: 1920, height: 1080 },
      { name: "Slide 4:3", width: 1024, height: 768 },
    ],
  },
  {
    label: "Social Media",
    presets: [
      { name: "Instagram Post", width: 1080, height: 1080 },
      { name: "Instagram Story", width: 1080, height: 1920 },
      { name: "Twitter Post", width: 1200, height: 675 },
      { name: "Facebook Cover", width: 820, height: 312 },
    ],
  },
];

export default function FramePresetPanel() {
  const dispatch = useAppStore((state) => state.dispatch);
  const viewport = useAppStore((state) => state.viewport);
  const activeTool = useAppStore((state) => state.tools.activeTool);

  const handlePresetClick = (preset: DevicePreset) => {
    // Calculate the center of the current viewport in world coordinates
    const viewportCenterScreen = {
      x: viewport.viewportBounds.width / 2,
      y: viewport.viewportBounds.height / 2,
    };
    const worldCenter = screenToWorld(viewportCenterScreen, viewport);

    // Position the new object centered at the viewport center
    const x = worldCenter.x - preset.width / 2;
    const y = worldCenter.y - preset.height / 2;

    const isMake = activeTool === "make";
    const defaultMakeCode = DEFAULT_REACT_CODE;

    const objectIds = useAppStore.getState().objectIds;

    const newObject: CanvasObject = {
      id: nanoid(),
      type: isMake ? "make" : "frame",
      name: isMake ? `Make — ${preset.name}` : preset.name,
      createdAt: Date.now(),
      x,
      y,
      width: preset.width,
      height: preset.height,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      parentId: undefined,
      childIds: [],
      zIndex: objectIds.length,
      fills: isMake
        ? []
        : [
            {
              id: nanoid(),
              type: "solid",
              color: "#FFFFFF",
              opacity: 1,
              visible: true,
              blendMode: "normal",
            },
          ],
      autoLayoutSizing: getDefaultAutoLayoutSizing(),
      properties: isMake
        ? {
            type: "make" as const,
            mode: "react" as const,
            code: defaultMakeCode,
            chatHistory: [],
            playing: false,
            borderRadius: 0,
            overflow: "hidden" as const,
          }
        : {
            type: "frame" as const,
            borderRadius: 0,
            overflow: "hidden" as const,
            autoLayout: {
              mode: "none" as const,
              gap: 8,
              padding: { top: 16, right: 16, bottom: 16, left: 16 },
              alignItems: "start" as const,
              justifyContent: "start" as const,
            },
          },
    };

    // Create the object
    dispatch({
      type: "object.created",
      payload: { object: newObject },
    });

    // Select it
    dispatch({
      type: "selection.set",
      payload: { selectedIds: [newObject.id] },
    });

    // Switch back to select tool
    dispatch({
      type: "tool.changed",
      payload: { tool: "select", previousTool: activeTool },
    });

    // Open Make editor for Make nodes (with same delay as drag-to-create)
    if (isMake) {
      setTimeout(() => {
        useAppStore.getState().openMakeEditor(newObject.id);
      }, 200);
    }
  };

  return (
    <div className="flex flex-col cursor-default">
      <div
        className="px-4 py-3 border-b"
        style={{ borderColor: "var(--color-border)" }}
      >
        <span
          className="text-[13px] font-medium"
          style={{ color: "var(--color-text)" }}
        >
          {activeTool === "make" ? "Make" : "Frame"}
        </span>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 180px)" }}>
        {PRESET_CATEGORIES.map((category) => (
          <div key={category.label} className="border-b pb-2">
            <div
              className="px-4 pt-3 pb-1"
            >
              <span
                className="text-[11px] font-medium "
              >
                {category.label}
              </span>
            </div>

            <div className="flex flex-col">
              {category.presets.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handlePresetClick(preset)}
                  className="flex items-center justify-between px-4 py-1.5 text-left transition-colors"
                  style={{
                    border: "none",
                    background: "transparent"
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor =
                      "var(--color-bg-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--color-text)" }}
                  >
                    {preset.name}
                  </span>
                  <span
                    className="text-[11px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {preset.width} × {preset.height}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

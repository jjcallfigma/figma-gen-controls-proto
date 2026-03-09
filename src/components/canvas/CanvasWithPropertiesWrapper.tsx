"use client";

import { createContext, useCallback, useContext, useState } from "react";
import PropertiesPanel from "../PropertiesPanel";
import Canvas from "./Canvas";

// Context for layers panel state
const LayersPanelContext = createContext<{
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  panelWidth: number;
  setPanelWidth: (width: number) => void;
} | null>(null);

export const useLayersPanel = () => {
  const context = useContext(LayersPanelContext);
  if (!context) {
    throw new Error("useLayersPanel must be used within LayersPanelProvider");
  }
  return context;
};

export const LayersPanelProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [panelWidth, setPanelWidth] = useState(240);

  return (
    <LayersPanelContext.Provider
      value={{ isExpanded, setIsExpanded, panelWidth, setPanelWidth }}
    >
      {children}
    </LayersPanelContext.Provider>
  );
};

/**
 * Wrapper component that manages shared state between Canvas and Properties Panel
 * This allows the Properties Panel to show live drag positions during dragging
 */
export default function CanvasWithPropertiesWrapper() {
  const [dragCurrentPositions, setDragCurrentPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [isDragging, setIsDragging] = useState(false);
  const [setShowSelectionUI, setSetShowSelectionUI] = useState<
    ((show: boolean) => void) | null
  >(null);
  const { isExpanded } = useLayersPanel();

  const handleDragStateChange = useCallback(
    (
      positions: Record<string, { x: number; y: number }>,
      dragging: boolean
    ) => {
      setDragCurrentPositions(positions);
      setIsDragging(dragging);
    },
    []
  );

  const handleSelectionUIChange = useCallback(
    (setShowSelectionUIFn: (show: boolean) => void) => {
      setSetShowSelectionUI(() => setShowSelectionUIFn);
    },
    []
  );

  return (
    <div className="flex-1 flex">
      {/* Canvas area - fixed position, layers panel overlays on top */}
      <div className="flex-1 relative">
        <Canvas
          onDragStateChange={handleDragStateChange}
          onSelectionUIChange={handleSelectionUIChange}
        />
      </div>

      {/* Properties Panel - Right Sidebar */}
      <PropertiesPanel
        dragCurrentPositions={dragCurrentPositions}
        isDragging={isDragging}
        setShowSelectionUI={setShowSelectionUI}
      />
    </div>
  );
}

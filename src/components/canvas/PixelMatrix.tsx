import { useSettingsStore } from "@/core/state/settingsStore";
import { Viewport } from "@/types/canvas";
import { useCallback } from "react";

interface PixelMatrixProps {
  viewport: Viewport;
}

export default function PixelMatrix({ viewport }: PixelMatrixProps) {
  const showPixelGrid = useSettingsStore((state) => state.showPixelGrid);
  
  const canvasRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      if (!showPixelGrid) return; // Check settings first
      if (viewport.zoom < 4) return; // Only show at 400% or higher

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set canvas size to match container
      const container = canvas.parentElement;
      if (!container) return;

      // Get device pixel ratio
      const dpr = window.devicePixelRatio || 1;

      // Set display size (css pixels)
      const displayWidth = container.clientWidth;
      const displayHeight = container.clientHeight;
      canvas.style.width = displayWidth + "px";
      canvas.style.height = displayHeight + "px";

      // Set actual size in memory (scaled to account for extra pixel density)
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;

      // Normalize coordinate system to use css pixels
      ctx.scale(dpr, dpr);

      // Clear canvas
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      // Calculate visible area in world coordinates
      // Note: viewport.panX/panY represent the offset of the world origin from screen origin
      const visibleLeft = -viewport.panX / viewport.zoom;
      const visibleTop = -viewport.panY / viewport.zoom;
      const visibleRight = visibleLeft + displayWidth / viewport.zoom;
      const visibleBottom = visibleTop + displayHeight / viewport.zoom;

      // Calculate pixel bounds
      const startX = Math.floor(visibleLeft);
      const startY = Math.floor(visibleTop);
      const endX = Math.ceil(visibleRight);
      const endY = Math.ceil(visibleBottom);

      // Set up the transform to match the world container exactly
      ctx.save();
      ctx.setTransform(
        viewport.zoom * dpr,
        0,
        0,
        viewport.zoom * dpr,
        viewport.panX * dpr,
        viewport.panY * dpr
      );

      // Draw pixel grid
      ctx.strokeStyle = "rgba(200,200,200,.25)"; // Slightly more visible for better UX
      ctx.lineWidth = 1 / (viewport.zoom * dpr);

      // Draw vertical lines
      for (let x = startX; x <= endX; x++) {
        ctx.beginPath();
        ctx.moveTo(Math.floor(x), startY);
        ctx.lineTo(Math.floor(x), endY);
        ctx.stroke();
      }

      // Draw horizontal lines
      for (let y = startY; y <= endY; y++) {
        ctx.beginPath();
        ctx.moveTo(startX, Math.floor(y));
        ctx.lineTo(endX, Math.floor(y));
        ctx.stroke();
      }

      ctx.restore();
    },
    [viewport, showPixelGrid]
  );

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-[5]"
      style={{
        opacity: showPixelGrid && viewport.zoom >= 4 ? 1 : 0,
        transition: "opacity 200ms ease-in-out",
      }}
    />
  );
}

import React, { useEffect, useState } from "react";
import { Range } from "slate";

interface CustomTextSelectionProps {
  editor: any;
  selection: Range | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isActive: boolean;
  scale?: number; // Canvas zoom/scale factor
  updateTrigger?: number; // Force recalculation when this changes
}

interface SelectionRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Helper function to detect if selection extends to end of line and merge accordingly
function processSelectionRects(
  rects: SelectionRect[],
  containerRef: React.RefObject<HTMLDivElement | null>
): SelectionRect[] {
  if (rects.length <= 1) return rects;

  // Group rectangles by line (similar top values)
  const lines: SelectionRect[][] = [];
  const tolerance = 2; // Pixels tolerance for same line

  rects.forEach((rect) => {
    let addedToLine = false;

    for (const line of lines) {
      if (Math.abs(line[0].top - rect.top) <= tolerance) {
        line.push(rect);
        addedToLine = true;
        break;
      }
    }

    if (!addedToLine) {
      lines.push([rect]);
    }
  });

  // Process each line to determine if we should show full line width
  return lines.map((lineRects, lineIndex) => {
    // Sort by left position
    lineRects.sort((a, b) => a.left - b.left);

    const leftmost = lineRects[0];
    const rightmost = lineRects[lineRects.length - 1];

    // Find the maximum height and consistent top position
    const maxHeight = Math.max(...lineRects.map((r) => r.height));
    const minTop = Math.min(...lineRects.map((r) => r.top));

    const containerWidth = containerRef.current?.offsetWidth || 0;
    const selectionRightEdge = rightmost.left + rightmost.width;

    // More precise full-line detection:
    // 1. Selection starts near the beginning of the container (within 10 pixels)
    const startsFromBeginning = leftmost.left <= 10;

    // 2. Selection extends to near the end of the container (80% threshold)
    const extendsToEnd = selectionRightEdge > containerWidth * 0.8;

    // 3. Has a very wide rectangle that suggests browser full-line selection
    const hasFullLineRect = lineRects.some(
      (rect) => rect.width > containerWidth * 0.7
    );

    // 4. For multi-line selections, only apply full-line behavior to:
    //    - First line: only if it starts from beginning
    //    - Middle lines: only if they have full-line rects or start from beginning and extend to end
    //    - Last line: only if it extends to the end
    const isFirstLine = lineIndex === 0;
    const isLastLine = lineIndex === lines.length - 1;
    const isMiddleLine = !isFirstLine && !isLastLine;

    let shouldShowFullLine = false;

    if (lines.length === 1) {
      // Single line: show full line only if it starts from beginning AND extends to end
      shouldShowFullLine = startsFromBeginning && extendsToEnd;
    } else {
      // Multi-line selection
      if (isFirstLine) {
        // First line: show full only if it starts from beginning AND (extends to end OR has full-line rect)
        shouldShowFullLine =
          startsFromBeginning && (extendsToEnd || hasFullLineRect);
      } else if (isLastLine) {
        // Last line: show full only if it extends to end AND (starts from beginning OR has full-line rect)
        shouldShowFullLine =
          extendsToEnd && (startsFromBeginning || hasFullLineRect);
      } else if (isMiddleLine) {
        // Middle line: show full only if it has clear full-line rect or starts from beginning and extends to end
        shouldShowFullLine =
          hasFullLineRect || (startsFromBeginning && extendsToEnd);
      }
    }

    if (shouldShowFullLine) {
      // Show full line width
      return {
        top: minTop,
        left: 0, // Start from beginning of container
        width: containerWidth, // Full container width
        height: maxHeight,
      };
    } else {
      // Show only selected portion
      return {
        top: minTop,
        left: leftmost.left,
        width: rightmost.left + rightmost.width - leftmost.left,
        height: maxHeight,
      };
    }
  });
}

export default function CustomTextSelection({
  editor,
  selection,
  containerRef,
  isActive,
  scale = 1,
  updateTrigger,
}: CustomTextSelectionProps) {
  const [selectionRects, setSelectionRects] = useState<SelectionRect[]>([]);

  useEffect(() => {
    if (!isActive || !selection || !containerRef.current) {
      setSelectionRects([]);
      return;
    }

    // Use DOM selection to calculate visual selection rectangles
    const updateSelectionRects = () => {
      const domSelection = window.getSelection();
      if (
        !domSelection ||
        domSelection.rangeCount === 0 ||
        !containerRef.current
      ) {
        setSelectionRects([]);
        return;
      }

      try {
        const range = domSelection.getRangeAt(0);
        const containerRect = containerRef.current.getBoundingClientRect();

        // Get all rects for the selection (handles multi-line selections)
        const domRects = range.getClientRects();

        const rects: SelectionRect[] = Array.from(domRects).map(
          (rect: DOMRect) => {
            // Account for canvas scale/zoom
            const relativeTop = (rect.top - containerRect.top) / scale;
            const relativeLeft = (rect.left - containerRect.left) / scale;
            const scaledWidth = rect.width / scale;
            const scaledHeight = rect.height / scale;

            return {
              top: relativeTop,
              left: relativeLeft,
              width: scaledWidth,
              height: scaledHeight,
            };
          }
        );

        // Process rectangles with smart full-line detection
        const processedRects = processSelectionRects(rects, containerRef);
        setSelectionRects(processedRects);

        // Debug logging for selection behavior
        console.log("🎯 SMART SELECTION:", {
          originalRects: rects.length,
          processedRects: processedRects.length,
          containerWidth: containerRef.current?.offsetWidth,
          lines: rects.map((r, i) => ({
            index: i,
            left: r.left,
            width: r.width,
            rightEdge: r.left + r.width,
            startsFromBeginning: r.left <= 10,
            extendsToEnd:
              r.left + r.width > (containerRef.current?.offsetWidth || 0) * 0.8,
          })),
          results: processedRects.map((r, i) => ({
            line: i,
            left: r.left,
            width: r.width,
            isFullLine:
              r.left === 0 && r.width === containerRef.current?.offsetWidth,
            isPartial:
              r.left > 0 || r.width < (containerRef.current?.offsetWidth || 0),
          })),
        });
      } catch (error) {
        console.error("Error calculating selection rects:", error);
        setSelectionRects([]);
      }
    };

    updateSelectionRects();

    // Update when DOM selection changes
    const handleSelectionChange = () => {
      updateSelectionRects();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [editor, selection, isActive, containerRef, scale, updateTrigger]);

  if (!isActive || selectionRects.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
      }}
    >
      {selectionRects.map((rect, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            backgroundColor: "rgba(59, 130, 246, 0.3)", // Blue selection
            pointerEvents: "none",
            // No transition/animation for precise positioning
          }}
        />
      ))}
    </div>
  );
}

import { SnapGuide } from "@/core/utils/snapping";

interface SnapGuidesProps {
  horizontalGuides: SnapGuide[];
  verticalGuides: SnapGuide[];
  isResizing: boolean;
}

const crossSize = 6;
const crossThickness = 0.5;

export default function SnapGuides({
  horizontalGuides,
  verticalGuides,
  isResizing,
}: SnapGuidesProps) {
  return (
    <div className="absolute inset-0 pointer-events-none z-40">
      {/* Horizontal guide lines - show only during drag, not resize */}
      {!isResizing &&
        horizontalGuides.map((guide, index) => (
          <div
            key={`h-line-${index}`}
            className="absolute h-px"
            style={{
              top: guide.position - 0.5,
              left: guide.start,
              width: guide.end - guide.start,
              backgroundColor: guide.type === "center" ? "#FF0000" : "#FF0000",
            }}
          />
        ))}

      {/* Vertical guide lines - show only during drag, not resize */}
      {!isResizing &&
        verticalGuides.map((guide, index) => (
          <div
            key={`v-line-${index}`}
            className="absolute w-px"
            style={{
              left: guide.position - 0.5,
              top: guide.start,
              height: guide.end - guide.start,
              backgroundColor: guide.type === "center" ? "#FF0000" : "#FF0000",
            }}
          />
        ))}

      {/* Snap point crosses - show for both drag and resize */}
      {horizontalGuides.map((guide, guideIndex) => {
        return guide.snapPoints?.map((snapPoint, pointIndex) => (
          <div
            key={`h-cross-${guideIndex}-${pointIndex}`}
            className="absolute"
            style={{
              left: snapPoint.x - crossSize / 2,
              top: snapPoint.y - crossSize / 2,
              width: crossSize,
              height: crossSize,
              rotate: "45deg",
              pointerEvents: "none",
            }}
          >
            {/* Mini cross */}
            <div
              className="absolute"
              style={{
                left: crossSize / 2,
                top: 0,
                width: crossThickness,
                height: crossSize,
                backgroundColor:
                  guide.type === "center" ? "#FF0000" : "#FF0000",
              }}
            />
            <div
              className="absolute"
              style={{
                left: 0,
                top: crossSize / 2,
                width: crossSize,
                height: crossThickness,
                backgroundColor:
                  guide.type === "center" ? "#FF0000" : "#FF0000",
              }}
            />
          </div>
        ));
      })}

      {verticalGuides.map((guide, guideIndex) => {
        return guide.snapPoints?.map((snapPoint, pointIndex) => (
          <div
            key={`v-cross-${guideIndex}-${pointIndex}`}
            className="absolute"
            style={{
              left: snapPoint.x - crossSize / 2,
              top: snapPoint.y - crossSize / 2,
              width: crossSize,
              height: crossSize,
              rotate: "45deg",
              pointerEvents: "none",
            }}
          >
            {/* Mini cross */}
            <div
              className="absolute"
              style={{
                left: "50%",
                top: 0,
                width: crossThickness,
                height: "100%",
                transform: "translateX(-50%)",
                backgroundColor:
                  guide.type === "center" ? "#FF0000" : "#FF0000",
              }}
            />
            <div
              className="absolute"
              style={{
                left: 0,
                top: "50%",
                width: "100%",
                height: 0.5,
                transform: "translateY(-50%)",
                backgroundColor:
                  guide.type === "center" ? "#FF0000" : "#FF0000",
              }}
            />
          </div>
        ));
      })}
    </div>
  );
}

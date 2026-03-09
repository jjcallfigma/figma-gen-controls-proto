import { Button } from "@/components/ui/button";
import { useAppStore } from "@/core/state/store";
import {
  convertToParentSpace,
  getAbsolutePosition,
} from "@/core/utils/coordinates";
import { CanvasObject } from "@/types/canvas";
import { useMemo } from "react";
import {
  Icon24LayoutAlignBottom,
  Icon24LayoutAlignHorizontalCenter,
  Icon24LayoutAlignLeft,
  Icon24LayoutAlignRight,
  Icon24LayoutAlignTop,
  Icon24LayoutAlignVerticalCenter,
} from "./icons";
import { Icon24LayoutDistributeHorizontalSpacing } from "./icons/icon-24-layout-distribute-horizontal-spacing";
import { Icon24LayoutDistributeVerticalSpacing } from "./icons/icon-24-layout-distribute-vertical-spacing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface AlignmentControlsProps {
  selectedObjects: CanvasObject[];
}

type AlignmentType =
  | "left"
  | "center-horizontal"
  | "right"
  | "top"
  | "center-vertical"
  | "bottom"
  | "distribute-horizontal"
  | "distribute-vertical";

export default function AlignmentControls({
  selectedObjects,
}: AlignmentControlsProps) {
  const { objects, dispatch } = useAppStore();

  // Determine if alignment should be enabled
  const alignmentState = useMemo(() => {
    if (selectedObjects.length === 0) {
      return { enabled: false, reason: "No objects selected" };
    }

    // Check if any selected object is a child of auto layout (excluding absolutely positioned children)
    const hasNonAbsoluteAutoLayoutChildren = selectedObjects.some((obj) => {
      if (!obj.parentId || obj.absolutePositioned) return false;
      const parent = objects[obj.parentId];
      return (
        parent?.type === "frame" &&
        parent.properties?.type === "frame" &&
        (parent.properties as any).autoLayout?.mode !== "none"
      );
    });

    if (hasNonAbsoluteAutoLayoutChildren) {
      return {
        enabled: false,
        reason:
          "Auto layout children cannot be aligned (except absolutely positioned ones)",
      };
    }

    // Single object on root canvas (no parent) - not allowed
    if (selectedObjects.length === 1 && !selectedObjects[0].parentId) {
      return { enabled: false, reason: "Cannot align single object on canvas" };
    }

    return { enabled: true, reason: null };
  }, [selectedObjects, objects]);

  // Determine alignment reference and mode
  const alignmentContext = useMemo(() => {
    if (!alignmentState.enabled) return null;

    const parents = new Set(selectedObjects.map((obj) => obj.parentId));

    if (selectedObjects.length === 1) {
      // Single object in a frame - align to parent
      const parent = objects[selectedObjects[0].parentId!];
      return {
        mode: "to-parent" as const,
        parent,
        objects: selectedObjects,
      };
    } else if (parents.size === 1) {
      // Multiple objects, same parent - align to each other
      const parentId = Array.from(parents)[0];
      const parent = parentId ? objects[parentId] : null;
      return {
        mode: "to-each-other" as const,
        parent,
        objects: selectedObjects,
      };
    } else {
      // Multiple objects, different parents - align to each other
      return {
        mode: "cross-parent" as const,
        parent: null,
        objects: selectedObjects,
      };
    }
  }, [selectedObjects, objects, alignmentState.enabled]);

  const handleAlignment = (type: AlignmentType) => {
    if (!alignmentContext) return;

    console.log("🎯 ALIGN: Starting alignment", {
      type,
      mode: alignmentContext.mode,
      objectCount: alignmentContext.objects.length,
    });

    const updates: Array<{
      id: string;
      changes: Partial<CanvasObject>;
      previousValues: Partial<CanvasObject>;
    }> = [];

    // Calculate alignment based on context
    switch (alignmentContext.mode) {
      case "to-parent":
        calculateParentAlignment(type, alignmentContext, updates);
        break;
      case "to-each-other":
      case "cross-parent":
        calculateObjectAlignment(type, alignmentContext, updates);
        break;
    }

    if (updates.length > 0) {
      dispatch({
        type: "objects.updated.batch",
        payload: {
          updates,
          context: `alignment-${type}`,
        },
      });
    }
  };

  const calculateParentAlignment = (
    type: AlignmentType,
    context: NonNullable<typeof alignmentContext>,
    updates: Array<{
      id: string;
      changes: Partial<CanvasObject>;
      previousValues: Partial<CanvasObject>;
    }>
  ) => {
    const obj = context.objects[0];
    const parent = context.parent!;

    let newX = obj.x;
    let newY = obj.y;

    switch (type) {
      case "left":
        newX = 0; // Relative to parent
        break;
      case "center-horizontal":
        newX = (parent.width - obj.width) / 2;
        break;
      case "right":
        newX = parent.width - obj.width;
        break;
      case "top":
        newY = 0; // Relative to parent
        break;
      case "center-vertical":
        newY = (parent.height - obj.height) / 2;
        break;
      case "bottom":
        newY = parent.height - obj.height;
        break;
    }

    if (newX !== obj.x || newY !== obj.y) {
      updates.push({
        id: obj.id,
        changes: { x: newX, y: newY },
        previousValues: { x: obj.x, y: obj.y },
      });
    }
  };

  const calculateObjectAlignment = (
    type: AlignmentType,
    context: NonNullable<typeof alignmentContext>,
    updates: Array<{
      id: string;
      changes: Partial<CanvasObject>;
      previousValues: Partial<CanvasObject>;
    }>
  ) => {
    const objects = context.objects;
    const allObjects = useAppStore.getState().objects;

    if (context.mode === "cross-parent") {
      // For cross-parent alignment, align relatively to their parents
      calculateCrossParentAlignment(type, objects, allObjects, updates);
    } else {
      // For same-parent alignment, align absolutely to each other
      calculateSameParentAlignment(type, objects, allObjects, updates);
    }
  };

  const calculateSameParentAlignment = (
    type: AlignmentType,
    objects: CanvasObject[],
    allObjects: Record<string, CanvasObject>,
    updates: Array<{
      id: string;
      changes: Partial<CanvasObject>;
      previousValues: Partial<CanvasObject>;
    }>
  ) => {
    // Calculate bounding box of all objects (in world coordinates)
    const worldBounds = objects.map((obj) => {
      const absPos = getAbsolutePosition(obj.id, allObjects);
      return {
        obj,
        left: absPos.x,
        top: absPos.y,
        right: absPos.x + obj.width,
        bottom: absPos.y + obj.height,
        centerX: absPos.x + obj.width / 2,
        centerY: absPos.y + obj.height / 2,
      };
    });

    // Find alignment target
    let targetValue: number;

    switch (type) {
      case "left":
        targetValue = Math.min(...worldBounds.map((b) => b.left));
        break;
      case "center-horizontal":
        const minLeft = Math.min(...worldBounds.map((b) => b.left));
        const maxRight = Math.max(...worldBounds.map((b) => b.right));
        targetValue = (minLeft + maxRight) / 2;
        break;
      case "right":
        targetValue = Math.max(...worldBounds.map((b) => b.right));
        break;
      case "top":
        targetValue = Math.min(...worldBounds.map((b) => b.top));
        break;
      case "center-vertical":
        const minTop = Math.min(...worldBounds.map((b) => b.top));
        const maxBottom = Math.max(...worldBounds.map((b) => b.bottom));
        targetValue = (minTop + maxBottom) / 2;
        break;
      case "bottom":
        targetValue = Math.max(...worldBounds.map((b) => b.bottom));
        break;
      case "distribute-horizontal":
        distributeObjects(worldBounds, "horizontal", updates);
        return;
      case "distribute-vertical":
        distributeObjects(worldBounds, "vertical", updates);
        return;
    }

    // Apply alignment to each object
    worldBounds.forEach(({ obj, left, top }) => {
      let newWorldX = left;
      let newWorldY = top;

      switch (type) {
        case "left":
          newWorldX = targetValue;
          break;
        case "center-horizontal":
          newWorldX = targetValue - obj.width / 2;
          break;
        case "right":
          newWorldX = targetValue - obj.width;
          break;
        case "top":
          newWorldY = targetValue;
          break;
        case "center-vertical":
          newWorldY = targetValue - obj.height / 2;
          break;
        case "bottom":
          newWorldY = targetValue - obj.height;
          break;
      }

      // Convert back to local coordinates
      const newLocalPos = convertToParentSpace(
        { x: newWorldX, y: newWorldY },
        obj.parentId,
        allObjects
      );

      if (newLocalPos.x !== obj.x || newLocalPos.y !== obj.y) {
        updates.push({
          id: obj.id,
          changes: { x: newLocalPos.x, y: newLocalPos.y },
          previousValues: { x: obj.x, y: obj.y },
        });
      }
    });
  };

  const calculateCrossParentAlignment = (
    type: AlignmentType,
    objects: CanvasObject[],
    allObjects: Record<string, CanvasObject>,
    updates: Array<{
      id: string;
      changes: Partial<CanvasObject>;
      previousValues: Partial<CanvasObject>;
    }>
  ) => {
    // For cross-parent alignment, find the target relative position within each parent
    const localPositions = objects.map((obj) => {
      const parent = obj.parentId ? allObjects[obj.parentId] : null;
      return {
        obj,
        parent,
        // Calculate position relative to parent
        relativeX: obj.x,
        relativeY: obj.y,
        // Calculate position as percentage of parent size (for center alignment)
        percentX: parent ? obj.x / parent.width : 0,
        percentY: parent ? obj.y / parent.height : 0,
        // Calculate distance from edges
        distanceFromLeft: obj.x,
        distanceFromRight: parent ? parent.width - (obj.x + obj.width) : 0,
        distanceFromTop: obj.y,
        distanceFromBottom: parent ? parent.height - (obj.y + obj.height) : 0,
      };
    });

    // Find the target value based on alignment type
    let targetValue: number;

    switch (type) {
      case "left":
        // Use the smallest distance from left edge
        targetValue = Math.min(
          ...localPositions.map((p) => p.distanceFromLeft)
        );
        break;
      case "center-horizontal":
        // Use the smallest percentage from left (most centered position)
        targetValue = Math.min(...localPositions.map((p) => p.percentX));
        break;
      case "right":
        // Use the smallest distance from right edge
        targetValue = Math.min(
          ...localPositions.map((p) => p.distanceFromRight)
        );
        break;
      case "top":
        // Use the smallest distance from top edge
        targetValue = Math.min(...localPositions.map((p) => p.distanceFromTop));
        break;
      case "center-vertical":
        // Use the smallest percentage from top (most centered position)
        targetValue = Math.min(...localPositions.map((p) => p.percentY));
        break;
      case "bottom":
        // Use the smallest distance from bottom edge
        targetValue = Math.min(
          ...localPositions.map((p) => p.distanceFromBottom)
        );
        break;
      default:
        return; // Skip distribute for cross-parent for now
    }

    // Apply the target value to each object relative to its parent
    localPositions.forEach(({ obj, parent }) => {
      if (!parent) return; // Skip objects without parents

      let newX = obj.x;
      let newY = obj.y;

      switch (type) {
        case "left":
          newX = targetValue;
          break;
        case "center-horizontal":
          newX = targetValue * parent.width;
          break;
        case "right":
          newX = parent.width - obj.width - targetValue;
          break;
        case "top":
          newY = targetValue;
          break;
        case "center-vertical":
          newY = targetValue * parent.height;
          break;
        case "bottom":
          newY = parent.height - obj.height - targetValue;
          break;
      }

      if (newX !== obj.x || newY !== obj.y) {
        updates.push({
          id: obj.id,
          changes: { x: newX, y: newY },
          previousValues: { x: obj.x, y: obj.y },
        });
      }
    });
  };

  const distributeObjects = (
    worldBounds: Array<{
      obj: CanvasObject;
      left: number;
      top: number;
      right: number;
      bottom: number;
      centerX: number;
      centerY: number;
    }>,
    direction: "horizontal" | "vertical",
    updates: Array<{
      id: string;
      changes: Partial<CanvasObject>;
      previousValues: Partial<CanvasObject>;
    }>
  ) => {
    if (worldBounds.length < 3) return; // Need at least 3 objects to distribute

    // Sort objects by position
    const sorted = [...worldBounds].sort((a, b) => {
      return direction === "horizontal"
        ? a.centerX - b.centerX
        : a.centerY - b.centerY;
    });

    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const totalSpan =
      direction === "horizontal"
        ? last.centerX - first.centerX
        : last.centerY - first.centerY;

    const spacing = totalSpan / (sorted.length - 1);

    // Apply distribution
    sorted.forEach((item, index) => {
      if (index === 0 || index === sorted.length - 1) return; // Don't move first and last

      const targetPos =
        direction === "horizontal"
          ? first.centerX + spacing * index
          : first.centerY + spacing * index;

      let newWorldX = item.left;
      let newWorldY = item.top;

      if (direction === "horizontal") {
        newWorldX = targetPos - item.obj.width / 2;
      } else {
        newWorldY = targetPos - item.obj.height / 2;
      }

      const newLocalPos = convertToParentSpace(
        { x: newWorldX, y: newWorldY },
        item.obj.parentId,
        useAppStore.getState().objects
      );

      if (newLocalPos.x !== item.obj.x || newLocalPos.y !== item.obj.y) {
        updates.push({
          id: item.obj.id,
          changes: { x: newLocalPos.x, y: newLocalPos.y },
          previousValues: { x: item.obj.x, y: item.obj.y },
        });
      }
    });
  };

  // if (!alignmentState.enabled) {
  //   return (
  //     <div className="text-xs text-muted-foreground p-2">
  //       {alignmentState.reason}
  //     </div>
  //   );
  // }

  return (
    <div className="grid grid-cols-[1fr_1fr_24px] gap-2 w-full h-8 items-center">
      {/* Horizontal Alignment */}
      <div className="flex gap-px rounded-[5px] bg-default w-full overflow-hidden">
        <Button
          variant="toggle"
          size="toggle"
          disabled={!alignmentState.enabled}
          onClick={() => handleAlignment("left")}
          title="Align Left"
          className="group"
        >
          <Icon24LayoutAlignLeft className="group-disabled:text-tertiary" />
        </Button>
        <Button
          variant="toggle"
          size="toggle"
          disabled={!alignmentState.enabled}
          onClick={() => handleAlignment("center-horizontal")}
          title="Align Center Horizontal"
          className="group"
        >
          <Icon24LayoutAlignHorizontalCenter className="group-disabled:text-tertiary" />
        </Button>
        <Button
          variant="toggle"
          size="toggle"
          disabled={!alignmentState.enabled}
          onClick={() => handleAlignment("right")}
          title="Align Right"
          className="group"
        >
          <Icon24LayoutAlignRight className="group-disabled:text-tertiary" />
        </Button>
        {/* {selectedObjects.length >= 3 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAlignment("distribute-horizontal")}
            title="Distribute Horizontal"
            className="p-1 h-6 w-6"
          >
            <AlignHorizontalSpaceBetween className="h-3 w-3" />
          </Button>
        )} */}
      </div>

      {/* Vertical Alignment */}
      <div className="flex gap-px rounded-[5px] bg-default w-full overflow-hidden">
        <Button
          variant="toggle"
          size="toggle"
          disabled={!alignmentState.enabled}
          onClick={() => handleAlignment("top")}
          title="Align Top"
          className="group"
        >
          <Icon24LayoutAlignTop className="group-disabled:text-tertiary" />
        </Button>
        <Button
          variant="toggle"
          size="toggle"
          disabled={!alignmentState.enabled}
          onClick={() => handleAlignment("center-vertical")}
          title="Align Center Vertical"
          className="group"
        >
          <Icon24LayoutAlignVerticalCenter className="group-disabled:text-tertiary" />
        </Button>
        <Button
          variant="toggle"
          size="toggle"
          disabled={!alignmentState.enabled}
          onClick={() => handleAlignment("bottom")}
          title="Align Bottom"
          className="group"
        >
          <Icon24LayoutAlignBottom className="group-disabled:text-tertiary" />
        </Button>
        {/* {selectedObjects.length >= 3 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAlignment("distribute-vertical")}
            title="Distribute Vertical"
            className="p-1 h-6 w-6"
          >
            <AlignVerticalSpaceBetween className="h-3 w-3" />
          </Button>
        )} */}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="icon" size="icon">
            <Icon24LayoutDistributeVerticalSpacing />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" sideOffset={10}>
          <DropdownMenuItem
            onClick={() => handleAlignment("distribute-horizontal")}
          >
            <Icon24LayoutDistributeHorizontalSpacing className="text-onbrand" />{" "}
            Distribute horizontal spacing
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleAlignment("distribute-vertical")}
          >
            <Icon24LayoutDistributeVerticalSpacing className="text-onbrand" />{" "}
            Distribute vertical spacing
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Context Info */}
      {/* {alignmentContext && (
        <div className="text-xs text-muted-foreground">
          {alignmentContext.mode === "to-parent" && "Align to parent frame"}
          {alignmentContext.mode === "to-each-other" && "Align to each other"}
          {alignmentContext.mode === "cross-parent" && "Align across parents"}
        </div>
      )} */}
    </div>
  );
}

"use client";

import { useLayersPanel } from "@/components/canvas/CanvasWithPropertiesWrapper";
import { useNavigation } from "@/contexts/NavigationContext";
import FigmaImportService from "@/core/services/figmaImport";
import {
  useAppStore,
  useObjects,
  useSelectedObjects,
} from "@/core/state/store";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon16ChevronDown } from "./icons/icon-16-chevron-down";
import { Icon16CodeLayer } from "./icons/icon-16-code-layer";
import { Icon16Component } from "./icons/icon-16-component";
import { Icon16Frame } from "./icons/icon-16-frame";
import { Icon16Hidden } from "./icons/icon-16-hidden";
import { Icon16Image } from "./icons/icon-16-image";
import { Icon16Instance } from "./icons/icon-16-instance";
import { Icon16Pen } from "./icons/icon-16-pen";
import { Icon16Rectangle } from "./icons/icon-16-rectangle";
import { Icon16Text } from "./icons/icon-16-text";
import { Icon16Visible } from "./icons/icon-16-visible";
// Auto Layout Icons
import { Icon16AutolayoutGrid } from "./icons/icon-16-autolayout-grid";
import { Icon16AutolayoutHorizontalBottom } from "./icons/icon-16-autolayout-horizontal-bottom";
import { Icon16AutolayoutHorizontalCenter } from "./icons/icon-16-autolayout-horizontal-center";
import { Icon16AutolayoutHorizontalTop } from "./icons/icon-16-autolayout-horizontal-top";
import { Icon16AutolayoutVerticalCenter } from "./icons/icon-16-autolayout-vertical-center";
import { Icon16AutolayoutVerticalLeft } from "./icons/icon-16-autolayout-vertical-left";
import { Icon16AutolayoutVerticalRight } from "./icons/icon-16-autolayout-vertical-right";
import { Icon16AutolayoutWrapCenter } from "./icons/icon-16-autolayout-wrap-center";
import { Icon16AutolayoutWrapLeft } from "./icons/icon-16-autolayout-wrap-left";
import { Icon16AutolayoutWrapRight } from "./icons/icon-16-autolayout-wrap-right";
import { Icon24PlusSmall } from "./icons/icon-24-plus-small";
import { Icon24SidebarClosed } from "./icons/icon-24-sidebar-closed";

import FigmaMenu from "./FigmaMenu";

// Type guard to check if object is a frame
function isFrameObject(obj: any): boolean {
  return obj && obj.type === "frame";
}

// Safe getter for autoLayout from object
function getAutoLayout(obj: any) {
  if (isFrameObject(obj) && obj.properties?.type === "frame") {
    return obj.properties.autoLayout;
  }
  return undefined;
}

// Check if a rectangle has at least one visible image fill
function hasVisibleImageFill(obj: any): boolean {
  if (obj.type !== "rectangle" || !obj.fills) {
    return false;
  }

  return obj.fills.some(
    (fill: any) => fill.type === "image" && fill.visible === true,
  );
}

// Get the appropriate auto layout icon based on frame configuration
function getAutoLayoutIcon(obj: any) {
  const autoLayout = getAutoLayout(obj);

  if (!autoLayout || autoLayout.mode === "none") {
    return <Icon16Frame />;
  }

  const {
    mode,
    alignItems = "start",
    justifyContent = "start",
    wrap = false,
  } = autoLayout;

  // Grid layout
  if (mode === "grid") {
    return <Icon16AutolayoutGrid />;
  }

  // Wrap layouts
  if (wrap) {
    switch (alignItems) {
      case "start":
        return <Icon16AutolayoutWrapLeft />;
      case "center":
        return <Icon16AutolayoutWrapCenter />;
      case "end":
        return <Icon16AutolayoutWrapRight />;
      default:
        return <Icon16AutolayoutWrapLeft />;
    }
  }

  // Horizontal layout
  if (mode === "horizontal") {
    switch (alignItems) {
      case "start":
        return <Icon16AutolayoutHorizontalTop />;
      case "center":
        return <Icon16AutolayoutHorizontalCenter />;
      case "end":
        return <Icon16AutolayoutHorizontalBottom />;
      case "stretch":
        return <Icon16AutolayoutHorizontalCenter />; // Use center for stretch
      default:
        return <Icon16AutolayoutHorizontalTop />;
    }
  }

  // Vertical layout
  if (mode === "vertical") {
    switch (alignItems) {
      case "start":
        return <Icon16AutolayoutVerticalLeft />;
      case "center":
        return <Icon16AutolayoutVerticalCenter />;
      case "end":
        return <Icon16AutolayoutVerticalRight />;
      case "stretch":
        return <Icon16AutolayoutVerticalCenter />; // Use center for stretch
      default:
        return <Icon16AutolayoutVerticalLeft />;
    }
  }

  // Fallback to regular frame icon
  return <Icon16Frame />;
}

export default function LayersPanel() {
  const { isExpanded, setIsExpanded } = useLayersPanel();
  const {
    sidebarWidth: panelWidth,
    setSidebarWidth: setPanelWidth,
    setIsNavigationCollapsed,
    isNavigationCollapsed,
    setIsPropertiesPanelCollapsed,
  } = useNavigation();
  const [isResizing, setIsResizing] = useState(false);

  const objects = useObjects();
  const objectIds = useAppStore((state) => state.objectIds);
  const pages = useAppStore((state) => state.pages);
  const pageIds = useAppStore((state) => state.pageIds);
  const currentPageId = useAppStore((state) => state.currentPageId);
  const createPage = useAppStore((state) => state.createPage);
  const switchToPage = useAppStore((state) => state.switchToPage);
  const renamePage = useAppStore((state) => state.renamePage);
  const selectedObjects = useSelectedObjects();
  const dispatch = useAppStore((state) => state.dispatch);
  const setSelectionPreviewTarget = useAppStore(
    (state) => state.setSelectionPreviewTarget,
  );

  // State for collapsible sections
  const [isPagesExpanded, setIsPagesExpanded] = useState(true);

  // State for expanded layers (collapsed by default)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevSelectedIdsRef = useRef<string[]>([]);
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  // State for page renaming
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");

  // Track if silent auto-import has been attempted
  const autoImportAttempted = useRef(false);

  // Ref for the rename input
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus input when renaming starts
  useEffect(() => {
    if (renamingPageId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingPageId]);

  // Silent auto-import from URL parameters
  useEffect(() => {
    if (autoImportAttempted.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const figmaToken = urlParams.get("figma-token");
    const figmaFile = urlParams.get("figma-file");

    if (figmaToken && figmaFile) {
      autoImportAttempted.current = true;

      // Silent import without showing modal
      const performSilentImport = async () => {
        console.log("📍 LayersPanel: Silent import starting...");
        try {
          await FigmaImportService.importFromUrl();
          console.log("📍 LayersPanel: Silent import completed successfully");
        } catch (error) {
          console.error("📍 LayersPanel: Silent import failed:", error);
        }
      };

      // Small delay to ensure app is initialized
      setTimeout(performSilentImport, 100);
    }
  }, []);

  // Handle panel resizing
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = panelWidth;

      const handleMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - startX; // Normal direction for east resize
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

  // Get all top-level objects for current page (no parent and belongs to current page)
  const currentPage = currentPageId ? pages[currentPageId] : null;
  const currentPageObjectIds = currentPage?.objectIds || [];

  const topLevelObjects = currentPageObjectIds
    .map((id) => objects[id])
    .filter((obj) => obj && !obj.parentId);

  const handleObjectClick = (objectId: string, shiftKey: boolean) => {
    if (shiftKey) {
      // Toggle selection
      const isSelected = selectedObjects.some((obj) => obj.id === objectId);
      const newSelection = isSelected
        ? selectedObjects
            .filter((obj) => obj.id !== objectId)
            .map((obj) => obj.id)
        : [...selectedObjects.map((obj) => obj.id), objectId];

      dispatch({
        type: "selection.changed",
        payload: {
          selectedIds: newSelection,
          previousSelection: selectedObjects.map((obj) => obj.id),
        },
      });
    } else {
      // Single selection
      dispatch({
        type: "selection.changed",
        payload: {
          selectedIds: [objectId],
          previousSelection: selectedObjects.map((obj) => obj.id),
        },
      });
    }
  };

  const handleVisibilityToggle = useCallback(
    (objectId: string, e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent layer selection
      const object = objects[objectId];
      if (object) {
        dispatch({
          type: "object.updated",
          payload: {
            id: objectId,
            changes: { visible: !object.visible },
            previousValues: { visible: object.visible },
          },
        });
      }
    },
    [dispatch, objects],
  );

  const toggleExpanded = useCallback(
    (objectId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(objectId)) {
          next.delete(objectId);
        } else {
          next.add(objectId);
        }
        return next;
      });
    },
    [],
  );

  const handlePageClick = useCallback(
    (pageId: string, e: React.MouseEvent) => {
      // Prevent click when renaming
      if (renamingPageId === pageId) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      switchToPage(pageId);
    },
    [switchToPage, renamingPageId],
  );

  const handleCreatePage = useCallback(() => {
    const pageNumber = pageIds.length + 1;
    createPage(`Page ${pageNumber}`);
  }, [createPage, pageIds.length]);

  const handleStartRename = useCallback(
    (pageId: string, currentName: string) => {
      setRenamingPageId(pageId);
      setRenamingValue(currentName);
    },
    [],
  );

  const handleFinishRename = useCallback(() => {
    if (renamingPageId && renamingValue.trim()) {
      renamePage(renamingPageId, renamingValue.trim());
    }
    setRenamingPageId(null);
    setRenamingValue("");
  }, [renamingPageId, renamingValue, renamePage]);

  const handleCancelRename = useCallback(() => {
    setRenamingPageId(null);
    setRenamingValue("");
  }, []);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleFinishRename();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancelRename();
      }
    },
    [handleFinishRename, handleCancelRename],
  );

  // Keyboard shortcut for renaming current page (F2)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2" && currentPageId && !renamingPageId) {
        e.preventDefault();
        const currentPage = pages[currentPageId];
        if (currentPage) {
          handleStartRename(currentPageId, currentPage.name);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPageId, pages, renamingPageId, handleStartRename]);

  // Auto-expand ancestors of selected objects and scroll into view
  useEffect(() => {
    const currentIds = selectedObjects.map((obj) => obj.id).sort();
    const prevIds = prevSelectedIdsRef.current;

    if (
      currentIds.length === prevIds.length &&
      currentIds.every((id, i) => id === prevIds[i])
    ) {
      return;
    }

    prevSelectedIdsRef.current = currentIds;

    if (currentIds.length === 0) return;

    const objs = objectsRef.current;
    const ancestorIds = new Set<string>();
    for (const selObj of selectedObjects) {
      let parentId = selObj.parentId;
      while (parentId) {
        ancestorIds.add(parentId);
        const parent = objs[parentId];
        parentId = parent?.parentId;
      }
    }

    if (ancestorIds.size > 0) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        let changed = false;
        ancestorIds.forEach((id) => {
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }

    requestAnimationFrame(() => {
      if (!scrollContainerRef.current) return;
      const container = scrollContainerRef.current;
      let firstElement: Element | null = null;
      let firstTop = Infinity;

      for (const id of currentIds) {
        const el = container.querySelector(`[data-layer-id="${id}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top < firstTop) {
            firstTop = rect.top;
            firstElement = el;
          }
        }
      }

      if (firstElement) {
        (firstElement as HTMLElement).scrollIntoView({
          block: "nearest",
          behavior: "instant" as ScrollBehavior,
        });
      }
    });
  }, [selectedObjects]);

  const renderPagesSection = () => {
    return (
      <div className="border-b" style={{ borderColor: "var(--color-border)" }}>
        {/* Pages Header */}
        <div
          className="flex items-center justify-between pr-2 pt-2 pb-2 group"
          onClick={() => setIsPagesExpanded(!isPagesExpanded)}
        >
          <div
            className="flex items-center"
            style={{ color: "var(--color-icon-tertiary)" }}
          >
            <Icon16ChevronDown
              className={cn(
                "w-4 h-4 transition-transform opacity-0 group-hover:opacity-100",
                {
                  "rotate-[-90deg]": !isPagesExpanded,
                },
              )}
            />
            <span
              className="text-xs font-medium"
              style={{ color: "var(--color-text)" }}
            >
              Pages
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCreatePage();
            }}
            className="w-6 h-6 rounded-[5px] flex items-center justify-center hover:bg-secondary"
            title="Add page"
          >
            <Icon24PlusSmall className="w-6 h-6" />
          </button>
        </div>

        {/* Pages List */}
        {isPagesExpanded && (
          <div className="pb-2">
            {pageIds.map((pageId) => {
              const page = pages[pageId];
              const isCurrentPage = pageId === currentPageId;
              const isRenaming = renamingPageId === pageId;

              return (
                <div
                  key={pageId}
                  onClick={(e) => handlePageClick(pageId, e)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isRenaming) {
                      handleStartRename(pageId, page?.name || "");
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!isRenaming) {
                      handleStartRename(pageId, page?.name || "");
                    }
                  }}
                  className="py-1 px-2 group "
                  onMouseEnter={(e) => {
                    if (!isCurrentPage && !isRenaming) {
                      (e.currentTarget
                        .childNodes[0]! as HTMLElement)!.style.backgroundColor =
                        "var(--color-bg-hover)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrentPage && !isRenaming) {
                      (e.currentTarget
                        .childNodes[0]! as HTMLElement)!.style.backgroundColor =
                        "transparent";
                    }
                  }}
                >
                  <div
                    className="flex items-center gap-2 px-[7px] h-6 text-xs rounded-[5px]"
                    style={{
                      backgroundColor: isCurrentPage
                        ? isRenaming
                          ? "transparent"
                          : "var(--color-bg-secondary)"
                        : "transparent",
                      fontWeight: isCurrentPage ? "600" : "var(--font-medium)",
                      color: isCurrentPage
                        ? "var(--color-text-onselected)"
                        : "var(--color-text)",
                      border: isRenaming
                        ? "1px solid var(--color-border-selected)"
                        : "1px solid transparent",
                    }}
                  >
                    {isRenaming ? (
                      <input
                        type="text"
                        value={renamingValue}
                        onChange={(e) => setRenamingValue(e.target.value)}
                        onKeyDown={handleRenameKeyDown}
                        onBlur={handleFinishRename}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-transparent border-none outline-none text-xs w-full px-1 -mx-1"
                        style={{
                          color: isCurrentPage
                            ? "var(--color-text-onselected)"
                            : "var(--color-text)",
                        }}
                        autoFocus
                        onFocus={(e) => e.target.select()}
                      />
                    ) : (
                      <span className="truncate select-none">{page?.name}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const checkIfAncestorIsHidden = (obj: any) => {
    if (!obj.visible) return true;
    if (obj.parentId) return checkIfAncestorIsHidden(objects[obj.parentId]);
    return false;
  };

  const renderObject = (obj: any, depth: number = 0) => {
    const isSelected = selectedObjects.some(
      (selected) => selected.id === obj.id,
    );
    const hasChildren = obj.childIds && obj.childIds.length > 0;
    const isAncestorHidden = checkIfAncestorIsHidden(obj);

    return (
      <div key={obj.id}>
        <div
          data-layer-id={obj.id}
          onClick={(e) => handleObjectClick(obj.id, e.shiftKey)}
          className="py-1 group"
          onMouseEnter={(e) => {
            if (!isSelected) {
              (e.currentTarget
                .childNodes[0]! as HTMLElement)!.style.backgroundColor =
                "var(--color-bg-hover)";
            }
            setSelectionPreviewTarget(obj.id, "ui");
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              (e.currentTarget
                .childNodes[0]! as HTMLElement)!.style.backgroundColor =
                "transparent";
            }
          }}
        >
          <div
            className=" flex items-center gap-0 px-0 h-6 text-xs rounded-[5px] relative w-full"
            style={{
              backgroundColor: isSelected
                ? "var(--color-bg-selected)"
                : "transparent",
              color: isSelected
                ? "var(--color-text-onselected)"
                : "var(--color-text)",
              paddingLeft: `${depth * 24 + 4}px`,
              minWidth: `${depth * 24 + 4 + 150}px`,
            }}
          >
            {hasChildren && (
              <span
                className="w-4 h-4 flex items-center justify-center text-tertiary absolute -left-[16px]"
                style={{
                  marginLeft: `${depth * 24 + 4}px`,
                }}
                onClick={(e) => toggleExpanded(obj.id, e)}
              >
                <Icon16ChevronDown
                  className={cn("transition-transform", {
                    "rotate-[-90deg]": !expandedIds.has(obj.id),
                  })}
                />
              </span>
            )}

            <div
              className="flex items-center gap-2 flex-1 select-none w-full pr-1 shrink-1 hover:pr-8"
              style={{
                opacity: isAncestorHidden ? 0.3 : 1,
              }}
            >
              <span
                className={cn("", {
                  "text-tertiary": depth != 0 && !isSelected,
                })}
              >
                {obj.isMainComponent ? (
                  <Icon16Component className="text-component" />
                ) : obj.isComponentInstance ? (
                  <Icon16Instance className="text-component" />
                ) : obj.type === "frame" ? (
                  getAutoLayoutIcon(obj)
                ) : obj.type === "rectangle" ? (
                  hasVisibleImageFill(obj) ? (
                    <Icon16Image />
                  ) : (
                    <Icon16Rectangle />
                  )
                ) : obj.type === "ellipse" ? (
                  "⬟"
                ) : obj.type === "text" ? (
                  <Icon16Text />
                ) : obj.type === "vector" ? (
                  <Icon16Pen />
                ) : obj.type === "make" ? (
                  <Icon16CodeLayer />
                ) : null}
              </span>
              <span
                className={cn(
                  "truncate select-none whitespace-nowrap text-ellipsis overflow-hidden",
                  {
                    "text-component":
                      obj.isMainComponent || obj.isComponentInstance,
                    "font-medium": depth == 0 && obj.type === "frame",
                  },
                )}
              >
                {obj.name}
              </span>
            </div>

            {/* Visibility toggle - always show on hover or when invisible */}
            <button
              onClick={(e) => handleVisibilityToggle(obj.id, e)}
              className="w-6 h-6 rounded-[3px] absolute right-[0px] flex items-center justify-center hover:bg-secondary opacity-0 group-hover:opacity-100 shrink-0"
              style={{
                opacity: !obj.visible ? 1 : undefined, // Always show when invisible
              }}
              title={obj.visible ? "Hide layer" : "Show layer"}
            >
              {obj.visible ? (
                <Icon16Visible className="w-4 h-4" />
              ) : (
                <Icon16Hidden className="w-4 h-4" />
              )}
            </button>
            {obj.locked && (
              <span
                className="text-xs"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                🔒
              </span>
            )}
          </div>
        </div>
        {/* Render children */}
        {hasChildren &&
          expandedIds.has(obj.id) &&
          obj.childIds.map((childId: string) => {
            const childObj = objects[childId];
            return childObj ? renderObject(childObj, depth + 1) : null;
          })}
      </div>
    );
  };

  return (
    <>
      {/* Collapsed floating header */}
      {!isExpanded && (
        <div className="fixed top-[12px] left-[12px] z-40 h-[48px]">
          <div className="rounded-[13px] px-2 py-2 bg-default shadow-100 flex h-[48px]">
            <FigmaMenu />
            <div
              className="flex items-center gap-2 rounded-[5px] pl-3 py-0"
              style={{
                backgroundColor: "var(--color-bg-elevated)",
                borderColor: "var(--color-border)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "var(--color-bg-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor =
                  "var(--color-bg-elevated)")
              }
              onClick={() => {
                setIsExpanded(true);
                setIsNavigationCollapsed(false);
                setIsPropertiesPanelCollapsed(false);
              }}
            >
              <span
                className="text-[13px] font-medium pr-1"
                style={{ color: "var(--color-text)" }}
              >
                Untitled
              </span>
              <div className="flex items-center justify-center h-[32px] w-[32px]">
                <Icon24SidebarClosed />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expanded anchored panel */}
      {isExpanded && (
        <div
          className={`fixed top-0 h-full z-40 flex-shrink-0 border-r select-none ${isNavigationCollapsed ? "left-0" : "left-[48px]"}`}
          data-layers-panel
          style={{
            width: `${panelWidth}px`,
            backgroundColor: "var(--color-bg-elevated)",
            borderColor: "var(--color-border)",
          }}
        >
          {/* Resize Handle */}
          <div
            className="absolute right-0 top-0 w-1 h-full cursor-ew-resize"
            onMouseDown={handleMouseDown}
          />

          <div className="h-full flex flex-col">
            <div
              className="flex items-center justify-between pl-4 pr-2 pt-2 pb-2 flex-shrink-0 border-b"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="flex flex-1 flex-col">
                <div className="flex flex-1 items-center justify-between gap-2">
                  <span className="text-[13px] font-medium h-4 flex items-center">
                    Untitled
                  </span>
                  <button
                    onClick={() => {
                      setIsExpanded(false);
                      setIsNavigationCollapsed(true);
                      setIsPropertiesPanelCollapsed(true);
                    }}
                    className="w-8 h-8 rounded-[5px] flex items-center justify-center cursor-default"
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor =
                        "var(--color-bg-secondary)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.backgroundColor = "transparent")
                    }
                  >
                    <Icon24SidebarClosed />
                  </button>
                </div>
                <span className="text-xs text-secondary">Drafts</span>
              </div>
            </div>

            {/* Pages Section */}
            {renderPagesSection()}

            {/* Layers Header */}
            <div
              className="flex items-center justify-between pl-4 pr-2 pt-3 pb-2 flex-shrink-0 "
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--color-text)" }}
                >
                  Layers
                </span>
              </div>
            </div>

            {/* Layers list */}
            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-auto py-2 pl-3 pr-2 layers-scroll"
              onMouseLeave={() => {
                setSelectionPreviewTarget(null, "ui");
              }}
            >
              {topLevelObjects.length === 0 ? (
                <div className="text-center py-8"></div>
              ) : (
                <div className="w-fit min-w-full space-y-0 pb-12">
                  {topLevelObjects.map((obj) => renderObject(obj))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

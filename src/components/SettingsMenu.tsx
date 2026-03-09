import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { useTheme } from "@/contexts/ThemeContext";
import { DemoSceneService } from "@/core/services/demoSceneService";
import { useSettingsStore } from "@/core/state/settingsStore";
import { useAppStore } from "@/core/state/store";
import { usePersistence } from "@/hooks/usePersistence";
import React, { useState } from "react";

interface SettingsMenuProps {
  children: React.ReactNode;
}

export default function SettingsMenu({ children }: SettingsMenuProps) {
  const {
    // Settings state (excluding theme)
    showRulers,
    showPixelGrid,
    showGridLines,
    showLayersPanel,
    showPropertiesPanel,
    snapToGrid,
    snapToObjects,
    highQualityRendering,
    reducedMotion,

    // Actions (excluding theme)
    toggleRulers,
    togglePixelGrid,
    toggleLayersPanel,
    togglePropertiesPanel,
    toggleSnapToGrid,
    toggleSnapToObjects,
    toggleHighQualityRendering,
    toggleReducedMotion,
    resetSettings,
  } = useSettingsStore();

  // Use existing theme context
  const { theme, setTheme, toggleTheme } = useTheme();

  // Only subscribe to what's needed for rendering (objectIds length for
  // the disabled check). Full objects/pages are read inside the handler
  // to avoid re-rendering on every object change.
  const objectCount = useAppStore((s) => s.objectIds.length);
  const [isExporting, setIsExporting] = useState(false);

  // Persistence controls
  const persistence = usePersistence();

  const handleExportDemoScene = async () => {
    if (isExporting) return;

    setIsExporting(true);

    // Show loading toast
    const loadingToast = toast.loading("Creating shareable URL...", {
      description: "Creating shareable URL",
    });

    try {
      // Read full state at call time (not on every render)
      const { objects, objectIds, pages, pageIds, currentPageId } =
        useAppStore.getState();

      // Check if there are any objects to export
      if (objectIds.length === 0) {
        toast.error("No objects to export as demo scene", {
          description: "Create some objects on the canvas first",
        });
        return;
      }

      // Create a simple name based on the number of objects
      const count = objectIds.length;
      const sceneName = `Demo Scene ${count} ${
        count === 1 ? "Object" : "Objects"
      }`;
      const description = `Demo scene with ${count} ${
        count === 1 ? "object" : "objects"
      }`;

      // Export current canvas state and get shareable URL
      const { sceneId, shareableUrl } =
        DemoSceneService.saveCurrentSceneAndGetShareableUrl(
          sceneName,
          description,
          {
            objects,
            objectIds,
            pages,
            pageIds,
            currentPageId,
          }
        );

      // Generate the full demo URL
      const fullDemoUrl = `${window.location.origin}${shareableUrl}`;

      // Dismiss loading toast
      toast.dismiss(loadingToast);

      // Copy URL to clipboard
      try {
        await navigator.clipboard.writeText(fullDemoUrl);
        toast.success("Demo scene exported! URL copied to clipboard", {
          action: {
            label: "Open Demo",
            onClick: () => window.open(fullDemoUrl, "_blank"),
          },
        });
      } catch (clipboardError) {
        // Fallback if clipboard API fails
        toast.success("Demo scene exported!", {
          action: {
            label: "Open Demo",
            onClick: () => window.open(fullDemoUrl, "_blank"),
          },
        });
      }
    } catch (error) {
      console.error("🔴 [DEMO] Failed to export scene:", error);
      // Dismiss loading toast
      toast.dismiss(loadingToast);

      toast.error("Failed to export demo scene", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-48"
        align="start"
        side="bottom"
        sideOffset={8}
      >
        {/* Demo Scene Export */}
        <DropdownMenuItem
          onClick={handleExportDemoScene}
          disabled={isExporting || objectCount === 0}
          className=""
        >
          {isExporting ? "Exporting..." : "Copy link"}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Canvas Persistence */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex items-center gap-2">
            Canvas
            {persistence.hasData && (
              <span className="ml-auto text-xs text-green-600">●</span>
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            {persistence.hasData && (
              <>
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Saved: {persistence.objectCount} objects
                  <br />
                  {persistence.lastSaved?.toLocaleString()}
                </div>
                <DropdownMenuSeparator />
              </>
            )}

            <DropdownMenuItem
              onClick={async () => {
                console.log("🔧 [MANUAL SAVE] User clicked save now");
                if (await persistence.saveNow()) {
                  toast.success("Canvas saved successfully");
                } else {
                  toast.error("Failed to save canvas");
                }
              }}
              disabled={objectCount === 0}
            >
              Save now
            </DropdownMenuItem>

            {persistence.hasData && (
              <DropdownMenuItem
                onClick={async () => {
                  if (await persistence.loadSaved()) {
                    toast.success("Canvas loaded successfully");
                  } else {
                    toast.error("No saved canvas found");
                  }
                }}
              >
                Load saved
              </DropdownMenuItem>
            )}

            <DropdownMenuItem
              onClick={() => {
                persistence.newCanvas();
                toast.success("New canvas created");
              }}
            >
              New canvas
            </DropdownMenuItem>

            {persistence.hasData && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    persistence.clearSaved();
                    toast.success("Saved canvas cleared");
                  }}
                  className="text-red-600 focus:text-red-600"
                >
                  Clear saved
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex items-center gap-2">
            View
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuCheckboxItem
              checked={showPixelGrid}
              onCheckedChange={togglePixelGrid}
            >
              Pixel grid
              <span className="ml-auto text-onbrand-tertiary tracking-wide">
                ⇧'
              </span>
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={showRulers}
              onCheckedChange={toggleRulers}
            >
              Rulers
              <span className="ml-auto  text-onbrand-tertiary tracking-wide">
                ⇧R
              </span>
            </DropdownMenuCheckboxItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {/* View Settings */}

        <DropdownMenuSeparator />
        {/* Snap Settings */}
        {/* <DropdownMenuLabel>Snapping</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={snapToGrid}
          onCheckedChange={toggleSnapToGrid}
          className="flex items-center gap-2"
        >
          <Grid3X3 className="h-4 w-4" />
          Snap to Grid
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={snapToObjects}
          onCheckedChange={toggleSnapToObjects}
          className="flex items-center gap-2"
        >
          <SquareDot className="h-4 w-4" />
          Snap to Objects
          <span className="ml-auto text-xs text-muted-foreground">
            Cmd+Shift+S
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator /> */}
        {/* Performance & Accessibility */}
        {/* <DropdownMenuLabel>Performance</DropdownMenuLabel>
        <DropdownMenuCheckboxItem
          checked={highQualityRendering}
          onCheckedChange={toggleHighQualityRendering}
          className="flex items-center gap-2"
        >
          <Zap className="h-4 w-4" />
          High Quality Rendering
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={reducedMotion}
          onCheckedChange={toggleReducedMotion}
          className="flex items-center gap-2"
        >
          <Accessibility className="h-4 w-4" />
          Reduced Motion
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator /> */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex items-center gap-2">
            Preferences
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex items-center gap-2">
                Theme
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuCheckboxItem
                  checked={theme === "light"}
                  onCheckedChange={() => setTheme("light")}
                >
                  Light
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={theme === "dark"}
                  onCheckedChange={() => setTheme("dark")}
                >
                  Dark
                </DropdownMenuCheckboxItem>

                {/* Removed system theme option since existing theme context doesn't support it */}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

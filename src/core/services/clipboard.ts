import { CanvasObject } from "@/types/canvas";
import { nanoid } from "nanoid";

// Types for clipboard operations
export interface ClipboardData {
  type: "figma-objects";
  objects: CanvasObject[];
  timestamp: number;
  version: string;
}

export interface PasteOptions {
  targetParentId?: string;
  position?: { x: number; y: number };
  shouldCut?: boolean; // For internal cut operations
}

export interface PasteResult {
  success: boolean;
  pastedObjects?: CanvasObject[];
  error?: string;
}

// Track objects that were cut (for removal on paste)
let cutObjectIds: string[] = [];

/**
 * Clipboard service for copy/paste operations
 */
export class ClipboardService {
  private static readonly CLIPBOARD_FORMAT = "figma-objects";
  private static readonly VERSION = "1.0.0";

  // Store the last paste event data for access
  private static lastPasteEvent: ClipboardEvent | null = null;

  // Store processed image files from paste event
  private static lastPasteImageFiles: File[] = [];

  /**
   * Copy objects to clipboard
   */
  static async copyObjects(
    objects: CanvasObject[],
    allObjects: Record<string, CanvasObject>
  ): Promise<boolean> {
    if (objects.length === 0) {
      console.log("📋 CLIPBOARD: No objects to copy");
      return false;
    }

    try {
      // Clear any cut state since we're copying
      cutObjectIds = [];

      // Serialize objects with their children
      const serializedObjects = this.serializeObjectsWithChildren(
        objects,
        allObjects
      );

      const clipboardData: ClipboardData = {
        type: this.CLIPBOARD_FORMAT,
        objects: serializedObjects,
        timestamp: Date.now(),
        version: this.VERSION,
      };

      // Store in system clipboard
      if (navigator.clipboard) {
        try {
          // Try the modern ClipboardItem approach first
          if (window.ClipboardItem) {
            const blob = new Blob([JSON.stringify(clipboardData)], {
              type: "application/json",
            });
            const clipboardItem = new ClipboardItem({
              "application/json": blob,
            });
            await navigator.clipboard.write([clipboardItem]);
            console.log(
              "📋 CLIPBOARD: Successfully wrote object data as application/json"
            );
          } else {
            // Fallback to text clipboard
            await navigator.clipboard.writeText(JSON.stringify(clipboardData));
            console.log(
              "📋 CLIPBOARD: Successfully wrote object data as text/plain"
            );
          }
        } catch (error) {
          console.error(
            "📋 CLIPBOARD: Failed to write to system clipboard:",
            error
          );
          // Try text fallback
          try {
            await navigator.clipboard.writeText(JSON.stringify(clipboardData));
            console.log(
              "📋 CLIPBOARD: Wrote object data as text/plain fallback"
            );
          } catch (textError) {
            console.error(
              "📋 CLIPBOARD: Text fallback also failed:",
              textError
            );
          }
        }
      } else {
        console.warn("📋 CLIPBOARD: System clipboard not available");
        // Still return success - we did what we could
      }

      console.log(
        `📋 CLIPBOARD: Copied ${objects.length} objects to clipboard`
      );
      return true;
    } catch (error) {
      console.error("📋 CLIPBOARD: Error copying objects:", error);
      return false;
    }
  }

  /**
   * Cut objects to clipboard (marks them for removal on paste)
   */
  static async cutObjects(
    objects: CanvasObject[],
    allObjects: Record<string, CanvasObject>
  ): Promise<boolean> {
    const success = await this.copyObjects(objects, allObjects);
    if (success) {
      console.log(`📋 CLIPBOARD: Cut ${objects.length} objects to clipboard`);
    }
    return success;
  }

  /**
   * Get clipboard data for pasting
   */
  static async getClipboardData(): Promise<ClipboardData | null> {
    // Only use system clipboard - no fallbacks, no internal storage
    try {
      if (navigator.clipboard) {
        // First try the ClipboardItem API
        try {
          const clipboardItems = await navigator.clipboard.read();
          console.log(
            "📋 CLIPBOARD: Read clipboard items:",
            clipboardItems.length,
            "items found"
          );

          for (const item of clipboardItems) {
            console.log("📋 CLIPBOARD: Item types:", item.types);
            if (item.types.includes("application/json")) {
              const blob = await item.getType("application/json");
              const text = await blob.text();
              const data = JSON.parse(text) as ClipboardData;

              if (data.type === this.CLIPBOARD_FORMAT) {
                console.log(
                  "📋 CLIPBOARD: Found our object data as application/json"
                );
                return data;
              }
            }
          }
          console.log("📋 CLIPBOARD: No application/json object data found");
        } catch (clipboardError) {
          console.log(
            "📋 CLIPBOARD: ClipboardItem API failed, trying text API"
          );
        }

        // Fallback to text clipboard
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            const data = JSON.parse(text) as ClipboardData;
            if (data.type === this.CLIPBOARD_FORMAT) {
              console.log("📋 CLIPBOARD: Found our object data as text/plain");
              return data;
            }
          }
        } catch (textError) {
          console.log(
            "📋 CLIPBOARD: Text clipboard also failed or contained invalid JSON"
          );
        }

        console.log("📋 CLIPBOARD: No object data found in system clipboard");
      }
    } catch (error) {
      console.warn("📋 CLIPBOARD: Could not read system clipboard:", error);
    }

    return null;
  }

  /**
   * Check if our object data is actually in the system clipboard
   * This helps us determine if our internal data is fresh or stale
   */
  static async hasOurObjectDataInSystemClipboard(): Promise<boolean> {
    try {
      if (navigator.clipboard) {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
          if (item.types.includes("application/json")) {
            const blob = await item.getType("application/json");
            const text = await blob.text();
            const data = JSON.parse(text) as ClipboardData;

            if (data.type === this.CLIPBOARD_FORMAT) {
              return true;
            }
          }
        }
      }
    } catch (error) {
      console.warn(
        "📋 CLIPBOARD: Could not check system clipboard for object data:",
        error
      );
    }

    return false;
  }

  /**
   * Set the last paste event (called by paste event listener)
   */
  static setPasteEvent(event: ClipboardEvent): void {
    this.lastPasteEvent = event;
    console.log(
      "📋 CLIPBOARD: Paste event captured with",
      event.clipboardData?.items.length || 0,
      "items and",
      event.clipboardData?.files.length || 0,
      "files"
    );
  }

  /**
   * Set image files extracted from paste event (called immediately during paste)
   */
  static setImageFiles(files: File[]): void {
    this.lastPasteImageFiles = files;
    console.log(
      "📋 CLIPBOARD: Stored",
      files.length,
      "image files:",
      files.map((f) => f.name).join(", ")
    );
  }

  /**
   * Add a single image file (for backward compatibility)
   */
  static setImageFile(file: File): void {
    this.lastPasteImageFiles = [file];
    console.log(
      "📋 CLIPBOARD: Stored image file:",
      file.name,
      file.size,
      "bytes"
    );
  }

  /**
   * Check if there's pasteable image data in clipboard
   * First tries the paste event data, then falls back to clipboard API
   */
  static async hasImageData(): Promise<boolean> {
    // First check if we have stored image files from paste event
    if (this.lastPasteImageFiles.length > 0) {
      console.log(
        "📋 CLIPBOARD: Found",
        this.lastPasteImageFiles.length,
        "stored image files"
      );
      return true;
    }

    // Then check if we have a recent paste event with image data
    if (this.lastPasteEvent && this.lastPasteEvent.clipboardData) {
      console.log("📋 CLIPBOARD: Checking paste event data for images");

      // Check files first (this is where Finder images appear)
      const files = this.lastPasteEvent.clipboardData.files;
      console.log("📋 CLIPBOARD: Files array length:", files.length);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(
          `📋 CLIPBOARD: Paste event file ${i}: type="${file.type}", name="${file.name}", size=${file.size}`
        );
        if (file.type.startsWith("image/")) {
          console.log("📋 CLIPBOARD: Found image in paste event files!");
          return true;
        }
      }

      // Then check items (for web images)
      const items = this.lastPasteEvent.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(
          `📋 CLIPBOARD: Paste event item ${i}: type="${item.type}", kind="${item.kind}"`
        );
        if (item.type.startsWith("image/")) {
          console.log("📋 CLIPBOARD: Found image in paste event items!");
          return true;
        }
      }
    }

    // Fallback to clipboard API
    try {
      if (navigator.clipboard) {
        // Request clipboard permissions if needed
        try {
          const permission = await navigator.permissions.query({
            name: "clipboard-read" as PermissionName,
          });
          console.log(
            "📋 CLIPBOARD: Clipboard read permission:",
            permission.state
          );
        } catch (permError) {
          console.log("📋 CLIPBOARD: Could not check clipboard permissions");
        }

        const clipboardItems = await navigator.clipboard.read();
        console.log(
          "📋 CLIPBOARD: Checking for image data in",
          clipboardItems.length,
          "items"
        );
        for (const item of clipboardItems) {
          console.log("📋 CLIPBOARD: Item types for image check:", item.types);

          // Try to access ALL types to see what they contain
          for (const type of item.types) {
            console.log(`📋 CLIPBOARD: Examining type: "${type}"`);
            try {
              const blob = await item.getType(type);
              console.log(
                `📋 CLIPBOARD: Type "${type}" -> Blob(size=${blob.size}, type="${blob.type}")`
              );

              // Check if this blob is an image
              if (blob.type.startsWith("image/") || type.startsWith("image/")) {
                console.log("📋 CLIPBOARD: Found image data!");
                return true;
              }
            } catch (e) {
              console.log(
                `📋 CLIPBOARD: Could not read type "${type}":`,
                e instanceof Error ? e.message : String(e)
              );
            }
          }
        }

        // Check if text clipboard contains an image filename (from Finder)
        try {
          const text = await navigator.clipboard.readText();
          console.log(
            "📋 CLIPBOARD: Text clipboard content:",
            JSON.stringify(text)
          );
          if (text && this.isImageFileName(text)) {
            console.log(
              "📋 CLIPBOARD: Found image filename (but not actual image data):",
              text
            );
            // We can't access the actual file data due to browser security restrictions
            // But we can detect this case and provide helpful feedback
            return false; // Return false because we can't actually paste it
          }
        } catch (textError) {
          console.log("📋 CLIPBOARD: Could not read text for file path check");
        }

        console.log("📋 CLIPBOARD: No image types or file paths found");
      }
    } catch (error) {
      console.warn("📋 CLIPBOARD: Could not check for image data:", error);
      // Log more details about the error
      if (error instanceof Error) {
        console.warn("📋 CLIPBOARD: Error details:", error.name, error.message);
      }
    }
    return false;
  }

  /**
   * Get all image files from clipboard
   */
  static async getImageFiles(): Promise<File[]> {
    if (this.lastPasteImageFiles.length > 0) {
      console.log(
        "📋 CLIPBOARD: Returning",
        this.lastPasteImageFiles.length,
        "stored image files"
      );
      const files = [...this.lastPasteImageFiles];
      // Clear the stored files after using them
      this.lastPasteImageFiles = [];
      return files;
    }

    // Fallback to single image if available
    const singleImage = await this.getImageData();
    return singleImage ? [singleImage as File] : [];
  }

  /**
   * Get image data from clipboard (single image for backward compatibility)
   * First tries the stored files, then paste event data, then clipboard API
   */
  static async getImageData(): Promise<Blob | null> {
    // First check if we have stored image files from paste event
    if (this.lastPasteImageFiles.length > 0) {
      console.log(
        "📋 CLIPBOARD: Returning first stored image file of",
        this.lastPasteImageFiles.length
      );
      const file = this.lastPasteImageFiles[0];
      // Clear the stored files after using them for single image
      this.lastPasteImageFiles = [];
      return file;
    }

    // Then check if we have a recent paste event with image data
    if (this.lastPasteEvent && this.lastPasteEvent.clipboardData) {
      console.log("📋 CLIPBOARD: Getting image from paste event data");

      // Check files first (this is where Finder images appear)
      const files = this.lastPasteEvent.clipboardData.files;
      console.log(
        "📋 CLIPBOARD: Files array length for retrieval:",
        files.length
      );
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(
          `📋 CLIPBOARD: Paste event file ${i}: type="${file.type}", name="${file.name}", size=${file.size}`
        );
        if (file.type.startsWith("image/")) {
          console.log(
            "📋 CLIPBOARD: Retrieved image from paste event files:",
            file.size,
            "bytes, type:",
            file.type
          );
          // Clear the paste event after using it
          this.lastPasteEvent = null;
          return file;
        }
      }

      // Then check items (for web images)
      const items = this.lastPasteEvent.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        console.log(
          `📋 CLIPBOARD: Paste event item ${i}: type="${item.type}", kind="${item.kind}"`
        );
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            console.log(
              "📋 CLIPBOARD: Retrieved image from paste event items:",
              file.size,
              "bytes, type:",
              file.type
            );
            // Clear the paste event after using it
            this.lastPasteEvent = null;
            return file;
          }
        }
      }
    }

    // Fallback to clipboard API
    try {
      if (navigator.clipboard) {
        const clipboardItems = await navigator.clipboard.read();
        console.log(
          "📋 CLIPBOARD: Getting image data from",
          clipboardItems.length,
          "items"
        );
        for (const item of clipboardItems) {
          console.log(
            "📋 CLIPBOARD: Item types for image retrieval:",
            item.types
          );
          // Try to access ALL types to find image data
          for (const type of item.types) {
            console.log(`📋 CLIPBOARD: Trying to retrieve type: "${type}"`);
            try {
              const blob = await item.getType(type);
              console.log(
                `📋 CLIPBOARD: Type "${type}" -> Blob(size=${blob.size}, type="${blob.type}")`
              );

              // Return the first blob that is an image
              if (blob.type.startsWith("image/") || type.startsWith("image/")) {
                console.log("📋 CLIPBOARD: Returning image blob!");
                return blob;
              }
            } catch (e) {
              console.log(
                `📋 CLIPBOARD: Could not retrieve type "${type}":`,
                e instanceof Error ? e.message : String(e)
              );
            }
          }
        }

        // Check if text clipboard contains an image file path (from Finder)
        try {
          const text = await navigator.clipboard.readText();
          console.log(
            "📋 CLIPBOARD: Text clipboard content for loading:",
            JSON.stringify(text)
          );
          if (text && this.isImageFilePath(text)) {
            console.log("📋 CLIPBOARD: Loading image from file path:", text);
            return await this.loadImageFromPath(text);
          }
        } catch (textError) {
          console.log(
            "📋 CLIPBOARD: Could not read text for file path loading"
          );
        }

        console.log("📋 CLIPBOARD: No image data found to retrieve");
      }
    } catch (error) {
      console.warn("📋 CLIPBOARD: Could not get image data:", error);
    }
    return null;
  }

  /**
   * Check if a text string is just an image filename (from Finder copy)
   */
  private static isImageFileName(text: string): boolean {
    // Remove any whitespace
    const trimmed = text.trim();

    // Check for common image file extensions
    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".bmp",
      ".tiff",
      ".tif",
      ".webp",
      ".svg",
    ];
    const lowerText = trimmed.toLowerCase();

    // Must end with an image extension
    const hasImageExtension = imageExtensions.some((ext) =>
      lowerText.endsWith(ext)
    );

    // Should be just a filename (no path separators)
    const isJustFilename = !trimmed.includes("/") && !trimmed.includes("\\");

    return hasImageExtension && isJustFilename;
  }

  /**
   * Check if a text string is an image file path
   */
  private static isImageFilePath(text: string): boolean {
    // Remove any whitespace and check if it looks like a file path
    const trimmed = text.trim();

    // Check for common image file extensions
    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".bmp",
      ".tiff",
      ".tif",
      ".webp",
      ".svg",
    ];
    const lowerText = trimmed.toLowerCase();

    // Must end with an image extension
    const hasImageExtension = imageExtensions.some((ext) =>
      lowerText.endsWith(ext)
    );

    // Should look like a file path (contains / or \ and doesn't contain spaces in weird places)
    const looksLikeFilePath = trimmed.includes("/") || trimmed.includes("\\");

    return hasImageExtension && looksLikeFilePath;
  }

  /**
   * Load image data from a file path (for Finder copied files)
   * Note: This won't work due to browser security restrictions, but we'll try
   */
  private static async loadImageFromPath(
    filePath: string
  ): Promise<Blob | null> {
    try {
      console.log(
        "📋 CLIPBOARD: Attempting to load image from path:",
        filePath
      );

      // Try to create a file URL and fetch it
      // This will likely fail due to CORS/security restrictions
      const fileUrl = filePath.startsWith("file://")
        ? filePath
        : `file://${filePath}`;
      const response = await fetch(fileUrl);

      if (response.ok) {
        const blob = await response.blob();
        console.log("📋 CLIPBOARD: Successfully loaded image from file path");
        return blob;
      } else {
        console.warn(
          "📋 CLIPBOARD: Failed to fetch image from file path:",
          response.status
        );
      }
    } catch (error) {
      console.warn(
        "📋 CLIPBOARD: Cannot load image from file path due to browser security restrictions:",
        error
      );

      // Alternative: Try to use FileReader with a file input (won't work for clipboard paths)
      // This is a limitation of web browsers for security reasons
    }

    return null;
  }

  /**
   * Prepare objects for pasting with new IDs and positions
   */
  static prepareObjectsForPaste(
    objects: CanvasObject[],
    options: PasteOptions = {}
  ): CanvasObject[] {
    const { position, targetParentId } = options;

    // Create ID mapping for maintaining relationships
    const idMapping = new Map<string, string>();

    // First pass: generate new IDs
    objects.forEach((obj) => {
      idMapping.set(obj.id, nanoid());
    });

    // Find top-level objects (objects that don't have parents in the copied set)
    const topLevelObjects = objects.filter(
      (obj) => !obj.parentId || !idMapping.has(obj.parentId)
    );

    // Calculate offset based on top-level objects only
    let offsetX = 0;
    let offsetY = 0;

    if (position && !targetParentId) {
      // Pasting on canvas - center the selection on the specified point
      const bounds = this.calculateBounds(topLevelObjects);
      const selectionCenterX = bounds.x + bounds.width / 2;
      const selectionCenterY = bounds.y + bounds.height / 2;
      offsetX = position.x - selectionCenterX;
      offsetY = position.y - selectionCenterY;
    } else if (position && targetParentId) {
      // Pasting inside a frame - use position as relative offset within frame
      const bounds = this.calculateBounds(topLevelObjects);
      offsetX = position.x - bounds.x;
      offsetY = position.y - bounds.y;
    } else {
      // Default offset for visual feedback (paste slightly offset)
      offsetX = 20;
      offsetY = 20;
    }

    // Second pass: clone objects with new IDs and relationships
    return objects.map((obj) => {
      const newId = idMapping.get(obj.id)!;

      // Only apply offset to top-level objects
      const isTopLevel = !obj.parentId || !idMapping.has(obj.parentId);
      const newX = isTopLevel ? obj.x + offsetX : obj.x;
      const newY = isTopLevel ? obj.y + offsetY : obj.y;

      // Deep clone nested objects to avoid shared references
      const newObj: CanvasObject = {
        ...obj,
        id: newId,
        x: newX,
        y: newY,
        createdAt: Date.now(),
        properties: obj.properties
          ? JSON.parse(JSON.stringify(obj.properties))
          : obj.properties,
        fills: obj.fills ? JSON.parse(JSON.stringify(obj.fills)) : [],
        strokes: obj.strokes ? JSON.parse(JSON.stringify(obj.strokes)) : [],
        effects: obj.effects
          ? JSON.parse(JSON.stringify(obj.effects))
          : obj.effects,
        autoLayoutSizing: obj.autoLayoutSizing
          ? { ...obj.autoLayoutSizing }
          : obj.autoLayoutSizing,
        // Update parent/child relationships
        parentId:
          obj.parentId && idMapping.has(obj.parentId)
            ? idMapping.get(obj.parentId)
            : targetParentId,
        childIds: obj.childIds
          .map((childId) => idMapping.get(childId))
          .filter(Boolean) as string[],
        // Clear component instance relationships to avoid conflicts
        componentId: undefined,
        isComponentInstance: false,
        originalId: undefined,
        overrides: undefined,
      };

      return newObj;
    });
  }

  /**
   * Get IDs of objects that were cut (for removal after paste)
   */
  static getCutObjectIds(): string[] {
    return [...cutObjectIds];
  }

  /**
   * Clear cut state (called after successful paste of cut objects)
   */
  static clearCutState(): void {
    cutObjectIds = [];
  }

  /**
   * Serialize objects including their nested children
   * This requires access to the full objects map which should be passed in
   */
  static serializeObjectsWithChildren(
    rootObjects: CanvasObject[],
    allObjects: Record<string, CanvasObject>
  ): CanvasObject[] {
    const result: CanvasObject[] = [];
    const visited = new Set<string>();

    // Get all objects that need to be included (selected + their descendants)
    const includeObjectAndChildren = (obj: CanvasObject) => {
      if (visited.has(obj.id)) return;
      visited.add(obj.id);

      result.push(obj);

      // Include all children recursively
      obj.childIds.forEach((childId) => {
        const childObj = allObjects[childId];
        if (childObj) {
          includeObjectAndChildren(childObj);
        }
      });
    };

    rootObjects.forEach(includeObjectAndChildren);
    return result;
  }

  /**
   * Prepare objects for duplication with smart positioning
   */
  static prepareObjectsForDuplication(
    objects: CanvasObject[],
    options: {
      targetParentId?: string;
      placementStrategy:
        | "canvas-shift"
        | "canvas-same"
        | "frame-same"
        | "frame-autolayout";
      allObjects: Record<string, CanvasObject>;
    }
  ): { duplicatedObjects: CanvasObject[]; idMapping: Map<string, string> } {
    const { targetParentId, placementStrategy, allObjects } = options;

    // Serialize objects with their children
    const serializedObjects = this.serializeObjectsWithChildren(
      objects,
      allObjects
    );

    // Calculate positioning based on strategy
    let offsetX = 0;
    let offsetY = 0;

    switch (placementStrategy) {
      case "canvas-shift": {
        // For canvas objects, try to find a clear position to the right
        const bounds = this.calculateBounds(objects);
        const clearPosition = this.findClearPositionFromEnd(
          bounds,
          allObjects,
          targetParentId
        );
        offsetX = clearPosition.x - bounds.x;
        offsetY = clearPosition.y - bounds.y;
        break;
      }
      case "canvas-same":
      case "frame-same":
        // Place at the same location as originals
        offsetX = 0;
        offsetY = 0;
        break;
      case "frame-autolayout": {
        // For auto layout frames, objects will be positioned by the layout system
        // We just need to add them to the end of the children list
        offsetX = 0;
        offsetY = 0;
        break;
      }
    }

    console.log(
      `🔄 DUPLICATE: Using offset (${offsetX}, ${offsetY}) for strategy "${placementStrategy}"`
    );

    // Create new IDs for all objects
    const idMapping = new Map<string, string>();
    serializedObjects.forEach((obj) => {
      idMapping.set(obj.id, nanoid());
    });

    // Clone objects with new IDs and positioning
    const duplicatedObjects = serializedObjects.map((obj) => {
      const newId = idMapping.get(obj.id)!;

      // Only apply offset to top-level objects (those that don't have a parent in the selection)
      const isTopLevel = !obj.parentId || !idMapping.has(obj.parentId);
      const newX = isTopLevel ? obj.x + offsetX : obj.x;
      const newY = isTopLevel ? obj.y + offsetY : obj.y;

      // Deep clone nested objects to avoid shared references
      const newObj: CanvasObject = {
        ...obj,
        id: newId,
        x: newX,
        y: newY,
        createdAt: Date.now(),
        properties: obj.properties
          ? JSON.parse(JSON.stringify(obj.properties))
          : obj.properties,
        fills: obj.fills ? JSON.parse(JSON.stringify(obj.fills)) : [],
        strokes: obj.strokes ? JSON.parse(JSON.stringify(obj.strokes)) : [],
        effects: obj.effects
          ? JSON.parse(JSON.stringify(obj.effects))
          : obj.effects,
        autoLayoutSizing: obj.autoLayoutSizing
          ? { ...obj.autoLayoutSizing }
          : obj.autoLayoutSizing,
        // Update parent/child relationships
        parentId:
          obj.parentId && idMapping.has(obj.parentId)
            ? idMapping.get(obj.parentId)
            : targetParentId,
        childIds: obj.childIds
          .map((childId) => idMapping.get(childId))
          .filter(Boolean) as string[],
        // Clear component instance relationships to avoid conflicts
        componentId: undefined,
        isComponentInstance: false,
        originalId: undefined,
        overrides: undefined,
      };

      return newObj;
    });

    return { duplicatedObjects, idMapping };
  }

  /**
   * Find the first clear position to the right that doesn't overlap with existing objects
   * Starting from the END (rightmost edge) of the original bounds + 40px
   */
  private static findClearPositionFromEnd(
    originalBounds: { x: number; y: number; width: number; height: number },
    allObjects: Record<string, CanvasObject>,
    parentId?: string
  ): { x: number; y: number } {
    const SHIFT_AMOUNT = 40;
    const MAX_ATTEMPTS = 10;

    // Start from the END of the original bounds + shift amount
    let currentX = originalBounds.x + originalBounds.width + SHIFT_AMOUNT;
    let currentY = originalBounds.y;

    // Get sibling objects (objects with the same parent)
    const siblings = Object.values(allObjects).filter(
      (obj) => obj.parentId === parentId && obj.visible
    );

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const testBounds = {
        x: currentX,
        y: currentY,
        width: originalBounds.width,
        height: originalBounds.height,
      };

      // Check if this position overlaps with any sibling
      const hasOverlap = siblings.some((sibling) =>
        this.boundsOverlap(testBounds, {
          x: sibling.x,
          y: sibling.y,
          width: sibling.width,
          height: sibling.height,
        })
      );

      if (!hasOverlap) {
        return { x: currentX, y: currentY };
      }

      // Try next position
      currentX += SHIFT_AMOUNT;
    }

    // If we couldn't find a clear position, just use the shifted position from end
    return {
      x: originalBounds.x + originalBounds.width + SHIFT_AMOUNT,
      y: originalBounds.y,
    };
  }

  /**
   * Check if two rectangular bounds overlap
   */
  private static boundsOverlap(
    bounds1: { x: number; y: number; width: number; height: number },
    bounds2: { x: number; y: number; width: number; height: number }
  ): boolean {
    return !(
      bounds1.x + bounds1.width <= bounds2.x ||
      bounds2.x + bounds2.width <= bounds1.x ||
      bounds1.y + bounds1.height <= bounds2.y ||
      bounds2.y + bounds2.height <= bounds1.y
    );
  }

  /**
   * Calculate bounding box of objects
   */
  private static calculateBounds(objects: CanvasObject[]): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    if (objects.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    objects.forEach((obj) => {
      minX = Math.min(minX, obj.x);
      minY = Math.min(minY, obj.y);
      maxX = Math.max(maxX, obj.x + obj.width);
      maxY = Math.max(maxY, obj.y + obj.height);
    });

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
}

/**
 * Hook for accessing clipboard operations in components
 */
export function useClipboard() {
  return {
    copyObjects: ClipboardService.copyObjects,
    cutObjects: ClipboardService.cutObjects,
    getClipboardData: ClipboardService.getClipboardData,
    hasImageData: ClipboardService.hasImageData,
    getImageData: ClipboardService.getImageData,
    getImageFiles: ClipboardService.getImageFiles,
    prepareObjectsForPaste: ClipboardService.prepareObjectsForPaste,
    getCutObjectIds: ClipboardService.getCutObjectIds,
    clearCutState: ClipboardService.clearCutState,
    serializeObjectsWithChildren: ClipboardService.serializeObjectsWithChildren,
  };
}

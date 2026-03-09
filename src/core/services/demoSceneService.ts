import { createImageFill } from "@/core/utils/fills";
import { CanvasObject } from "@/types/canvas";
import { DemoScene, DemoSceneManifest } from "@/types/demo";
import { nanoid } from "nanoid";

export class DemoSceneService {
  private static STORAGE_KEY = "figma_demo_scenes";

  // Get all demo scenes from localStorage
  static getManifest(): DemoSceneManifest {
    if (typeof window === "undefined") {
      return { scenes: {}, sceneIds: [] };
    }

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        return { scenes: {}, sceneIds: [] };
      }
      return JSON.parse(stored);
    } catch (error) {
      console.error("🔴 [DEMO] Failed to load demo scenes:", error);
      return { scenes: {}, sceneIds: [] };
    }
  }

  // Save demo scenes to localStorage
  static saveManifest(manifest: DemoSceneManifest): void {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(manifest));
      console.log("💾 [DEMO] Saved demo scenes manifest");
    } catch (error) {
      console.error("🔴 [DEMO] Failed to save demo scenes:", error);
    }
  }

  // Get a specific demo scene by ID
  static getScene(sceneId: string): DemoScene | null {
    const manifest = this.getManifest();
    return manifest.scenes[sceneId] || null;
  }

  // Save current canvas state as a demo scene
  static saveCurrentScene(
    name: string,
    description: string,
    currentState: {
      objects: Record<string, CanvasObject>;
      objectIds: string[];
      pages: Record<string, any>;
      pageIds: string[];
      currentPageId: string | null;
    }
  ): string {
    const sceneId = nanoid();
    const scene: DemoScene = {
      id: sceneId,
      name,
      description,
      objects: currentState.objects,
      objectIds: currentState.objectIds,
      pages: currentState.pages,
      pageIds: currentState.pageIds,
      currentPageId: currentState.currentPageId,
      createdAt: Date.now(),
      tags: [],
    };

    const manifest = this.getManifest();
    manifest.scenes[sceneId] = scene;
    manifest.sceneIds.push(sceneId);

    this.saveManifest(manifest);
    console.log("✅ [DEMO] Saved scene:", { name, sceneId });

    return sceneId;
  }

  // Delete a demo scene
  static deleteScene(sceneId: string): void {
    const manifest = this.getManifest();
    delete manifest.scenes[sceneId];
    manifest.sceneIds = manifest.sceneIds.filter((id) => id !== sceneId);
    this.saveManifest(manifest);
    console.log("🗑️ [DEMO] Deleted scene:", sceneId);
  }

  // Create a simple demo scene with a rectangle and image fill
  static createSimpleImageRectangleScene(): DemoScene {
    const sceneId = nanoid();
    const pageId = nanoid();
    const rectangleId = nanoid();

    // Create a rectangle with an image fill
    const rectangle: CanvasObject = {
      id: rectangleId,
      type: "rectangle",
      name: "Image Rectangle",
      createdAt: Date.now(),
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      rotation: 0,
      autoLayoutSizing: {
        horizontal: "fixed",
        vertical: "fixed",
      },
      fills: [
        createImageFill(
          "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop",
          "crop",
          1,
          true
        ),
      ],
      strokes: [],
      parentId: undefined,
      childIds: [],
      zIndex: 1,
      visible: true,
      locked: false,
      properties: {
        type: "rectangle",
        borderRadius: 0,
      },
    };

    return {
      id: sceneId,
      name: "Simple Image Rectangle",
      description: "A basic rectangle with an image fill from Unsplash",
      objects: {
        [rectangleId]: rectangle,
      },
      objectIds: [rectangleId],
      pages: {
        [pageId]: {
          id: pageId,
          name: "Page 1",
          objectIds: [rectangleId],
        },
      },
      pageIds: [pageId],
      currentPageId: pageId,
      createdAt: Date.now(),
      tags: ["basic", "image", "rectangle"],
    };
  }

  // Initialize with default demo scenes if none exist
  static initializeDefaultScenes(): void {
    const manifest = this.getManifest();

    // Only initialize if no scenes exist
    if (manifest.sceneIds.length === 0) {
      const defaultScene = this.createSimpleImageRectangleScene();
      manifest.scenes[defaultScene.id] = defaultScene;
      manifest.sceneIds.push(defaultScene.id);
      this.saveManifest(manifest);
      console.log("🎬 [DEMO] Initialized default demo scenes");
    }
  }

  // Get URL for a demo scene
  static getSceneUrl(sceneId: string): string {
    return `/demo/${sceneId}`;
  }

  // Get URL for a demo scene by name (URL-friendly)
  static getSceneUrlByName(sceneName: string): string {
    return `/demo/${encodeURIComponent(
      sceneName.toLowerCase().replace(/\s+/g, "-")
    )}`;
  }

  // Create a shareable URL with embedded scene data
  static createShareableUrl(scene: DemoScene): string {
    try {
      // Create a minimal version of the scene for sharing
      const shareableScene = {
        name: scene.name,
        description: scene.description,
        objects: scene.objects,
        objectIds: scene.objectIds,
        pages: scene.pages,
        pageIds: scene.pageIds,
        currentPageId: scene.currentPageId,
        tags: scene.tags,
      };

      // Encode the scene data as base64
      const sceneData = JSON.stringify(shareableScene);
      const encoded = btoa(encodeURIComponent(sceneData));

      console.log("🔗 [DEMO] Created shareable URL with embedded data:", {
        sceneName: scene.name,
        dataSize: sceneData.length,
        encodedSize: encoded.length,
      });

      return `/demo?scene=${encoded}`;
    } catch (error) {
      console.error("🔴 [DEMO] Failed to create shareable URL:", error);
      // Fallback to regular URL
      return `/demo/${scene.id}`;
    }
  }

  // Decode scene data from URL parameter
  static decodeSceneFromUrl(encodedData: string): DemoScene | null {
    try {
      // Decode from base64
      const decodedData = decodeURIComponent(atob(encodedData));
      const sceneData = JSON.parse(decodedData);

      // Create a complete scene object with required fields
      const scene: DemoScene = {
        id: nanoid(), // Generate new ID for URL-shared scenes
        name: sceneData.name || "Shared Demo Scene",
        description: sceneData.description || "A shared demo scene",
        objects: sceneData.objects || {},
        objectIds: sceneData.objectIds || [],
        pages: sceneData.pages || {},
        pageIds: sceneData.pageIds || [],
        currentPageId: sceneData.currentPageId || null,
        createdAt: Date.now(),
        tags: sceneData.tags || ["shared"],
      };

      console.log("🔗 [DEMO] Decoded scene from URL:", {
        sceneName: scene.name,
        objectCount: Object.keys(scene.objects).length,
        pageCount: scene.pageIds.length,
      });

      return scene;
    } catch (error) {
      console.error("🔴 [DEMO] Failed to decode scene from URL:", error);
      return null;
    }
  }

  // Save current scene and return shareable URL
  static saveCurrentSceneAndGetShareableUrl(
    name: string,
    description: string,
    currentState: {
      objects: Record<string, any>;
      objectIds: string[];
      pages: Record<string, any>;
      pageIds: string[];
      currentPageId: string | null;
    }
  ): { sceneId: string; shareableUrl: string } {
    // Save to localStorage as before
    const sceneId = this.saveCurrentScene(name, description, currentState);

    // Create the scene object for shareable URL
    const scene: DemoScene = {
      id: sceneId,
      name,
      description,
      objects: currentState.objects,
      objectIds: currentState.objectIds,
      pages: currentState.pages,
      pageIds: currentState.pageIds,
      currentPageId: currentState.currentPageId,
      createdAt: Date.now(),
      tags: [],
    };

    // Generate shareable URL with embedded data
    const shareableUrl = this.createShareableUrl(scene);

    return { sceneId, shareableUrl };
  }
}

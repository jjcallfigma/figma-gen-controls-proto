export interface DemoScene {
  id: string;
  name: string;
  description: string;
  // Core canvas state that will be loaded
  objects: Record<string, any>; // CanvasObject from canvas.ts
  objectIds: string[];
  pages: Record<string, any>; // Page from store.ts
  pageIds: string[];
  currentPageId: string | null;
  // Optional metadata
  createdAt: number;
  tags?: string[];
  thumbnail?: string;
}

export interface DemoSceneManifest {
  scenes: Record<string, DemoScene>;
  sceneIds: string[];
}

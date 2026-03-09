import {
  boundsIntersect,
  clamp,
  distance,
  getBoundingRect,
  getVisibleWorldBounds,
  pointInBounds,
  screenBoundsToWorld,
  screenToWorld,
  worldBoundsToScreen,
  worldToScreen,
} from "../coordinates";

describe("Coordinate System Utilities", () => {
  const mockViewport = {
    zoom: 2,
    panX: 100,
    panY: 50,
    viewportBounds: { x: 0, y: 0, width: 800, height: 600 },
  };

  describe("worldToScreen", () => {
    it("should convert world coordinates to screen coordinates", () => {
      const worldPoint = { x: 10, y: 20 };
      const result = worldToScreen(worldPoint, mockViewport);

      expect(result).toEqual({
        x: 10 * 2 + 100, // x * zoom + panX
        y: 20 * 2 + 50, // y * zoom + panY
      });
    });

    it("should handle zero coordinates", () => {
      const worldPoint = { x: 0, y: 0 };
      const result = worldToScreen(worldPoint, mockViewport);

      expect(result).toEqual({
        x: 100, // panX
        y: 50, // panY
      });
    });
  });

  describe("screenToWorld", () => {
    it("should convert screen coordinates to world coordinates", () => {
      const screenPoint = { x: 120, y: 90 };
      const result = screenToWorld(screenPoint, mockViewport);

      expect(result).toEqual({
        x: (120 - 100) / 2, // (x - panX) / zoom
        y: (90 - 50) / 2, // (y - panY) / zoom
      });
    });

    it("should be inverse of worldToScreen", () => {
      const worldPoint = { x: 25, y: 35 };
      const screenPoint = worldToScreen(worldPoint, mockViewport);
      const backToWorld = screenToWorld(screenPoint, mockViewport);

      expect(backToWorld.x).toBeCloseTo(worldPoint.x);
      expect(backToWorld.y).toBeCloseTo(worldPoint.y);
    });
  });

  describe("worldBoundsToScreen", () => {
    it("should convert world bounds to screen bounds", () => {
      const worldBounds = { x: 10, y: 20, width: 30, height: 40 };
      const result = worldBoundsToScreen(worldBounds, mockViewport);

      expect(result).toEqual({
        x: 10 * 2 + 100, // top-left world to screen
        y: 20 * 2 + 50,
        width: 30 * 2, // scaled by zoom
        height: 40 * 2,
      });
    });
  });

  describe("screenBoundsToWorld", () => {
    it("should convert screen bounds to world bounds", () => {
      const screenBounds = { x: 120, y: 90, width: 60, height: 80 };
      const result = screenBoundsToWorld(screenBounds, mockViewport);

      expect(result).toEqual({
        x: (120 - 100) / 2, // screen to world conversion
        y: (90 - 50) / 2,
        width: 60 / 2, // scaled by zoom
        height: 80 / 2,
      });
    });
  });

  describe("getVisibleWorldBounds", () => {
    it("should return the world bounds currently visible in viewport", () => {
      const result = getVisibleWorldBounds(mockViewport);

      expect(result).toEqual({
        x: (0 - 100) / 2, // left edge
        y: (0 - 50) / 2, // top edge
        width: 800 / 2, // viewport width in world space
        height: 600 / 2, // viewport height in world space
      });
    });
  });

  describe("pointInBounds", () => {
    const bounds = { x: 10, y: 20, width: 30, height: 40 };

    it("should return true for point inside bounds", () => {
      const point = { x: 25, y: 35 };
      expect(pointInBounds(point, bounds)).toBe(true);
    });

    it("should return true for point on bounds edge", () => {
      const point = { x: 10, y: 20 }; // top-left corner
      expect(pointInBounds(point, bounds)).toBe(true);
    });

    it("should return false for point outside bounds", () => {
      const point = { x: 5, y: 15 };
      expect(pointInBounds(point, bounds)).toBe(false);
    });

    it("should return false for point beyond bounds", () => {
      const point = { x: 45, y: 65 }; // beyond bottom-right
      expect(pointInBounds(point, bounds)).toBe(false);
    });
  });

  describe("boundsIntersect", () => {
    const boundsA = { x: 10, y: 10, width: 20, height: 20 };

    it("should return true for overlapping bounds", () => {
      const boundsB = { x: 20, y: 20, width: 20, height: 20 };
      expect(boundsIntersect(boundsA, boundsB)).toBe(true);
    });

    it("should return false for non-overlapping bounds", () => {
      const boundsB = { x: 40, y: 40, width: 20, height: 20 };
      expect(boundsIntersect(boundsA, boundsB)).toBe(false);
    });

    it("should return false for adjacent bounds", () => {
      const boundsB = { x: 30, y: 10, width: 20, height: 20 };
      expect(boundsIntersect(boundsA, boundsB)).toBe(false);
    });

    it("should return true for contained bounds", () => {
      const boundsB = { x: 15, y: 15, width: 10, height: 10 };
      expect(boundsIntersect(boundsA, boundsB)).toBe(true);
    });
  });

  describe("getBoundingRect", () => {
    it("should return null for empty array", () => {
      expect(getBoundingRect([])).toBeNull();
    });

    it("should return the same bounds for single element", () => {
      const bounds = { x: 10, y: 20, width: 30, height: 40 };
      expect(getBoundingRect([bounds])).toEqual(bounds);
    });

    it("should return bounding rectangle for multiple bounds", () => {
      const bounds1 = { x: 10, y: 20, width: 30, height: 40 };
      const bounds2 = { x: 50, y: 10, width: 20, height: 30 };

      const result = getBoundingRect([bounds1, bounds2]);

      expect(result).toEqual({
        x: 10, // min x
        y: 10, // min y
        width: 60, // max x (70) - min x (10)
        height: 50, // max y (60) - min y (10)
      });
    });
  });

  describe("distance", () => {
    it("should calculate distance between two points", () => {
      const pointA = { x: 0, y: 0 };
      const pointB = { x: 3, y: 4 };

      expect(distance(pointA, pointB)).toBe(5); // 3-4-5 triangle
    });

    it("should return 0 for same point", () => {
      const point = { x: 10, y: 20 };
      expect(distance(point, point)).toBe(0);
    });
  });

  describe("clamp", () => {
    it("should return value if within range", () => {
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it("should return min if value is below range", () => {
      expect(clamp(-5, 0, 10)).toBe(0);
    });

    it("should return max if value is above range", () => {
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });
});

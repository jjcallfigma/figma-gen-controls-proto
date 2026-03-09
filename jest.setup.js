import "@testing-library/jest-dom";

// Mock nanoid
jest.mock("nanoid", () => ({
  nanoid: () => "test-id-" + Math.random().toString(36).substr(2, 9),
}));

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

// Mock canvas API for testing
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: () => ({
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    getImageData: jest.fn(() => ({ data: new Array(4) })),
    putImageData: jest.fn(),
    createImageData: jest.fn(() => ({ data: new Array(4) })),
    setTransform: jest.fn(),
    drawImage: jest.fn(),
    save: jest.fn(),
    fillText: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    closePath: jest.fn(),
    stroke: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    rotate: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    transform: jest.fn(),
    rect: jest.fn(),
    clip: jest.fn(),
  }),
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock pointer events
Object.defineProperty(window, "PointerEvent", {
  writable: true,
  value: class MockPointerEvent extends Event {
    constructor(type, props) {
      super(type, props);
      this.pointerId = props?.pointerId || 1;
      this.clientX = props?.clientX || 0;
      this.clientY = props?.clientY || 0;
      this.shiftKey = props?.shiftKey || false;
      this.altKey = props?.altKey || false;
      this.metaKey = props?.metaKey || false;
      this.ctrlKey = props?.ctrlKey || false;
    }
  },
});

// Custom matchers for canvas testing
expect.extend({
  toHaveCanvasObject(received, objectId) {
    const pass = received.objects && received.objects[objectId] !== undefined;
    if (pass) {
      return {
        message: () =>
          `expected canvas state not to have object with id ${objectId}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected canvas state to have object with id ${objectId}`,
        pass: false,
      };
    }
  },

  toBeAtPosition(received, x, y) {
    const pass = received.x === x && received.y === y;
    if (pass) {
      return {
        message: () => `expected object not to be at position (${x}, ${y})`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected object to be at position (${x}, ${y}) but was at (${received.x}, ${received.y})`,
        pass: false,
      };
    }
  },
});

import "@testing-library/jest-dom";

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R;
      toHaveClass(...classNames: string[]): R;
      toHaveStyle(css: Record<string, unknown>): R;
      toHaveCanvasObject(objectId: string): R;
      toBeAtPosition(x: number, y: number): R;
    }
  }
}

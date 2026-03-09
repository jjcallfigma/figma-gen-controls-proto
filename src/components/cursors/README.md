# Custom Cursor System

This system provides global cursor management that goes beyond CSS hover states, allowing for cursor changes based on application state, tools, and interactions.

## Features

- **Global State Management**: Cursors are managed through Zustand store
- **Interaction-based Cursors**: Cursors set during interactions, not hover states
- **Stack-based Cursors**: Push/pop cursor states for temporary changes
- **Custom Cursor Assets**: Uses Figma UI3 cursor assets from `/public/cursors/`
- **Type-safe**: Full TypeScript support with cursor type definitions
- **Tool Integration**: Automatic cursor changes based on active tool
- **Resize Integration**: Cursors enforced during resize operations
- **Default UI3 Cursor**: Uses cursor-black-ui3.svg as default cursor

## Usage

### Basic Cursor Management

```tsx
import { useCursor } from "@/hooks/useCursor";

function MyComponent() {
  const { setCursor, resetCursor } = useCursor();

  return (
    <div
      onMouseEnter={() => setCursor("pointer")}
      onMouseLeave={() => resetCursor()}
    >
      Hover me!
    </div>
  );
}
```

### Resize Handle Cursors

Resize cursors are automatically managed during interactions, not on hover. The cursor is set when a resize operation begins and reset when it completes. This enforces the cursor during the entire interaction.

```tsx
// Resize cursors are automatically handled by useCanvasResize hook
// No manual cursor management needed for resize handles

function ResizeHandle({ handle }: { handle: string }) {
  const { startResize } = useCanvasResize(/* ... */);

  return (
    <div
      onPointerDown={(e) => {
        // Cursor is automatically set during resize operation
        startResize(handle, worldPoint, bounds);
      }}
    >
      Resize Handle
    </div>
  );
}
```

### Temporary Cursor Changes

```tsx
import { useCursor } from "@/hooks/useCursor";

function MyComponent() {
  const { withTemporaryCursor } = useCursor();

  const handleOperation = withTemporaryCursor(
    "not-allowed",
    async () => {
      // Do some operation that might fail
      await someAsyncOperation();
    },
    "operation:validation"
  );

  return <button onClick={handleOperation}>Do Operation</button>;
}
```

### Tool-based Cursors

```tsx
import { useCursor } from "@/hooks/useCursor";

function ToolPanel() {
  const { setToolCursor } = useCursor();

  return (
    <div>
      <button onClick={() => setToolCursor("pen")}>Pen Tool</button>
      <button onClick={() => setToolCursor("frame")}>Frame Tool</button>
      <button onClick={() => setToolCursor("text")}>Text Tool</button>
    </div>
  );
}
```

## Available Cursor Types

### Standard Cursors

- `default`, `pointer`, `grab`, `grabbing`, `text`, `crosshair`, `not-allowed`

### Resize Cursors

- All resize directions use `cursor-resize-ui3.svg` (can be rotated as needed)
- `resize-n`, `resize-ne`, `resize-e`, `resize-se`, `resize-s`, `resize-sw`, `resize-w`, `resize-nw`
- `resize-scale` - for proportional scaling

### Tool Cursors

- `pen`, `pencil`, `frame`, `brush`, `dropper`, `hand`, `hand-press`
- `zoom-in`, `zoom-out`, `move`, `pan`

### Interaction Cursors

- `click`, `duplicate`, `snap`, `break`, `convert`, `invisible`

## Architecture

### CursorProvider

Wraps the entire app and manages global cursor CSS changes based on store state.

### Store Integration

Cursor state is managed in the global Zustand store:

- `cursor`: Current cursor state
- `cursorStack`: Stack for temporary cursors
- `setCursor()`: Set cursor with priority and source tracking
- `pushCursor()`: Push temporary cursor onto stack
- `popCursor()`: Pop cursor from stack
- `resetCursor()`: Reset to default

### Hooks

- `useCursor()`: General cursor management
- `useResizeCursor()`: Specialized for resize handles
- `useDragCursor()`: Specialized for drag operations

## Asset Management

Cursor assets are stored in `/public/cursors/` and automatically loaded based on cursor type. The system handles:

- Custom cursor URLs
- Hotspot positioning
- Fallback cursors for unsupported types

## Priority System

Cursors have priority levels to handle conflicts:

- Higher priority cursors override lower priority ones
- Stack-based cursors automatically manage priority
- Source tracking helps with debugging cursor state

## Debugging

In development mode, cursor changes are logged with:

- Cursor type
- Source (what triggered the change)
- Priority level
- Custom properties

This helps debug cursor state issues and understand interaction flows.

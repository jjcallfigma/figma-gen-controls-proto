# Figma Blend Mode Hierarchy Rendering

## Overview

Implemented Figma's blend mode hierarchy rules in the CSS rendering layer (`CanvasObject.tsx`) while preserving original data structure during import. This ensures objects render exactly like they do in Figma without modifying the imported data.

## Architecture Approach

### **Data Layer (Import)**

- Import blend modes exactly as they exist in Figma
- Node blend modes → stay on node object
- Fill blend modes → stay on fill objects
- No data transformation during import

### **Rendering Layer (CSS)**

- Blend mode hierarchy logic applied during rendering
- Single fill blend modes promoted to wrapper level for canvas blending
- Node blend modes take precedence when both exist
- Multiple fill blend modes remain on individual layers

## Figma's Blend Mode Rules (Applied in CSS)

1. **Node blend mode takes precedence** - If a node has a blend mode, it overrides fill blend mode promotion
2. **Single fill promotion** - If there's only one fill with a blend mode and no node blend mode, promote to wrapper level for canvas blending
3. **Multiple fills** - Keep blend modes on individual fill layers for inter-fill blending

## Implementation in CanvasObject.tsx

### Smart Blend Mode Variables

```typescript
// Check if we have a single fill with blend mode that should be promoted to wrapper
const fillsWithBlendModes =
  object.fills?.filter(
    (fill) => fill.visible && fill.blendMode && fill.blendMode !== "normal"
  ) || [];

const singleFillBlendMode =
  fillsWithBlendModes.length === 1 ? fillsWithBlendModes[0] : null;
```

### Wrapper Level Application

```typescript
const wrapperStyle: React.CSSProperties = {
  // Apply node-level blend mode (takes precedence)
  ...(object.blendMode &&
    object.blendMode !== "normal" && {
      mixBlendMode: object.blendMode as React.CSSProperties["mixBlendMode"],
    }),
  // If there's a single fill with blend mode and no node blend mode, promote it
  ...(!object.blendMode &&
    singleFillBlendMode && {
      mixBlendMode:
        singleFillBlendMode.blendMode as React.CSSProperties["mixBlendMode"],
    }),
};
```

### Fill Level Rendering

```typescript
{
  object.fills
    ?.filter((fill) => fill.visible)
    .map((fill, index) => (
      <div
        key={fill.id}
        style={{
          // Apply blend mode to individual fill layers
          // Skip if this fill's blend mode was promoted to wrapper level
          ...(fill.blendMode &&
            fill.blendMode !== "normal" &&
            fill !== singleFillBlendMode && {
              mixBlendMode:
                fill.blendMode as React.CSSProperties["mixBlendMode"],
            }),
        }}
      />
    ));
}
```

## Example Scenarios

### Scenario 1: Single Fill with Blend Mode

```typescript
// Data structure (unchanged):
{
  blendMode: undefined,
  fills: [{ blendMode: "multiply", visible: true }]
}

// CSS rendering:
// → Wrapper gets: mixBlendMode: "multiply" (promoted)
// → Fill gets: no mixBlendMode (skipped to avoid double application)
// → Result: Blends with canvas background ✅
```

### Scenario 2: Node + Fill Blend Modes

```typescript
// Data structure (unchanged):
{
  blendMode: "overlay",
  fills: [{ blendMode: "multiply", visible: true }]
}

// CSS rendering:
// → Wrapper gets: mixBlendMode: "overlay" (node wins)
// → Fill gets: mixBlendMode: "multiply" (applied to fill)
// → Result: Node blends with canvas, fill blends within node ✅
```

### Scenario 3: Multiple Fills with Blend Modes

```typescript
// Data structure (unchanged):
{
  blendMode: undefined,
  fills: [
    { blendMode: "multiply", visible: true },
    { blendMode: "screen", visible: true }
  ]
}

// CSS rendering:
// → Wrapper gets: no mixBlendMode (no promotion for multiple fills)
// → Fill 1 gets: mixBlendMode: "multiply"
// → Fill 2 gets: mixBlendMode: "screen"
// → Result: Fills blend with each other ✅
```

## Benefits

1. **Data Integrity** - Original Figma data structure preserved
2. **Perfect Figma Fidelity** - Renders exactly like Figma
3. **CSS-Only Logic** - No data manipulation during import
4. **Flexible Architecture** - Easy to modify rendering without affecting data
5. **Performance** - No additional processing during import

## Files Modified

- `figma-clone/src/components/canvas/CanvasObject.tsx`
  - Added smart blend mode promotion variables
  - Updated wrapper style to conditionally apply promoted blend modes
  - Modified fill rendering to skip promoted blend modes
  - Maintains original data structure integrity

## Testing

Verify with Figma files containing:

- Single fills with various blend modes
- Nodes with blend modes + fills with different blend modes
- Multiple fills with different blend modes
- Complex nested structures with mixed blend mode scenarios

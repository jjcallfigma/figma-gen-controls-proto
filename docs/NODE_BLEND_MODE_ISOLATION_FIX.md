# Node Blend Mode Isolation Fix

## Issue

Node-level blend modes were not working visually even though they were correctly applied to CSS `mix-blend-mode`. The blend modes appeared in DevTools but had no visual effect.

## Root Cause

The `isolation: isolate` CSS property was being applied when `overflow: hidden` was set, but it only checked for **fill-level blend modes** and ignored **node-level blend modes**.

When `isolation: isolate` is applied, it creates a new stacking context that prevents blend modes from blending with content outside that context (like the canvas background).

## The Problem

```typescript
// Before: Only checked fill blend modes
const hasBlendModes = object.fills?.some(
  (fill) => fill.visible && fill.blendMode && fill.blendMode !== "normal"
);

// CSS isolation logic
isolation: frameProps.overflow === "hidden" && !hasBlendModes
  ? "isolate"
  : "auto";
```

**Issue**: If a node had `blendMode: "multiply"` but no fill blend modes, `hasBlendModes` would be `false`, causing `isolation: isolate` to be applied, which prevented the node blend mode from working with the canvas.

## The Solution

Updated `hasBlendModes` to consider **both** fill-level and node-level blend modes:

```typescript
// After: Checks both fill and node blend modes
const hasBlendModes =
  object.fills?.some(
    (fill) => fill.visible && fill.blendMode && fill.blendMode !== "normal"
  ) ||
  (object.blendMode && object.blendMode !== "normal");
```

## How It Works

### **When Node Has Blend Mode:**

```typescript
// Node with multiply blend mode + overflow hidden
{
  blendMode: "multiply",
  properties: { overflow: "hidden" }
}

// Before fix:
hasBlendModes = false (only checked fills)
isolation = "isolate" (created stacking context)
// → Blend mode doesn't work with canvas

// After fix:
hasBlendModes = true (includes node blend mode)
isolation = "auto" (no stacking context)
// → Blend mode works with canvas ✅
```

### **When Fill Has Blend Mode:**

```typescript
// Fill with screen blend mode + overflow hidden
{
  blendMode: undefined,
  fills: [{ blendMode: "screen" }],
  properties: { overflow: "hidden" }
}

// Both before and after:
hasBlendModes = true (fill has blend mode)
isolation = "auto" (no stacking context)
// → Fill blend modes work correctly ✅
```

### **When No Blend Modes:**

```typescript
// Normal object with overflow hidden
{
  blendMode: undefined,
  fills: [{ blendMode: "normal" }],
  properties: { overflow: "hidden" }
}

// Both before and after:
hasBlendModes = false (no blend modes)
isolation = "isolate" (safe to create stacking context)
// → Normal rendering with proper clipping ✅
```

## Files Modified

- `figma-clone/src/components/canvas/CanvasObject.tsx`
  - Updated `hasBlendModes` calculation in all object types (frame, rectangle, text)
  - Now includes both fill-level and node-level blend modes
  - Prevents `isolation: isolate` when any blend mode is present

## Impact

- ✅ **Node blend modes now work** - blend properly with canvas background
- ✅ **Fill blend modes still work** - unchanged behavior
- ✅ **Normal overflow clipping preserved** - `isolation: isolate` still applied when no blend modes
- ✅ **All object types fixed** - frame, rectangle, and text objects

## Testing

Test with objects that have:

- Node-level blend modes with `overflow: hidden`
- Fill-level blend modes with `overflow: hidden`
- Mixed node + fill blend modes with `overflow: hidden`
- No blend modes with `overflow: hidden` (should still clip properly)

Verify that all blend modes now work visually and blend correctly with the canvas background.

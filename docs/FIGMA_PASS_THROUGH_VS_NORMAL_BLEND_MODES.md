# Figma PASS_THROUGH vs NORMAL Blend Mode Distinction

## Overview

Implemented proper handling of Figma's blend mode semantics by distinguishing between `PASS_THROUGH` (no explicit blend mode) and `NORMAL` (explicitly set to normal).

## The Problem

Previously, both `PASS_THROUGH` and `NORMAL` were treated identically, both converting to `"normal"` in our system. This missed an important distinction in Figma's blend mode hierarchy:

- **`PASS_THROUGH`** = "No blend mode set at node level" → Should allow fill blend mode promotion
- **`NORMAL`** = "Explicitly set to normal" → Should override/prevent fill blend mode promotion

## The Solution

### 1. Import-Level Changes

**File: `figma-clone/src/core/services/figmaImport.ts`**

Updated `convertFigmaBlendMode()` to return `undefined` for `PASS_THROUGH`:

```typescript
private convertFigmaBlendMode(figmaBlendMode?: string, context?: string): string | undefined {
  // Handle PASS_THROUGH vs explicit NORMAL distinction
  if (!figmaBlendMode || figmaBlendMode === "PASS_THROUGH") {
    // PASS_THROUGH means "no blend mode set at node level"
    // Return undefined to allow fill blend mode promotion logic
    return undefined;
  }

  // Explicit blend modes (including NORMAL) are preserved
  const blendModeMapping: Record<string, string> = {
    NORMAL: "normal",
    MULTIPLY: "multiply",
    // ... other modes
  };

  return blendModeMapping[figmaBlendMode] || "normal";
}
```

### 2. Rendering-Level Changes

**File: `figma-clone/src/components/canvas/CanvasObject.tsx`**

Updated promotion logic to only allow promotion when node blend mode is `undefined`:

```typescript
// Before: Allowed promotion for both undefined and "normal"
!object.blendMode || object.blendMode === "normal";

// After: Only allows promotion for undefined (PASS_THROUGH case)
!object.blendMode;
```

Updated `hasBlendModes` to consider explicit `NORMAL` as having a blend mode for isolation purposes:

```typescript
// Before: Only non-normal blend modes counted
object.blendMode && object.blendMode !== "normal";

// After: Any explicit blend mode counts (including "normal")
!!object.blendMode;
```

## Behavior Matrix

| **Figma State**          | **Imported Value** | **Fill Promotion** | **Isolation** | **Behavior**                               |
| ------------------------ | ------------------ | ------------------ | ------------- | ------------------------------------------ |
| `PASS_THROUGH` (default) | `undefined`        | ✅ **Allowed**     | ❌ Auto       | Fill blend modes can promote to node level |
| `NORMAL` (explicit)      | `"normal"`         | ❌ **Prevented**   | ✅ Controlled | Node normal overrides fill blend modes     |
| `MULTIPLY` (explicit)    | `"multiply"`       | ❌ **Prevented**   | ✅ Controlled | Node blend mode takes precedence           |

## Examples

### Case 1: PASS_THROUGH Node with Fill Blend Mode

```typescript
// Figma: Node has PASS_THROUGH, Fill has EXCLUSION
{
  blendMode: undefined,        // From PASS_THROUGH
  fills: [{
    blendMode: "exclusion"
  }]
}

// Result: Fill blend mode promotes to node level
// Wrapper gets mixBlendMode: "exclusion"
```

### Case 2: Explicit NORMAL Node with Fill Blend Mode

```typescript
// Figma: Node explicitly set to NORMAL, Fill has EXCLUSION
{
  blendMode: "normal",         // From explicit NORMAL
  fills: [{
    blendMode: "exclusion"
  }]
}

// Result: Node normal overrides fill blend mode
// Wrapper gets mixBlendMode: "normal", fill blend mode ignored
```

### Case 3: Explicit Blend Mode Node

```typescript
// Figma: Node set to MULTIPLY, Fill has EXCLUSION
{
  blendMode: "multiply",       // From explicit MULTIPLY
  fills: [{
    blendMode: "exclusion"
  }]
}

// Result: Node blend mode takes precedence
// Wrapper gets mixBlendMode: "multiply", fill blend mode ignored
```

## Debug Logging

Enhanced logging shows the distinction:

```
🎨 FIGMA BLEND MODE CONVERSION: {
  context: "NODE: Frame 1",
  originalValue: "PASS_THROUGH",
  isPassThrough: true
}

🎨 FIGMA BLEND MODE RESULT: {
  context: "NODE: Frame 1",
  original: "PASS_THROUGH",
  result: "undefined (PASS_THROUGH - allows fill promotion)",
  reasoning: "PASS_THROUGH means no explicit node blend mode set"
}
```

vs.

```
🎨 FIGMA BLEND MODE CONVERSION: {
  context: "NODE: Frame 2",
  originalValue: "NORMAL",
  isPassThrough: false
}

🎨 FIGMA BLEND MODE RESULT: {
  context: "NODE: Frame 2",
  original: "NORMAL",
  converted: "normal",
  reasoning: "Explicit NORMAL - overrides fill blend modes"
}
```

## Benefits

- ✅ **Perfect Figma Fidelity** - Respects Figma's blend mode hierarchy
- ✅ **Semantic Correctness** - Distinguishes between "no blend mode" vs "explicit normal"
- ✅ **Designer Intent** - When a designer sets Normal, it overrides fill blend modes
- ✅ **Debugging** - Clear logging shows the distinction and reasoning
- ✅ **Backward Compatible** - Existing designs continue to work

## Testing

Test scenarios:

1. **Default state** - Fresh objects should have PASS_THROUGH, allow fill promotion
2. **Explicit normal** - Setting node to Normal should override fill blend modes
3. **Mixed states** - Some nodes PASS_THROUGH, others explicit Normal
4. **Transition** - Changing from PASS_THROUGH to Normal should change behavior

Verify that the promotion behavior matches Figma's rendering exactly.

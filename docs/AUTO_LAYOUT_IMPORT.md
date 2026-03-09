# Auto Layout Import from Figma API

This document describes the Auto Layout import functionality that has been added to the Figma clone.

## Overview

The Figma import service now supports importing Auto Layout information from Figma's REST API. This includes both frame-level Auto Layout properties and child-level Auto Layout sizing properties.

## Supported Figma Auto Layout Properties

### Frame-Level Properties (Auto Layout Containers)

| Figma Property                 | Our Property                      | Description                                                                         |
| ------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------- |
| `layoutMode`                   | `mode`                            | "HORIZONTAL", "VERTICAL", "GRID" → "horizontal", "vertical", "grid"                 |
| `primaryAxisSizingMode`        | `frameSizing.horizontal/vertical` | "FIXED", "AUTO" → "fixed", "hug"                                                    |
| `counterAxisSizingMode`        | `frameSizing.horizontal/vertical` | "FIXED", "AUTO" → "fixed", "hug"                                                    |
| `primaryAxisAlignItems`        | `justifyContent`                  | "MIN", "CENTER", "MAX", "SPACE_BETWEEN" → "start", "center", "end", "space-between" |
| `counterAxisAlignItems`        | `alignItems`                      | "MIN", "CENTER", "MAX", "STRETCH" → "start", "center", "end", "stretch"             |
| `itemSpacing`                  | `gap`                             | Spacing between items in pixels                                                     |
| `counterAxisSpacing`           | `counterAxisSpacing`              | Spacing on counter axis for wrapped layouts                                         |
| `layoutWrap`                   | `wrap`                            | "WRAP", "NO_WRAP" → true, false                                                     |
| `paddingTop/Right/Bottom/Left` | `padding.{top/right/bottom/left}` | Padding values in pixels                                                            |

### Child-Level Properties (Items in Auto Layout)

| Figma Property           | Our Property                  | Description                                      |
| ------------------------ | ----------------------------- | ------------------------------------------------ |
| `layoutAlign`            | `autoLayoutSizing`            | Child alignment within Auto Layout parent        |
| `layoutGrow`             | `autoLayoutSizing`            | Whether child should grow to fill space (0 or 1) |
| `layoutSizingHorizontal` | `autoLayoutSizing.horizontal` | "FIXED", "HUG", "FILL" → "fixed", "hug", "fill"  |
| `layoutSizingVertical`   | `autoLayoutSizing.vertical`   | "FIXED", "HUG", "FILL" → "fixed", "hug", "fill"  |

## Implementation Details

### Helper Functions

1. **`convertFigmaAutoLayoutToCanvas(node)`**: Converts frame-level Auto Layout properties
2. **`convertChildAutoLayoutProperties(node)`**: Converts child-level Auto Layout sizing properties

### Type Extensions

The canvas types have been extended to support:

- `AutoLayoutProperties.counterAxisSpacing` - for wrapped layouts
- `AutoLayoutProperties.wrap` - whether items can wrap
- Enhanced comments for better understanding

### Usage

Auto Layout properties are automatically imported when importing from Figma URLs. The properties are stored in:

- **Frame objects**: `properties.autoLayout` contains the Auto Layout configuration
- **All objects**: `autoLayoutSizing` contains child-specific Auto Layout behavior

## Example Imported Structure

```typescript
// Frame with Auto Layout
{
  type: "frame",
  properties: {
    type: "frame",
    autoLayout: {
      mode: "horizontal",
      gap: 12,
      counterAxisSpacing: 8,
      wrap: false,
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
      alignItems: "center",
      justifyContent: "space-between",
      frameSizing: { horizontal: "hug", vertical: "fixed" }
    }
  }
}

// Child in Auto Layout
{
  type: "rectangle",
  autoLayoutSizing: {
    horizontal: "fill",
    vertical: "fixed"
  }
}
```

## Testing

To test Auto Layout import:

1. Create a Figma file with Auto Layout frames
2. Include various Auto Layout configurations (horizontal, vertical, wrapping, different alignments)
3. Import using the Figma URL with token
4. Check browser console for "🏗️ CONVERTING AUTO LAYOUT:" logs
5. Verify imported objects have correct `autoLayout` and `autoLayoutSizing` properties

## Console Debugging

The import process logs detailed information:

- "🏗️ AUTO LAYOUT IMPORT: Enhanced to import Auto Layout properties from Figma API"
- "🏗️ CONVERTING AUTO LAYOUT:" with all detected properties
- "✅ CONVERTED AUTO LAYOUT PROPERTIES:" with final converted values
- "👶 CONVERTING CHILD AUTO LAYOUT PROPERTIES:" for child sizing

## Grid Layout Note

Grid layout support is included in the type system but implementation is marked as "skip for now" per the requirements. The foundation is in place for future Grid Auto Layout support.

# Multiple Fills System

This document describes the new multiple fills system that allows objects to have multiple background layers with different types.

## Overview

The fills system allows Frames, Rectangles, and Ellipses to have multiple background fills that can be:

- **Solid colors** with opacity ✅
- **Image fills** with various fit modes ✅
- **Linear gradients** (planned)
- **Radial gradients** (planned)

**Multi-Layer Rendering:** All fills are properly layered with CSS multi-background support. Later fills appear on top, and opacity reveals the layers below. ✅

Each fill can be independently:

- Shown/hidden ✅
- Adjusted for opacity ✅
- Reordered (planned)
- Configured with type-specific properties ✅

## Integration

The fill system is now fully integrated into the main Properties Panel on the right side of the interface. When you select any fillable object (rectangle, ellipse, or frame), a "Fills" section appears in the properties panel.

**All new objects automatically get appropriate default fills:**

- **Frames**: White solid fill for clean backgrounds
- **Rectangles**: Blue solid fill for visibility
- **Ellipses**: Orange solid fill for distinction
- **Creation tools**: Live preview shows selection box style with resize handles during creation

## Usage

### In the Interface

1. **Select any rectangle, ellipse, or frame**
2. **Look for the "Fills" section** in the Properties Panel (right sidebar)
3. **Choose fill type:**
   - **Click "+ Color"** to add a solid color fill
   - **Click "+ Image"** to upload and add an image fill
4. **Customize fills:**
   - **Color fills**: Use color picker and opacity slider
   - **Image fills**: Choose fit mode (Fill, Fit, Crop, Tile), adjust scale and position
5. **Control visibility** with the eye icon
6. **Remove fills** with the × button
7. **Layer multiple fills**: Add multiple fills to create complex backgrounds - later fills appear on top
8. **Use opacity**: Reduce opacity on top fills to reveal the layers below

### Fill Layering System

- **First fill = Bottom layer** (appears behind all others)
- **Last fill = Top layer** (appears in front of all others)
- **Opacity controls transparency** - reduce to reveal layers below
- **Visual indicators** show "Top" and "Bottom" fills in the UI
- **CSS multi-background** provides smooth, hardware-accelerated rendering

### Image Fill Modes

- **Fill**: Image covers the entire object (may crop)
- **Fit**: Image fits within object bounds (may show empty space)
- **Crop**: Image at custom scale (use scale slider)
- **Tile**: Image repeats in a pattern (use scale slider)

### For Multi-Selection

- When multiple objects are selected, changes apply to all selected fillable objects
- A note at the bottom indicates how many objects are being edited

### Multi-Selection & Mixed States

**Simplified Mixed State Handling:**

- **Clean detection** - Automatically detects when selected objects have different fills
- **Simple message** - Shows "Mixed states" message instead of complex per-property indicators
- **Clear guidance** - Suggests selecting similar objects to edit properties
- **Bulk operations** - Add/remove fills still work across all selected objects

**When Mixed States Occur:**

- **Different fill counts** - Some objects have more fills than others
- **Different fill types** - Mix of solid colors, images, etc.
- **Different properties** - Same fill types but different colors, opacity, etc.

**User Experience:**

- **Clean interface** - No disabled controls or yellow warnings
- **Clear message** - Simple "Mixed states" notification with helpful icon
- **Actionable guidance** - Clear instruction to select similar objects
- **Bulk operations still work** - Can still add fills to all objects

**Smart Behavior:**

- **Add fills** - Adds same fill to all selected objects
- **Remove fills** - Removes matching fill from all objects
- **Toggle visibility** - Smart toggle based on current state across objects
- **Index-based updates** - Changes apply to fills at same position across all objects

### Basic API

```typescript
import {
  createSolidFill,
  createImageFill,
  addFill,
  removeFill,
} from "@/core/utils/fills";

// Create a new solid fill
const blueFill = createSolidFill("#3b82f6", 1.0, true);

// Create a new image fill
const imageFill = createImageFill("path/to/image.jpg", "fill", 1.0, true);

// Add fill to an object
const updatedObject = addFill(object, fill);

// Remove a fill
const objectWithoutFill = removeFill(object, fillId);

// Get effective background for rendering
const backgroundColor = getEffectiveBackground(object);

// Get detailed background styles (for images)
const backgroundStyles = getEffectiveBackgroundStyles(object);
```

### Type Definitions

```typescript
interface SolidFill {
  id: string;
  type: "solid";
  color: string;
  opacity: number; // 0-1
  visible: boolean;
  blendMode?: string;
}

interface ImageFill {
  id: string;
  type: "image";
  imageUrl: string;
  fit: "fill" | "fit" | "crop" | "tile";
  offsetX?: number; // 0-1, for positioning
  offsetY?: number; // 0-1, for positioning
  scale?: number; // for scaling, defaults to 1
  rotation?: number; // degrees (planned)
  opacity: number; // 0-1
  visible: boolean;
  blendMode?: string;
}

interface CanvasObject {
  // ... other properties
  fills?: Fill[]; // Ordered array, first = bottom layer, last = top layer
  fill?: string; // Legacy property for backward compatibility
}
```

## Implementation Status

### ✅ Completed

- Basic fill type definitions
- **Solid fill support** with color and opacity controls
- **Image fill support** with upload, fit modes, scale, and positioning
- Factory functions for creating fills
- Utility functions for manipulating fills
- **Enhanced CSS generation** for both solid and image fills
- **Full canvas rendering** support for both fill types
- Integration with CanvasObject rendering
- Backward compatibility with legacy `fill` property
- **Full integration with Properties Panel**
- **Multi-object editing support**
- **Professional UI** with type-specific controls
- **Multi-layer fill rendering** with proper CSS multi-background support ✅
- **Layer order indicators** in UI (Top/Bottom labels) ✅
- **Opacity-based transparency** revealing layers below ✅
- **Default fills for new objects** - All new shapes get proper fills ✅
- **Multi-selection with mixed state detection** - Clean, simple mixed state handling ✅
- **Simplified mixed state UI** - Clear "Mixed states" message instead of complex indicators ✅
- **Smart bulk operations** - Add/remove fills work across all selected objects ✅

### 🚧 Planned Features

- Linear and radial gradients
- ~~Multiple fills layering~~ ✅ **COMPLETED**
- Blend modes for advanced compositing
- Fill reordering with drag & drop
- **Image rotation controls**
- **Image positioning controls** (pan/zoom interface)
- Gradient editor UI
- **Image management** (delete uploaded images)
- Fill presets and libraries

## User Experience

### Image Fill Workflow

1. **Upload**: Click "+ Image" button to browse and select image files
2. **Preview**: See image thumbnail in the properties panel
3. **Configure**: Choose fit mode from dropdown (Fill, Fit, Crop, Tile)
4. **Scale**: Adjust image size with scale slider (for Crop and Tile modes)
5. **Opacity**: Control transparency with opacity slider
6. **Visibility**: Toggle on/off with eye icon

### Enhanced Controls

- **Image Preview**: Small thumbnail shows the selected image
- **Fit Mode Selector**: Dropdown with clear labels for different image behaviors
- **Conditional Controls**: Scale slider only appears for Crop and Tile modes
- **File Upload**: Hidden file input triggered by button click
- **Immediate Feedback**: Changes apply instantly to selected objects
- **Layer Indicators**: Visual "Top" and "Bottom" labels show fill order
- **Multi-Layer Support**: Add multiple fills for complex layered effects
- **Opacity Visualization**: Real-time preview of transparency effects

### Multi-Layer Workflow

1. **Start with base layer**: Add an image or color as the foundation
2. **Add layers on top**: Click "+ Color" or "+ Image" to add more fills
3. **Adjust transparency**: Use opacity sliders to reveal layers below
4. **Mix types freely**: Combine images and colors in any order
5. **Visual feedback**: "Top" and "Bottom" labels show layer hierarchy
6. **Real-time preview**: See layering effects immediately on canvas

### Example Use Cases

- **Textured backgrounds**: Image base + colored overlay for mood
- **Color tinting**: Image + semi-transparent color on top
- **Complex patterns**: Multiple images at different opacities
- **Brand overlays**: Logo image + brand color background

### Multi-Selection Examples

- **Bulk styling**: Select 5 cards → change all to same background image
- **Consistent branding**: Select logos → add same brand color overlay
- **Mixed state awareness**: Select cards with different fills → see clean "Mixed states" message
- **Bulk operations**: Add fills to all objects, remove fills from all objects
- **Simple workflow**: Clear message guides you to select similar objects for detailed editing

## Components

### `FillPropertiesPanel`

- Enhanced to support both solid and image fills
- **Image upload functionality** with file input
- **Type-specific controls** that show/hide based on fill type
- **Professional UI** with consistent spacing and typography

### Image Fill CSS Generation

- `fillToCssProperties()` returns detailed CSS properties for images
- `getEffectiveBackgroundStyles()` applies complex background styles to DOM elements
- **Proper CSS mapping** for all image fit modes

## Technical Details

### Image Handling

- Uses `URL.createObjectURL()` for client-side image handling
- **Immediate preview** without server upload
- **Memory management**: Objects URLs are created for each uploaded image

### Multi-Selection Logic

- **Index-based updates** - Changes apply to fills at the same position in all objects
- **Consistent behavior** - First fill in UI corresponds to first fill in all selected objects
- **Handle different counts** - Shows fills from object with most fills, safe updates for shorter arrays

### CSS Background Properties

- **backgroundImage**: URL reference to the image
- **backgroundSize**: Maps to fit modes (cover, contain, percentage)
- **backgroundRepeat**: Controlled by fit mode (no-repeat, repeat)
- **backgroundPosition**: Used for image positioning (planned enhancement)

### Multi-Layer CSS Implementation

- **CSS Multi-Background**: Uses comma-separated values for `background-image`, `background-size`, etc.
- **Layer Order**: CSS first value = top layer, so fills array is reversed before CSS generation
- **Solid Colors**: Rendered as `linear-gradient(color, color)` for multi-background compatibility
- **Mixed Types**: Seamlessly combines solid colors and images in same multi-background declaration
- **Opacity Handling**: Built into individual color values and image rendering
- **Performance**: Hardware-accelerated CSS backgrounds for smooth rendering

## Migration

The system maintains backward compatibility:

- Objects with legacy `fill` or `backgroundColor` properties continue to work
- Enhanced `getEffectiveBackgroundStyles()` handles both new and legacy fills
- No existing objects need to be migrated immediately
- Legacy fill inputs removed from type-specific panels to avoid confusion

## Future Enhancements

1. **Gradient Support**: Add UI for creating and editing linear/radial gradients
2. **Advanced Image Controls**: Pan/zoom interface for precise positioning
3. **Image Management**: Delete/replace uploaded images
4. **Multiple Fill Layering**: Proper CSS multi-background support for layering multiple fills
5. **Blend Modes**: Support for different blend modes between fills
6. **Animation**: Animate fill properties for dynamic effects
7. **Templates**: Pre-made fill combinations and styles
8. **Drag & Drop Reordering**: Allow users to reorder fills by dragging
9. **Fill Libraries**: Save and reuse common fill combinations
10. **Image Rotation**: UI controls for rotating background images

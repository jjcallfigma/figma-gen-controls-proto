# Image Fill Adjustments

This document describes the new image adjustment capabilities that have been added to the Figma clone, similar to Figma's image adjustment features.

## Overview

The image adjustment system allows users to modify the visual properties of image fills with controls for:

- **Exposure** - Brightens or darkens the image (simulates camera exposure)
- **Contrast** - Adjusts the difference between light and dark areas
- **Saturation** - Controls color intensity and vibrancy
- **Temperature** - Shifts colors along the cool (blue) to warm (red/yellow) spectrum
- **Tint** - Adjusts the green-magenta color balance
- **Highlights** - Controls the brightest areas of the image
- **Shadows** - Controls the darkest areas of the image

## ✨ Advanced Processing Upgrade

### Smart Hybrid System

The system now uses a **smart hybrid approach** for optimal performance and quality:

- **CSS Filters** for basic adjustments (real-time, hardware accelerated)
- **WebGL Shaders** for advanced tone mapping (highlights/shadows, precise temperature/tint)
- **Canvas Processing** as fallback for browsers without WebGL support

### Fully Working Adjustments

- ✅ **Exposure** → CSS `brightness()` filter (real-time)
- ✅ **Contrast** → CSS `contrast()` filter (real-time)
- ✅ **Saturation** → CSS `saturate()` filter (real-time)
- ✅ **Temperature** → CSS `hue-rotate()` + WebGL tone mapping (precise)
- ✅ **Tint** → CSS `hue-rotate()` + WebGL tone mapping (precise)
- ✅ **Highlights** → WebGL tone mapping with Canvas fallback (pixel-perfect)
- ✅ **Shadows** → WebGL tone mapping with Canvas fallback (pixel-perfect)

### Processing Pipeline

1. **Basic adjustments** (exposure, contrast, saturation) → Immediate CSS filters
2. **Advanced adjustments** (highlights, shadows, strong temp/tint) → WebGL/Canvas processing
3. **Fallback chain**: WebGL → Canvas → CSS approximations

## Implementation Architecture

### 1. Type System Extension

**File: `src/types/canvas.ts`**

```typescript
export interface ImageAdjustments {
  exposure?: number; // -100 to 100, default 0
  contrast?: number; // -100 to 100, default 0
  saturation?: number; // -100 to 100, default 0
  temperature?: number; // -100 to 100, default 0
  tint?: number; // -100 to 100, default 0
  highlights?: number; // -100 to 100, default 0
  shadows?: number; // -100 to 100, default 0
}

export interface ImageFill extends BaseFill {
  // ... existing properties
  adjustments?: ImageAdjustments;
}
```

### 2. CSS Filter Generation

**File: `src/core/utils/fills.ts`**

The system uses CSS filters for real-time adjustments:

- **Exposure** → `brightness()` CSS filter
- **Contrast** → `contrast()` CSS filter
- **Saturation** → `saturate()` CSS filter
- **Temperature** → `hue-rotate()` CSS filter (approximate)
- **Tint** → Additional `hue-rotate()` with offset (approximate)

**Note:** Highlights and shadows require more advanced processing and are reserved for future library integration.

### 3. User Interface

**File: `src/components/FillPropertiesPanel.tsx`**

Image adjustments are accessible through the existing fill properties panel:

1. Select an object with an image fill
2. Click on the fill preview to open the properties flyout
3. Navigate to the "Image" tab
4. Scroll down to see the "Adjustments" section with sliders for each property

### 4. Event Sourcing Integration

All image adjustments are fully integrated with the event sourcing system:

- Changes are dispatched as `object.updated` events
- Full undo/redo support is available
- Previous values are stored for proper rollback

## Technical Details

### CSS Filter Mapping

```typescript
// Exposure: -100 to 100 → brightness(0 to 2)
const brightness = Math.max(0, 1 + exposure / 100);

// Contrast: -100 to 100 → contrast(0 to 2)
const contrast = Math.max(0, 1 + contrast / 100);

// Saturation: -100 to 100 → saturate(0 to 2)
const saturation = Math.max(0, 1 + saturation / 100);

// Temperature: -100 to 100 → hue-rotate(-60deg to 60deg)
const hueShift = temperature * 0.6;

// Tint: -100 to 100 → hue-rotate with 90° offset
const tintShift = tint * 0.3 + 90;
```

### Performance Considerations

- **Real-time Preview**: CSS filters provide immediate visual feedback
- **Hardware Acceleration**: CSS filters are GPU-accelerated
- **Fallback Support**: 96%+ browser support for CSS filters
- **Memory Efficient**: No image data copying or canvas manipulation

### Browser Support

CSS filters are supported in:

- ✅ Chrome 18+
- ✅ Firefox 35+
- ✅ Safari 6+
- ✅ Edge 12+
- ❌ Internet Explorer (not supported)

## Usage Examples

### Programmatic Usage

```typescript
import { createImageFill } from "@/core/utils/fills";

// Create image fill with adjustments
const imageFill = createImageFill("path/to/image.jpg");
imageFill.adjustments = {
  exposure: 20,
  contrast: 15,
  saturation: -10,
  temperature: 5,
  tint: 0,
  highlights: 0,
  shadows: 0,
};

// Apply to object
const updatedObject = addFill(object, imageFill);
```

### CSS Output Example

An image with adjustments will generate CSS like:

```css
.object {
  background-image: url("image.jpg");
  background-size: cover;
  filter: brightness(1.2) contrast(1.15) saturate(0.9) hue-rotate(3deg);
}
```

## Future Enhancements

### Advanced Processing Library Integration

The codebase is structured to easily integrate advanced image processing libraries:

**File: `src/core/utils/imageProcessing.ts`**

This module provides:

- Framework for advanced adjustment processing
- Fallback to CSS filters when advanced processing isn't available
- Future integration points for libraries like EditPix, p5.FIP, or custom shaders

### Planned Improvements

1. **Highlights/Shadows Processing**
   - Canvas-based or WebGL shader implementation
   - More accurate tone mapping
2. **Better Temperature/Tint**
   - Color temperature algorithms
   - Proper white balance adjustment
3. **Advanced Exposure**

   - Tone curve adjustments
   - HDR-style exposure blending

4. **Performance Optimizations**
   - WebGL/WebGPU shaders for complex adjustments
   - Background processing for non-real-time adjustments

## Testing

To test the image adjustment feature:

1. Create a rectangle, ellipse, or frame
2. Add an image fill to the object
3. Select the object and open the fill properties
4. Navigate to the "Image" tab in the flyout
5. Adjust the sliders to see real-time changes
6. Test undo/redo functionality
7. Test with multiple objects selected

## Limitations

### Current CSS Filter Limitations

- **Temperature/Tint**: Approximated with hue rotation, not true color temperature
- **Highlights/Shadows**: Not available with CSS filters alone
- **Non-linear Curves**: CSS filters are mostly linear transformations

### ✅ Resolved with Advanced Processing

- ~~Strong temperature/tint adjustments~~ → Now handled by WebGL/Canvas processing
- ~~Highlights/shadows don't affect rendering~~ → Now pixel-perfect with tone mapping
- ~~CSS filter limitations~~ → Smart hybrid system uses best method for each adjustment

## Migration Notes

### Backward Compatibility

- Existing image fills without `adjustments` continue to work normally
- Default values (all zeros) result in no visual changes
- No database migration required

### Performance Impact

- Minimal impact on objects without adjustments
- CSS filters are efficiently handled by the browser
- No additional network requests or image processing overhead

## 🚀 Advanced Processing Files

### WebGL Processor (`webglImageProcessor.ts`)

- **High-performance GPU shaders** for real-time tone mapping
- **Fragment shader** with accurate highlights/shadows algorithm
- **Temperature/tint** using proper color space transformations
- **97%+ browser support** with graceful degradation

### Canvas Processor (`canvasImageProcessor.ts`)

- **CPU-based pixel manipulation** as WebGL fallback
- **Pixel-level tone mapping** for precise highlights/shadows control
- **Cross-browser compatibility** for older browsers
- **Consistent results** across all devices

### Processing Hook (`useProcessedImageFill.ts`)

- **React hook** for managing processed image URLs
- **Automatic caching** and dependency tracking
- **Real-time updates** when adjustments change
- **Error handling** with fallback to original images

## Performance Benefits

- **Immediate feedback**: Basic adjustments use CSS filters for instant response
- **Background processing**: Advanced adjustments process asynchronously
- **Smart caching**: Processed images are cached for repeated use
- **Hardware acceleration**: WebGL leverages GPU for fast processing
- **Fallback reliability**: Multiple processing methods ensure compatibility

## Related Files

- `src/types/canvas.ts` - Type definitions
- `src/core/utils/fills.ts` - CSS generation and fill utilities
- `src/core/utils/imageProcessing.ts` - Advanced processing framework
- `src/core/utils/webglImageProcessor.ts` - **NEW**: WebGL tone mapping
- `src/core/utils/canvasImageProcessor.ts` - **NEW**: Canvas fallback processing
- `src/hooks/useProcessedImageFill.ts` - **NEW**: React processing hook
- `src/components/FillPropertiesPanel.tsx` - User interface
- `figma-clone/FILLS_SYSTEM.md` - General fills documentation

# Image Fills Endpoint Improvement

## Overview

Updated Figma import to use the [GET image fills endpoint](https://www.figma.com/developers/api#get-image-fills-endpoint) instead of the GET images endpoint for better image quality and accuracy.

## Benefits

### **Pure Image Data**

The image fills endpoint provides "pure" image URLs without any frame transformations, cropping, or scaling applied. This ensures:

- Original image quality is preserved
- No unwanted cropping from frame boundaries
- More accurate representation of the original image assets

### **Direct Image Reference Mapping**

- Maps directly from `imageRef` → `imageUrl`
- No intermediate mapping through node IDs required
- Simpler and more reliable data flow

## Implementation Details

### API Endpoint Change

**Before:**

```typescript
// GET /v1/images/{file_key}?ids={node_ids}
const response = await fetch(
  `https://api.figma.com/v1/images/${fileId}?ids=${nodeIds}&format=png&scale=2`,
  { headers: { "X-Figma-Token": token } }
);
```

**After:**

```typescript
// GET /v1/files/{file_key}/image-fills
const response = await fetch(
  `https://api.figma.com/v1/files/${fileId}/image-fills`,
  { headers: { "X-Figma-Token": token } }
);
```

### Data Structure Change

**Before:** Node ID → Image URL → Image Ref mapping

```typescript
// Complex mapping: nodeId -> imageUrl -> imageRef
Object.entries(data.images).forEach(([nodeId, url]) => {
  // Find imageRefs that belong to this nodeId...
});
```

**After:** Direct Image Ref → Image URL mapping

```typescript
// Direct mapping: imageRef -> imageUrl
Object.entries(data.meta.images).forEach(([imageRef, url]) => {
  if (imageRefToNodeMap.has(imageRef)) {
    imageFills.set(imageRef, url);
  }
});
```

### Fallback Strategy

The implementation maintains backward compatibility with a fallback to the old Images API:

1. **Primary:** Try image fills endpoint
2. **Fallback:** Use images endpoint if image fills fails
3. **Graceful:** Continue with placeholder if both fail

```typescript
if (response.ok) {
  // Use image fills data
} else {
  console.log("Falling back to Images API with node IDs...");
  // Fallback to old approach
}
```

## Enhanced Logging

New logging provides better visibility into the image fetching process:

```
✅ Mapped image fill: {
  imageRef: "abc123",
  url: "https://...",
  nodeId: "node456"
}
```

## Files Modified

- `figma-clone/src/core/services/figmaImport.ts`
  - Updated image fetching logic to use `/image-fills` endpoint
  - Added direct imageRef mapping
  - Enhanced error handling and fallback strategy
  - Improved logging for debugging

## Testing

Test with Figma files containing:

- Various image formats (PNG, JPG)
- Images with different scale modes (fill, fit, crop, tile)
- Images used as fills vs. images as nodes
- Complex nested structures with image fills

Verify that imported images maintain their original quality and are not cropped or transformed unexpectedly.

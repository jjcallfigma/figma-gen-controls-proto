# Figma Component and Instance Import

This document explains how Figma components and instances are imported into our Figma clone with automatic detachment.

## 🎯 Overview

When importing from Figma, components and instances are automatically **detached** during the import process. This means:

- **Components** (`COMPONENT` nodes) → Converted to regular **frames** with children
- **Instances** (`INSTANCE` nodes) → Converted to regular **frames** with children

This approach allows you to import Figma designs without worrying about component dependencies, while preserving all the visual content and hierarchy.

## 🔧 How It Works

### Component Import (`COMPONENT` nodes)

```typescript
case "COMPONENT":
  // Import component as a regular frame (detached from component system)
  canvasObject = {
    type: "frame", // Converted to frame
    name: node.name || "Component (detached)",
    // ... all visual properties preserved
    properties: {
      type: "frame",
      // Metadata about original component status
      originalFigmaType: "COMPONENT",
      detachedComponent: true,
    },
  };
```

**What happens:**

1. Figma `COMPONENT` node detected
2. Converted to a `frame` object in our canvas
3. All visual properties preserved (fills, strokes, borders, auto layout, etc.)
4. All children imported recursively
5. Metadata added to track original component status

### Instance Import (`INSTANCE` nodes)

```typescript
case "INSTANCE":
  // Import instance as a regular frame (detached from component system)
  canvasObject = {
    type: "frame", // Converted to frame
    name: node.name || "Instance (detached)",
    // ... all visual properties preserved
    properties: {
      type: "frame",
      // Metadata about original instance status
      originalFigmaType: "INSTANCE",
      detachedInstance: true,
      originalComponentId: node.componentId, // Reference to original
    },
  };
```

**What happens:**

1. Figma `INSTANCE` node detected
2. Converted to a `frame` object in our canvas
3. All visual properties preserved (with any instance overrides applied)
4. All children imported recursively
5. Metadata added to track original instance status and component reference

## 📋 Preserved Properties

During detachment, these properties are fully preserved:

- **Visual Properties**: fills, strokes, opacity, blend mode
- **Layout Properties**: position, size, rotation, border radius
- **Auto Layout**: direction, gap, padding, alignment (if applicable)
- **Hierarchy**: all child objects and their relationships
- **Styling**: borders, shadows, effects

## 🏷️ Metadata Tracking

Imported components and instances include metadata for future reference:

```typescript
interface FrameProperties {
  // Figma import metadata
  originalFigmaType?: "COMPONENT" | "INSTANCE";
  detachedComponent?: boolean;
  detachedInstance?: boolean;
  originalComponentId?: string; // For instances
}
```

## 🎨 Visual Indicators

In the imported canvas:

- Detached components appear as regular frames with "(detached)" in the name
- Detached instances appear as regular frames with "(detached)" in the name
- No special visual indicators (they're treated as normal frames)

## 🚀 Benefits

1. **No Dependencies**: Import any Figma file without needing the original components
2. **Full Editability**: All imported content is fully editable
3. **Preserved Hierarchy**: Complex nested structures remain intact
4. **Auto Layout Support**: Auto layout containers work correctly
5. **Visual Fidelity**: 100% visual appearance preserved

## 🔄 Example Import Flow

```
Figma File Structure:
├── Button (COMPONENT)
│   ├── Background (RECTANGLE)
│   └── Label (TEXT)
├── Card (FRAME)
│   ├── Button Instance (INSTANCE → references Button component)
│   └── Title (TEXT)

After Import:
├── Button (detached) (FRAME)
│   ├── Background (RECTANGLE)
│   └── Label (TEXT)
├── Card (FRAME)
│   ├── Button (detached) (FRAME)  ← Instance became frame
│   │   ├── Background (RECTANGLE)
│   │   └── Label (TEXT)
│   └── Title (TEXT)
```

## 🛠️ Technical Implementation

The import is handled in `figmaImport.ts` in the main `convertNode` function:

1. **Detection**: Check `node.type === "COMPONENT"` or `node.type === "INSTANCE"`
2. **Conversion**: Create a frame object with all visual properties
3. **Metadata**: Add tracking information to properties
4. **Recursion**: Process all children normally
5. **Logging**: Comprehensive logging for debugging

## 🔍 Debugging

Import logging includes component/instance information:

```javascript
console.log("🧩 Found COMPONENT in FigmaImportService (detaching):", node.name);
console.log("📋 Found INSTANCE in FigmaImportService (detaching):", node.name);
```

This makes it easy to track which components and instances were processed during import.

## 🎯 Future Enhancements

Potential future improvements:

1. **Optional Attachment**: Allow choice between detached vs. linked import
2. **Component Library**: Build component library from imported components
3. **Re-attachment**: Convert detached components back to linked components
4. **Override Preservation**: Better handling of instance overrides during import
5. **Variant Support**: Handle component variants during import

## 🧪 Testing

To test component/instance import:

1. Create a Figma file with components and instances
2. Use the import URL with your file: `?figma-token=YOUR_TOKEN&figma-file=YOUR_FILE_ID`
3. Check the console for component/instance detection logs
4. Verify that imported objects are regular frames with correct metadata
5. Ensure all visual properties and hierarchy are preserved

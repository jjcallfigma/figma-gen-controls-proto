// Core coordinate system types
export interface Point {
  x: number;
  y: number;
}

// Border radius types
export type BorderRadius =
  | number
  | {
      topLeft: number;
      topRight: number;
      bottomRight: number;
      bottomLeft: number;
    };

export interface WorldBounds extends Bounds {
  // Same as Bounds but semantically represents world coordinates
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
  viewportBounds: Bounds; // The actual viewport size in screen space
}

export interface WorldPoint extends Point {
  // Same as Point but semantically represents world coordinates
}

// Type aliases for backward compatibility
export type ScreenPoint = Point;
export type ScreenBounds = Bounds;

// Fill system types
export type FillType =
  | "solid"
  | "linear-gradient"
  | "radial-gradient"
  | "image";

export interface BaseFill {
  id: string;
  type: FillType;
  visible: boolean;
  opacity: number; // 0-1
  blendMode?:
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "soft-light"
    | "hard-light"
    | "color-dodge"
    | "color-burn"
    | "darken"
    | "lighten"
    | "difference"
    | "exclusion";
}

export interface SolidFill extends BaseFill {
  type: "solid";
  color: string; // hex, rgb, hsl, etc.
}

export interface GradientStop {
  position: number; // 0-1
  color: string;
  opacity?: number; // 0-1, defaults to 1
}

export interface LinearGradientFill extends BaseFill {
  type: "linear-gradient";
  angle: number; // degrees, 0 = left to right, 90 = top to bottom
  stops: GradientStop[];
}

export interface RadialGradientFill extends BaseFill {
  type: "radial-gradient";
  centerX: number; // 0-1, relative to object bounds
  centerY: number; // 0-1, relative to object bounds
  radius: number; // 0-1, relative to object bounds
  stops: GradientStop[];
}

export interface ImageAdjustments {
  // CSS filter-based adjustments (efficient, real-time)
  exposure?: number; // -100 to 100, default 0
  contrast?: number; // -100 to 100, default 0 (maps to CSS contrast)
  saturation?: number; // -100 to 100, default 0 (maps to CSS saturate)
  temperature?: number; // -100 to 100, default 0 (cool to warm)
  tint?: number; // -100 to 100, default 0 (green to magenta)
  highlights?: number; // -100 to 100, default 0
  shadows?: number; // -100 to 100, default 0
  // Note: brightness handled via exposure for more realistic behavior
}

export interface ImageFill extends BaseFill {
  type: "image";
  imageUrl: string;
  fit: "fill" | "fit" | "crop" | "tile"; // how image should be sized
  offsetX?: number; // for positioning (can be pixels or normalized)
  offsetY?: number; // for positioning (can be pixels or normalized)
  scale?: number; // uniform scaling, defaults to 1
  scaleX?: number; // X-axis scaling, defaults to 1
  scaleY?: number; // Y-axis scaling, defaults to 1
  tileScale?: number; // scale for tile mode as percentage (1-1000), defaults to 100
  rotation?: number; // rotation in degrees, defaults to 0
  adjustments?: ImageAdjustments; // Image quality adjustments
  imageWidth?: number; // original image width in pixels
  imageHeight?: number; // original image height in pixels
}

export type Fill =
  | SolidFill
  | LinearGradientFill
  | RadialGradientFill
  | ImageFill;

// Stroke system (follows similar pattern to fills)
export type StrokeType =
  | "solid"
  | "linear-gradient"
  | "radial-gradient"
  | "image";

export interface BaseStroke {
  id: string;
  type: StrokeType;
  visible: boolean;
  opacity: number; // 0-1
  blendMode?:
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "soft-light"
    | "hard-light"
    | "color-dodge"
    | "color-burn"
    | "darken"
    | "lighten"
    | "difference"
    | "exclusion";
}

export interface SolidStroke extends BaseStroke {
  type: "solid";
  color: string; // hex, rgb, hsl, etc.
}

export interface LinearGradientStroke extends BaseStroke {
  type: "linear-gradient";
  angle: number; // degrees, 0 = left to right, 90 = top to bottom
  stops: GradientStop[];
}

export interface RadialGradientStroke extends BaseStroke {
  type: "radial-gradient";
  centerX: number; // 0-1, relative to object bounds
  centerY: number; // 0-1, relative to object bounds
  radius: number; // 0-1, relative to object bounds
  stops: GradientStop[];
}

export interface ImageStroke extends BaseStroke {
  type: "image";
  imageUrl: string;
  fit: "fill" | "fit" | "crop" | "tile"; // how image should be sized
  offsetX?: number; // 0-1, for cropping/positioning
  offsetY?: number; // 0-1, for cropping/positioning
  scale?: number; // for scaling, defaults to 1
  rotation?: number; // rotation in degrees, defaults to 0
  adjustments?: ImageAdjustments; // Image quality adjustments
}

export type Stroke =
  | SolidStroke
  | LinearGradientStroke
  | RadialGradientStroke
  | ImageStroke;

// Effect system types
export type EffectType = "drop-shadow" | "inner-shadow" | "layer-blur";

export interface BaseEffect {
  id: string;
  type: EffectType;
  visible: boolean;
}

export interface DropShadowEffect extends BaseEffect {
  type: "drop-shadow";
  color: string; // hex color
  opacity: number; // 0-1
  offsetX: number; // pixels
  offsetY: number; // pixels
  blur: number; // pixels (blur radius)
  spread: number; // pixels
}

export interface InnerShadowEffect extends BaseEffect {
  type: "inner-shadow";
  color: string; // hex color
  opacity: number; // 0-1
  offsetX: number; // pixels
  offsetY: number; // pixels
  blur: number; // pixels (blur radius)
  spread: number; // pixels
}

export interface LayerBlurEffect extends BaseEffect {
  type: "layer-blur";
  blur: number; // pixels (blur radius)
}

export type Effect = DropShadowEffect | InnerShadowEffect | LayerBlurEffect;

// Line height types
export interface LineHeight {
  value: number;
  unit: "px" | "%";
}

// Letter spacing types
export interface LetterSpacing {
  value: number;
  unit: "px" | "%";
}

// Text resize modes
export type TextResizeMode = "auto-width" | "auto-height" | "fixed";

// Canvas object types
export type CanvasObjectType =
  | "frame"
  | "rectangle"
  | "ellipse"
  | "text"
  | "vector"
  | "component"
  | "instance"
  | "make";

export interface CanvasObject {
  id: string;
  type: CanvasObjectType;
  name: string;

  // Creation timestamp for ordering
  createdAt: number;

  // Position and size in world coordinates
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;

  // Auto layout properties for items inside auto layout frames
  autoLayoutSizing: {
    horizontal: AutoLayoutItemSizing;
    vertical: AutoLayoutItemSizing;
  };

  // Auto layout order for child objects (if they're children of an auto layout frame)
  // This explicit order property makes reordering sync more reliable than relying on childIds array order
  autoLayoutOrder?: number;

  // Absolute positioning within auto layout frames
  // When true, this object is positioned absolutely and doesn't participate in auto layout flow
  absolutePositioned?: boolean;

  // Enhanced styling with multiple fills and strokes
  fills?: Fill[]; // Ordered array, first = bottom layer, last = top layer
  strokes?: Stroke[]; // Ordered array, first = bottom layer, last = top layer
  effects?: Effect[]; // Ordered array of visual effects (shadows, blurs)

  // Stroke configuration (shared across all strokes)
  strokeWidth?: number; // Default/uniform width
  strokePosition?: "inside" | "center" | "outside"; // Position relative to object edge
  strokeWidths?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  }; // Individual widths for each side (overrides strokeWidth if set)

  // Legacy stroke properties for backward compatibility
  stroke?: string;
  strokeOpacity?: number;
  opacity?: number;
  blendMode?: string; // CSS mix-blend-mode value for the entire object

  // Legacy fill property for backward compatibility
  fill?: string; // Will be migrated to fills array

  // Hierarchy
  parentId?: string;
  childIds: string[];

  // Z-index for layering
  zIndex: number;

  // Visibility and locking
  visible: boolean;
  locked: boolean;

  // Component system properties
  componentId?: string; // For instances: reference to main component
  variantId?: string; // For instances: which variant is selected
  overrides?: ComponentOverrides; // For instances: property overrides
  isMainComponent?: boolean; // For components: marks this as the main definition
  isComponentInstance?: boolean; // For instances: marks this as an instance
  originalId?: string; // For instance objects: ID of the corresponding main component object

  // Source Make tracking (set when this design was generated from a Make)
  sourceMakeId?: string;
  // Serialized design tree at generation time (baseline for diffing user changes)
  sourceDesignSnapshot?: string;

  // Gen-AI generator state (serialized UISpec JSON)
  genAiSpec?: string;
  // Gen-AI current control values (serialized JSON). Persisted so values
  // survive popover close/reopen and modify-prompt re-runs.
  genAiValues?: string;

  // Type-specific properties
  properties: CanvasObjectProperties;
}

// Type-specific properties
export type CanvasObjectProperties =
  | FrameProperties
  | RectangleProperties
  | EllipseProperties
  | TextProperties
  | VectorProperties
  | ComponentProperties
  | InstanceProperties
  | MakeProperties;

// Auto layout types
export type AutoLayoutMode = "none" | "horizontal" | "vertical" | "grid";

export type AutoLayoutItemSizing = "fixed" | "fill" | "hug";

export function getDefaultAutoLayoutSizing(): {
  horizontal: AutoLayoutItemSizing;
  vertical: AutoLayoutItemSizing;
} {
  return {
    horizontal: "fixed",
    vertical: "fixed",
  };
}

export interface AutoLayoutProperties {
  mode: AutoLayoutMode;
  direction?: "normal" | "reverse"; // For horizontal/vertical
  gap?: number; // Spacing between items (itemSpacing in Figma)
  counterAxisSpacing?: number; // Spacing on counter axis for wrapped layouts
  wrap?: boolean; // Whether items can wrap to new lines/columns
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  alignItems?: "start" | "center" | "end" | "stretch"; // Cross-axis alignment
  justifyContent?:
    | "start"
    | "center"
    | "end"
    | "space-between"
    | "space-around"
    | "space-evenly"; // Main-axis alignment

  // Grid-specific properties
  gridColumns?: number;
  gridRows?: number;
}

export interface FrameProperties {
  type: "frame";
  backgroundColor?: string; // Legacy, will be migrated to fills
  borderRadius?: BorderRadius;
  overflow: "visible" | "hidden";
  autoLayout?: AutoLayoutProperties;

  // Figma import metadata for detached components/instances
  originalFigmaType?: "COMPONENT" | "INSTANCE"; // Track original Figma node type
  detachedComponent?: boolean; // True if imported from a Figma component
  detachedInstance?: boolean; // True if imported from a Figma instance
  originalComponentId?: string; // Original Figma component ID (for instances)
}

export interface RectangleProperties {
  type: "rectangle";
  borderRadius?: BorderRadius;
}

export interface EllipseProperties {
  type: "ellipse";
}

export interface VectorProperties {
  type: "vector";
  // Vector-specific properties based on Figma API
  vectorPaths?: string; // SVG path data (single <path> d attribute)
  svgContent?: string; // Full SVG inner markup (multiple paths, complex shapes, icons)
  svgViewBox?: string; // Original SVG viewBox (e.g. "0 0 24 24") for correct rendering
  vectorNetwork?: any; // Complex vector network structure (for future use)
  windingRule?: string; // "NONZERO" | "EVENODD" — maps to SVG fill-rule
  handleMirroring?: "ANGLE" | "ANGLE_AND_LENGTH" | "NONE";
  figmaNodeId?: string; // Store Figma node ID for SVG export

  // Boolean operation properties (when imported from BOOLEAN_OPERATION)
  booleanOperation?: "UNION" | "SUBTRACT" | "INTERSECT" | "EXCLUDE";
  isBoolean?: boolean; // Flag to distinguish boolean operations from regular vectors
}

// Rich text support
export interface TextSpan {
  id: string;
  text: string;
  style: TextStyle;
}

export interface TextStyle {
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  color: string;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  lineHeight?: LineHeight;
  letterSpacing?: LetterSpacing;
  // Future: italic, underline, strikethrough, etc.
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
}

export interface TextProperties {
  type: "text";
  // Simple mode (backward compatibility)
  content: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  textAlign: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  lineHeight: LineHeight;
  letterSpacing: LetterSpacing;

  // Rich text mode (new)
  spans?: TextSpan[]; // If present, use rich text instead of simple content
  resizeMode?: TextResizeMode;
  formattedContent?: string; // HTML content with rich formatting
  slateContent?: string; // Slate.js state as JSON string

  // Editing state
  isEditing?: boolean;
}

// Make (live code preview) properties
export interface MakeChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  thinking?: string;
  isCodeStreaming?: boolean;
  messageType?:
    | "text"
    | "code_streaming"
    | "error"
    | "auto_fix"
    | "status"
    | "elapsed";
}

export type MakeMode = "html" | "react";

export interface MakeVersion {
  id: string;
  code: string;
  prompt: string;
  timestamp: number;
}

export interface MakeProperties {
  type: "make";
  // Code generation mode: plain HTML or React
  mode: MakeMode;
  // The code content (HTML for "html" mode, React JSX for "react" mode)
  code: string;
  // Chat history for AI conversation
  chatHistory: MakeChatMessage[];
  // Whether the iframe is interactive (playing) or static (paused)
  playing: boolean;
  // Optional title/description
  description?: string;
  // Border radius like frames
  borderRadius?: BorderRadius;
  // Overflow behavior
  overflow: "visible" | "hidden";
  // Snapshot data URL (captured from Sandpack preview for static canvas display)
  snapshot?: string;
  // Source canvas object ID (when created via "Convert to Make")
  sourceObjectId?: string;
  // Version history: snapshots of code after each AI prompt
  versions?: MakeVersion[];
  // Index of the currently active version; undefined = latest
  currentVersionIndex?: number;
}

// Component system types
export interface ComponentDefinition {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  mainObjectId: string; // The canvas object that serves as the main component
  variants: ComponentVariant[];
}

export interface ComponentVariant {
  id: string;
  name: string;
  properties: Record<string, any>; // Variant-specific property values
  isDefault?: boolean;
}

export interface ComponentOverrides {
  // Property overrides for instance
  [objectId: string]: {
    [propertyPath: string]: any;
  };
}

export interface ComponentProperties {
  type: "component";
  variants: ComponentVariant[];
  defaultVariantId?: string;
}

export interface InstanceProperties {
  type: "instance";
  componentId: string;
  variantId?: string;
  overrides: ComponentOverrides;
}

// Selection state
export interface SelectionState {
  selectedIds: string[];
  hoveredId?: string;
  selectionBounds?: WorldBounds;
}

// Tool types
export type ToolType =
  | "select"
  | "frame"
  | "rectangle"
  | "ellipse"
  | "text"
  | "vector"
  | "hand"
  | "make";

export interface ToolState {
  activeTool: ToolType;
  isCreating: boolean;
  creationPreview?: Partial<CanvasObject>;
}

/**
 * AI Tool definitions for the design partner.
 *
 * Tools are defined in a provider-neutral format and converted to
 * OpenAI / Anthropic schemas as needed.
 */

// ─── Neutral tool definition ────────────────────────────────────────

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  enum?: string[];
  items?: { type: string };
  properties?: Record<string, ToolParameter>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required: string[];
  };
}

// ─── Tool definitions ───────────────────────────────────────────────

export const AI_TOOLS: ToolDefinition[] = [
  // ── Canvas awareness ──────────────────────────────────────────────
  {
    name: "inspect_canvas",
    description:
      "Inspect the full canvas or a specific subtree. Returns the design tree as pseudo-HTML. " +
      "Use 'summary' mode for a high-level overview, 'detail' mode for the full tree of a specific frame.",
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          description: "Level of detail: 'summary' returns frame names/sizes only, 'detail' returns full tree",
          enum: ["summary", "detail"],
        },
        targetId: {
          type: "string",
          description: "Optional: ID of a specific object to inspect in detail. Omit for the full page.",
        },
        pageId: {
          type: "string",
          description: "Optional: page ID to inspect. Defaults to the current page.",
        },
      },
      required: ["mode"],
    },
  },
  {
    name: "get_design_overview",
    description:
      "Get a high-level overview of the entire design file: pages, top-level frames, element counts, " +
      "and a summary of colors, fonts, and spacing values used across the design. " +
      "Call this first when you need to understand the full design context.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  // ── Design analysis ───────────────────────────────────────────────
  {
    name: "check_accessibility",
    description:
      "Run accessibility checks on the design: WCAG contrast ratios for text, touch target sizes, " +
      "minimum text sizes. Returns a structured report of issues with severity levels.",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description: "'selection' to check only the selected objects, 'page' for the entire current page",
          enum: ["selection", "page"],
        },
      },
      required: ["scope"],
    },
  },
  {
    name: "audit_consistency",
    description:
      "Audit the design for consistency: find all unique colors, fonts, font sizes, spacings, and border radii. " +
      "Flags near-duplicates (e.g., #333 vs #334) and reports which values are most/least common. " +
      "This is the foundation for design system extraction.",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description: "'selection' or 'page'",
          enum: ["selection", "page"],
        },
      },
      required: ["scope"],
    },
  },
  {
    name: "analyze_hierarchy",
    description:
      "Analyze the visual hierarchy and structure of the design: heading/body text size ratios, " +
      "nesting depth, auto-layout usage, naming conventions, empty frames, and overlapping elements.",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description: "'selection' or 'page'",
          enum: ["selection", "page"],
        },
      },
      required: ["scope"],
    },
  },

  // ── Design operations ─────────────────────────────────────────────
  {
    name: "apply_operations",
    description:
      "Apply design operations to the canvas: create, update, delete, duplicate, or reparent objects. " +
      "Use this tool when you want to make changes to the design. " +
      "Operations use the same format as before (create/update/delete/duplicate/reparent). " +
      "Use 'duplicate' to clone an existing object with all its children — new unique IDs are generated automatically.",
    parameters: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          description: "Array of design operations to apply",
          items: { type: "object" },
        },
        explanation: {
          type: "string",
          description: "Brief explanation of what these operations do (shown to user)",
        },
      },
      required: ["operations", "explanation"],
    },
  },

  // ── Web research ──────────────────────────────────────────────────
  {
    name: "search_design_references",
    description:
      "Search the web for design references, patterns, inspiration, and platform guidelines. " +
      "Use this when the user asks about best practices, wants inspiration, or needs guidance " +
      "on platform-specific design patterns (iOS HIG, Material Design, etc.).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query focused on design topics",
        },
      },
      required: ["query"],
    },
  },

  // ── Interactive UI ─────────────────────────────────────────────────
  {
    name: "present_choices",
    description:
      "Present interactive choices to the user in the chat UI. Use this when you want to ask " +
      "the user a question with specific options they can click on, instead of typing a response. " +
      "Modes: 'single' for pick-one buttons (user clicks one option and it sends immediately), " +
      "'multiple' for check-many with a submit button (user selects several then confirms), " +
      "'confirm' for a yes/no or proceed/cancel decision. " +
      "Always provide clear, concise option labels. Use description for extra context on each option.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question or prompt to show above the options",
        },
        mode: {
          type: "string",
          description: "Interaction mode",
          enum: ["single", "multiple", "confirm"],
        },
        options: {
          type: "array",
          description:
            "Array of option objects with id (unique key), label (display text), and optional description (extra context)",
          items: { type: "object" },
        },
      },
      required: ["question", "mode", "options"],
    },
  },

  // ── Structured content ───────────────────────────────────────────────
  {
    name: "present_content_blocks",
    description:
      "Present structured content as expandable cards in the chat UI instead of a wall of text. " +
      "Use this for ANY long-form response that has multiple distinct sections — brainstorms, " +
      "screen flow ideas, design reviews with multiple findings, step-by-step plans, etc.\n\n" +
      "Each block becomes a collapsible card showing title + summary, expandable for full body.\n" +
      "This is MUCH better than dumping markdown — the user sees the structure at a glance.\n\n" +
      "IMPORTANT: After calling this tool, add only a brief wrap-up sentence. Do NOT repeat the block contents in text.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "Optional heading for the entire set of blocks (e.g. 'Onboarding Flow Ideas')",
        },
        blocks: {
          type: "array",
          description:
            "Array of content block objects. Each block: { id (unique string), title (card heading), " +
            "summary (1-2 sentence preview, always visible), body (full markdown content, shown when expanded), " +
            "tags (optional string array for category pills) }",
          items: { type: "object" },
        },
      },
      required: ["blocks"],
    },
  },

  // ── Spatial awareness & positioning ──────────────────────────────────
  {
    name: "get_spatial_info",
    description:
      "Get the absolute world positions, sizes, and spatial relationships of objects on the canvas. " +
      "Returns per-object bounds (x, y, width, height) in world coordinates plus pairwise relationships: " +
      "whether A is above/below/left/right of B, the gap in pixels, and any overlap. " +
      "Call this BEFORE any spatial operation (moving, positioning, aligning) to understand the current layout. " +
      "If no objectIds are provided, returns info for all top-level frames.",
    parameters: {
      type: "object",
      properties: {
        objectIds: {
          type: "array",
          description: "Optional: specific object IDs to analyze. If omitted, uses all top-level frames.",
          items: { type: "string" },
        },
      },
      required: [],
    },
  },
  {
    name: "move_objects",
    description:
      "Move one or more objects to new positions on the canvas. Supports two modes:\n" +
      "1. Absolute: specify exact world x,y coordinates.\n" +
      "2. Relative: position an object relative to another (e.g., 'below Frame B with 20px gap').\n\n" +
      "IMPORTANT: Use this for spatial repositioning. Do NOT use 'reparent' when the user says " +
      "'put below/above/next to' — reparent nests objects inside each other, move positions them independently.\n" +
      "Always call get_spatial_info first to understand current positions.",
    parameters: {
      type: "object",
      properties: {
        moves: {
          type: "array",
          description:
            "Array of move instructions. Each is either:\n" +
            "- Absolute: { targetId, x, y }\n" +
            "- Relative: { targetId, relativeTo, position, gap }\n" +
            "  position: 'below' | 'above' | 'left' | 'right' | 'center-below' | 'center-right'\n" +
            "  gap: spacing in pixels (default 20)",
          items: { type: "object" },
        },
      },
      required: ["moves"],
    },
  },
  {
    name: "resize_objects",
    description:
      "Resize one or more objects. Supports two modes:\n" +
      "1. Absolute: set specific width and/or height.\n" +
      "2. Match: match another object's width, height, or both.",
    parameters: {
      type: "object",
      properties: {
        resizes: {
          type: "array",
          description:
            "Array of resize instructions. Each is either:\n" +
            "- Absolute: { targetId, width?, height? }\n" +
            "- Match: { targetId, matchId, dimension: 'width' | 'height' | 'both' }",
          items: { type: "object" },
        },
      },
      required: ["resizes"],
    },
  },

  // ── Selection ────────────────────────────────────────────────────────
  {
    name: "select_objects",
    description:
      "Select objects on the canvas. Two modes:\n" +
      "1. Direct: provide specific objectIds to select.\n" +
      "2. Filter: provide a filter object to find and select matching objects.\n\n" +
      "Filter criteria (all optional, combined with AND):\n" +
      "- type: 'frame' | 'text' | 'vector' | 'rectangle' | 'ellipse'\n" +
      "- namePattern: regex pattern to match object names (case-insensitive)\n" +
      "- fillColor: hex color (e.g. '#FF0000') to match solid fills\n" +
      "- minWidth / maxWidth / minHeight / maxHeight: size bounds in px\n" +
      "- parentId: only objects that are direct children of this parent\n\n" +
      "The matched objects will be selected on the canvas so the user can see them highlighted.",
    parameters: {
      type: "object",
      properties: {
        objectIds: {
          type: "array",
          description: "Specific object IDs to select directly.",
          items: { type: "string" },
        },
        filter: {
          type: "object",
          description:
            "Filter criteria to find objects. All fields optional, combined with AND.",
          properties: {
            type: { type: "string", description: "Object type to match" },
            namePattern: {
              type: "string",
              description: "Regex pattern for name matching (case-insensitive)",
            },
            fillColor: {
              type: "string",
              description: "Hex color to match in solid fills (e.g. '#FF0000')",
            },
            minWidth: { type: "number", description: "Minimum width in px" },
            maxWidth: { type: "number", description: "Maximum width in px" },
            minHeight: { type: "number", description: "Minimum height in px" },
            maxHeight: { type: "number", description: "Maximum height in px" },
            parentId: {
              type: "string",
              description: "Only direct children of this parent",
            },
          },
        },
      },
      required: [],
    },
  },

  // ── Make objects (live code components) ──────────────────────────
  {
    name: "inspect_make",
    description:
      "Inspect a Make object — a live code component on the canvas. Returns the Make's current " +
      "code, mode (html or react), description, and dimensions. " +
      "NOTE: Make code is already available in the canvas context (objects[id].properties.code). " +
      "Only call this tool if you need to re-read the code after an edit_make, or if the user " +
      "explicitly asks to inspect a Make. Do NOT call this before edit_make or extract_views — " +
      "read the code from the canvas context instead.",
    parameters: {
      type: "object",
      properties: {
        makeId: {
          type: "string",
          description: "The ID of the Make object to inspect",
        },
      },
      required: ["makeId"],
    },
  },
  {
    name: "edit_make",
    description:
      "Edit a Make object's code by sending instructions to the code generation model. " +
      "The instructions describe what changes to make to the Make's code. " +
      "Use this when the user asks to modify a Make — for example, to update it to match " +
      "a design, add features, fix bugs, or change styling. " +
      "The Make's code will be updated in-place and the live preview will reflect the changes.",
    parameters: {
      type: "object",
      properties: {
        makeId: {
          type: "string",
          description: "The ID of the Make object to edit",
        },
        instructions: {
          type: "string",
          description:
            "Detailed instructions for how to edit the Make's code. Be specific about " +
            "what to change — include design details like colors, spacing, layout, content, etc.",
        },
      },
      required: ["makeId", "instructions"],
    },
  },

  {
    name: "create_make",
    description:
      "Create a new Make object (live React code component) on the canvas. " +
      "The new Make will be generated from the provided instructions by a code generation model. " +
      "Use this when the user asks you to create a new live/interactive component, " +
      "create a variation of an existing Make, or when a Make is more appropriate than static design objects. " +
      "You can optionally provide a reference Make ID to base the new Make on (its code will be used as a starting point).",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name for the new Make object (e.g. 'Login Form - Dark', 'Dashboard v2')",
        },
        instructions: {
          type: "string",
          description:
            "Detailed instructions for the code generation model. Describe what to build " +
            "or how to modify the reference. Include design details like colors, layout, content, etc.",
        },
        width: {
          type: "number",
          description: "Width of the Make in pixels (default: 400)",
        },
        height: {
          type: "number",
          description: "Height of the Make in pixels (default: 400)",
        },
        referenceMakeId: {
          type: "string",
          description: "Optional: ID of an existing Make to use as the starting point for the code. " +
            "The reference Make's code will be provided to the model so it can create a variation.",
        },
      },
      required: ["name", "instructions"],
    },
  },

  // ── View extraction from Makes ──────────────────────────────────
  {
    name: "extract_views",
    description:
      "Extract visual views/screens from a Make (live code component) as static design objects on the canvas. " +
      "The tool receives a list of views to extract, each with a name and interaction steps to reach that view. " +
      "Each view gets its own iframe, so steps describe how to reach the view FROM the default/initial state.\n\n" +
      "CRITICAL: Only extract EXACTLY the views the user asked for. Examples:\n" +
      "- 'extract the login page' → ONE view: the login page\n" +
      "- 'extract the dark mode version' → ONE view: the current page with dark mode toggled on\n" +
      "- 'extract all views' or 'extract all screens' → ALL distinct views/pages\n" +
      "- 'extract the settings and profile pages' → TWO views: settings and profile\n" +
      "- 'extract what I see after clicking X then Y' → ONE view: the result of that specific flow\n" +
      "Do NOT include the default/initial view unless the user explicitly asks for it or asks for 'all' views.\n\n" +
      "The Make's code is already available in the canvas context (objects[makeId].properties.code). " +
      "Read it from there to figure out the exact interaction steps — do NOT call inspect_make first.\n\n" +
      "STEP FORMAT — for each step, provide BOTH 'text' AND 'selector' when possible:\n" +
      "- 'action': one of 'click', 'type', 'select', 'focus', 'clear', or 'wait_for'\n" +
      "- 'text': the visible UI text, placeholder, or label of the element to interact with\n" +
      "- 'selector': a CSS selector that uniquely targets the interactive element in the DOM. " +
      "Since you have the full source code, derive the selector from the JSX — look at the component " +
      "being rendered and build a selector using its tag, role, aria-label, data attributes, class names, or nth-child.\n" +
      "- 'value': (for 'type' and 'select' actions) the text to type or option to select\n" +
      "- 'count': (optional, default 1) repeat this action N times with DOM-stable waits between each. " +
      "Useful for clicking navigation arrows (calendars, carousels, pagination).\n\n" +
      "SUPPORTED ACTIONS:\n" +
      "- 'click': Click an element (button, link, tab, toggle, checkbox, etc.). Use 'count' for repeated clicks.\n" +
      "- 'type': Focus an input/textarea and set its value. Provide the text in 'value'. " +
      "Use 'text' to identify the input by its placeholder, label, or aria-label.\n" +
      "- 'select': Set a <select> dropdown value. Provide the option value in 'value'.\n" +
      "- 'focus': Focus and click an element (useful for triggering dropdowns or popovers).\n" +
      "- 'clear': Clear an input/textarea's current value.\n" +
      "- 'wait_for': Wait until specific text appears in the DOM (up to 5s). " +
      "Use 'text' for the text to wait for. Useful after navigation to confirm the correct state.\n\n" +
      "EXAMPLE — navigating a calendar to April and adding an event:\n" +
      "  steps: [\n" +
      "    { action: 'click', text: '>', selector: 'button[aria-label=\"Next month\"]', count: 1 },\n" +
      "    { action: 'wait_for', text: 'April 2026' },\n" +
      "    { action: 'click', text: '15' },\n" +
      "    { action: 'type', text: 'Event title', selector: 'input[name=\"title\"]', value: 'Team Meeting' },\n" +
      "    { action: 'click', text: 'Save', selector: 'button[type=\"submit\"]' }\n" +
      "  ]\n\n" +
      "EXAMPLE — extracting a search results view:\n" +
      "  steps: [\n" +
      "    { action: 'type', text: 'Search...', selector: 'input[placeholder=\"Search...\"]', value: 'running shoes' },\n" +
      "    { action: 'click', text: 'Search', selector: 'button[type=\"submit\"]' }\n" +
      "  ]\n\n" +
      "EXAMPLE — filling autocomplete/typeahead fields (e.g. city pickers, user search):\n" +
      "Autocomplete fields require TWO steps per field: type the query, then click the dropdown suggestion.\n" +
      "  steps: [\n" +
      "    { action: 'type', text: 'City or airport', value: 'New York' },\n" +
      "    { action: 'click', text: 'New York' },\n" +
      "    { action: 'type', text: 'Destination', value: 'London' },\n" +
      "    { action: 'click', text: 'London' },\n" +
      "    { action: 'click', text: 'Search Flights' }\n" +
      "  ]\n" +
      "The click step after typing will find and click the dropdown item matching that text. " +
      "If the dropdown has formatted items (e.g. 'New York (JFK)'), use the most distinctive part of the text.\n\n" +
      "COUNTING NAVIGATION CLICKS: When navigating calendars, carousels, or paginated views:\n" +
      "1. Determine the CURRENT state (e.g., the month shown in the code's initial render / default state)\n" +
      "2. Determine the TARGET state (e.g., the month the user wants)\n" +
      "3. Calculate: if target is AFTER current, use the FORWARD/NEXT arrow ('>', 'Next', '→', chevron-right). " +
      "If target is BEFORE current, use the BACKWARD/PREV arrow ('<', 'Prev', '←', chevron-left).\n" +
      "4. Count the exact difference. Month math: April is 1 month after March, July is 4 months after March.\n" +
      "5. ALWAYS add a 'wait_for' step after navigation to verify the correct state was reached.\n" +
      "COMMON MISTAKE: Do NOT click backward when you need to go forward! " +
      "From March 2026 → April 2026 = click NEXT 1 time. From March 2026 → January 2026 = click PREV 2 times.\n\n" +
      "IMPORTANT for toggles/switches: the 'selector' MUST target the interactive element itself " +
      "(e.g., 'button[role=\"switch\"]', 'input[type=\"checkbox\"]'), NOT a nearby text label. " +
      "If there are multiple toggles, use context to disambiguate " +
      "(e.g., '.setting-row:nth-child(3) button[role=\"switch\"]').\n\n" +
      "Each view's steps start from the default/initial state.\n\n" +
      "VARIANT VIEWS (dark mode, different states): If the user asks for views 'in dark mode' or any other variant, " +
      "EVERY view must include ALL steps to reach that variant FIRST, then the steps to reach the target screen. " +
      "Each view starts from the initial/default state in its own iframe — variants do NOT carry over.\n" +
      "Example: 'extract Home and Profile in dark mode' where dark mode toggle is on Profile screen:\n" +
      "  View 'Home - Dark Mode': steps = [click Profile tab, click Dark Mode toggle, click Home tab]\n" +
      "  View 'Profile - Dark Mode': steps = [click Profile tab, click Dark Mode toggle]\n" +
      "The dark mode toggle must appear in EVERY view's steps. Think step-by-step: " +
      "from the initial state, what clicks are needed to enable the variant, then reach the screen?\n\n" +
      "ASYNC EXECUTION: This tool runs on the client and results arrive in the NEXT message. " +
      "Do NOT proceed with follow-up tasks (like adding labels or descriptions) until you receive the extraction results. " +
      "End your turn after calling this tool and wait for the results.",
    parameters: {
      type: "object",
      properties: {
        makeId: {
          type: "string",
          description: "The ID of the Make object to extract views from",
        },
        views: {
          type: "array",
          description:
            "Array of views to extract. Each view: { name: string, steps: Array<{ action: 'click'|'type'|'select'|'focus'|'clear'|'wait_for', text?: string, selector?: string, value?: string, count?: number }> }. " +
            "Only include a default-state view (steps: []) if the user asked for 'all views' or the default view specifically. " +
            "For 'type' actions, use 'text' to identify the input (placeholder or label) and 'value' for the text to type. " +
            "For repeated clicks (calendar nav, pagination), use 'count'. Follow navigation clicks with 'wait_for' to verify state. " +
            "ALWAYS provide 'selector' for toggles, switches, checkboxes. Provide both 'text' and 'selector' when possible.",
          items: { type: "object" },
        },
      },
      required: ["makeId", "views"],
    },
  },

  // ── Design system ─────────────────────────────────────────────────
  {
    name: "extract_design_system",
    description:
      "Analyze the canvas and extract a design system: color palette, typography scale, " +
      "spacing scale, border radius values, and common component patterns. " +
      "Returns a structured design system that can be referenced in future conversations.",
    parameters: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          description: "'page' for current page, 'all' for entire file",
          enum: ["page", "all"],
        },
      },
      required: ["scope"],
    },
  },
];

// ─── Convert to OpenAI format ───────────────────────────────────────

export function toOpenAITools(tools: ToolDefinition[]) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

// ─── Convert to Anthropic format ────────────────────────────────────

export function toAnthropicTools(tools: ToolDefinition[]) {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

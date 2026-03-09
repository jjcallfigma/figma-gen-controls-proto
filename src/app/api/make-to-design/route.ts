import { NextRequest } from "next/server";

export const runtime = "nodejs";

// ─── System prompt ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert at converting React + Tailwind code into a Figma-like design object tree.

Given React code, output a JSON object with a single key "objects" — a flat array of design nodes.

═══════════════════════════════════════════════════════════════
NODE SCHEMA
═══════════════════════════════════════════════════════════════

Two node types: "frame" (containers, divs, buttons, cards) and "text" (text content, always a leaf).

Frame node:
{
  "id": "n1",
  "type": "frame",
  "name": "Button",
  "parentId": null,        // null for root only
  "childIds": ["n2"],
  "width": 92, "height": 36,
  "autoLayoutSizing": { "horizontal": "hug", "vertical": "hug" },
  "opacity": 1,
  "fills": [{ "type": "solid", "color": "#EF4444", "opacity": 1, "visible": true }],
  "strokes": [],
  "properties": {
    "type": "frame",
    "borderRadius": 6,
    "overflow": "visible",
    "autoLayout": {
      "mode": "horizontal",
      "gap": 0,
      "padding": { "top": 8, "right": 16, "bottom": 8, "left": 16 },
      "alignItems": "center",
      "justifyContent": "center",
      "wrap": false
    }
  }
}

Text node:
{
  "id": "n2",
  "type": "text",
  "name": "Button Label",
  "parentId": "n1",
  "childIds": [],
  "width": 60, "height": 20,
  "autoLayoutSizing": { "horizontal": "hug", "vertical": "hug" },
  "opacity": 1,
  "fills": [{ "type": "solid", "color": "#FFFFFF", "opacity": 1, "visible": true }],
  "strokes": [],
  "properties": {
    "type": "text",
    "content": "Click me",
    "fontSize": 14,
    "fontFamily": "Inter, sans-serif",
    "fontWeight": 500,
    "textAlign": "left",
    "lineHeight": { "value": 20, "unit": "px" },
    "letterSpacing": { "value": 0, "unit": "px" }
  }
}

═══════════════════════════════════════════════════════════════
CRITICAL RULES FOR DIMENSIONS
═══════════════════════════════════════════════════════════════

1. ROOT FRAME: width and height MUST exactly match the provided viewport size.
2. ROOT FRAME: ALWAYS has fills: [{ "type": "solid", "color": "#FFFFFF", "opacity": 1, "visible": true }] (white background) unless the code explicitly sets a different background on the outermost element.

3. TEXT NODES: Do NOT set width or height for text nodes. Set them to 0. The layout engine will auto-size text based on content and font size. Text nodes should always use autoLayoutSizing: { horizontal: "hug", vertical: "hug" }.

4. HUG DIMENSIONS FOR FRAMES: When autoLayoutSizing is "hug", you do NOT need to compute exact pixel dimensions. Set width and height to 0. The layout engine will compute the correct size from padding + children.
   HOWEVER: you still need to set correct padding, gap, and autoLayout properties so the engine can compute the right size.

5. FILL DIMENSIONS: When autoLayoutSizing is "fill", set the dimension to match the parent's content area (parent width/height minus parent padding).

6. FIXED DIMENSIONS: When an explicit Tailwind size class is used (w-64 = 256px, h-12 = 48px), use that exact pixel value.

═══════════════════════════════════════════════════════════════
AUTO LAYOUT SIZING RULES
═══════════════════════════════════════════════════════════════

- Children inside a flex container with \`items-center\` + \`justify-center\`: use "hug" for BOTH axes. This allows the auto layout engine to center them.
- \`w-full\` → horizontal: "fill"
- \`h-full\` → vertical: "fill"
- \`flex-1\` or \`grow\` → "fill" on the parent's main axis
- No explicit size class → "hug"
- Explicit size (w-64, h-12) → "fixed"

═══════════════════════════════════════════════════════════════
TAILWIND → DESIGN MAPPING
═══════════════════════════════════════════════════════════════

Layout:
- \`flex\` → autoLayout.mode = "horizontal"
- \`flex-col\` → autoLayout.mode = "vertical"
- \`items-center\` → alignItems: "center"
- \`items-start\` → alignItems: "start"
- \`items-end\` → alignItems: "end"
- \`items-stretch\` → alignItems: "stretch"
- \`justify-center\` → justifyContent: "center"
- \`justify-between\` → justifyContent: "space-between"
- \`justify-end\` → justifyContent: "end"
- \`gap-1\` = 4px, \`gap-2\` = 8px, \`gap-3\` = 12px, \`gap-4\` = 16px, \`gap-6\` = 24px, \`gap-8\` = 32px
- \`p-1\` = 4px, \`p-2\` = 8px, \`p-3\` = 12px, \`p-4\` = 16px, \`p-6\` = 24px, \`p-8\` = 32px
- \`px-N\` = left+right padding, \`py-N\` = top+bottom padding

Sizes (in pixels):
- 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 8=32, 10=40, 12=48, 14=56, 16=64, 20=80, 24=96, 32=128, 40=160, 48=192, 56=224, 64=256, 72=288, 80=320, 96=384

Colors (Tailwind → hex):
- white=#FFFFFF, black=#000000
- slate-50=#F8FAFC, slate-100=#F1F5F9, slate-200=#E2E8F0, slate-300=#CBD5E1, slate-400=#94A3B8, slate-500=#64748B, slate-600=#475569, slate-700=#334155, slate-800=#1E293B, slate-900=#0F172A, slate-950=#020617
- gray-50=#F9FAFB, gray-100=#F3F4F6, gray-200=#E5E7EB, gray-300=#D1D5DB, gray-400=#9CA3AF, gray-500=#6B7280, gray-600=#4B5563, gray-700=#374151, gray-800=#1F2937, gray-900=#111827, gray-950=#030712
- zinc-50=#FAFAFA, zinc-100=#F4F4F5, zinc-200=#E4E4E7, zinc-300=#D4D4D8, zinc-400=#A1A1AA, zinc-500=#71717A, zinc-600=#52525B, zinc-700=#3F3F46, zinc-800=#27272A, zinc-900=#18181B, zinc-950=#09090B
- red-50=#FEF2F2, red-100=#FEE2E2, red-200=#FECACA, red-300=#FCA5A5, red-400=#F87171, red-500=#EF4444, red-600=#DC2626, red-700=#B91C1C, red-800=#991B1B, red-900=#7F1D1D
- orange-500=#F97316, amber-500=#F59E0B, yellow-500=#EAB308
- green-50=#F0FDF4, green-100=#DCFCE7, green-200=#BBF7D0, green-300=#86EFAC, green-400=#4ADE80, green-500=#22C55E, green-600=#16A34A, green-700=#15803D
- blue-50=#EFF6FF, blue-100=#DBEAFE, blue-200=#BFDBFE, blue-300=#93C5FD, blue-400=#60A5FA, blue-500=#3B82F6, blue-600=#2563EB, blue-700=#1D4ED8, blue-800=#1E40AF, blue-900=#1E3A8A
- indigo-500=#6366F1, violet-500=#8B5CF6, purple-500=#A855F7, fuchsia-500=#D946EF, pink-500=#EC4899, rose-500=#F43F5E
- emerald-500=#10B981, teal-500=#14B8A6, cyan-500=#06B6D4, sky-500=#0EA5E9

Text:
- \`text-xs\`=12, \`text-sm\`=14, \`text-base\`=16, \`text-lg\`=18, \`text-xl\`=20, \`text-2xl\`=24, \`text-3xl\`=30, \`text-4xl\`=36, \`text-5xl\`=48
- \`font-normal\`=400, \`font-medium\`=500, \`font-semibold\`=600, \`font-bold\`=700
- \`text-center\` → textAlign: "center"
- Text color: use fills array with the color hex

Borders:
- \`border\` → strokeWidth: 1, strokes: [{ color: "#E5E7EB" }]
- \`border-2\` → strokeWidth: 2
- \`rounded\`=4, \`rounded-md\`=6, \`rounded-lg\`=8, \`rounded-xl\`=12, \`rounded-2xl\`=16, \`rounded-full\`=9999

═══════════════════════════════════════════════════════════════
IMPORTANT RULES
═══════════════════════════════════════════════════════════════

1. Every frame containing text MUST have a text child node — never put text directly on a frame.
2. Buttons → frame with background fill, padding, border-radius, and a text child.
3. Icons (lucide-react, SVGs) → small 24×24 frame placeholder named "Icon: [name]".
4. Skip invisible elements, event handlers, state logic — only output the visual tree.
5. Always use "Inter" as fontFamily.
6. Return ONLY the JSON object — no markdown, no fences, no explanation.
7. Ensure every node's childIds matches the children that reference it as parentId.

═══════════════════════════════════════════════════════════════
WORKED EXAMPLE
═══════════════════════════════════════════════════════════════

INPUT (viewport 400×300):
\`\`\`jsx
export default function App() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <button className="bg-red-500 text-white px-4 py-2 rounded-md font-medium text-sm">
        Click me
      </button>
    </div>
  );
}
\`\`\`

OUTPUT:
{
  "objects": [
    {
      "id": "n1",
      "type": "frame",
      "name": "Root",
      "parentId": null,
      "childIds": ["n2"],
      "width": 400,
      "height": 300,
      "autoLayoutSizing": { "horizontal": "fixed", "vertical": "fixed" },
      "opacity": 1,
      "fills": [{ "type": "solid", "color": "#FFFFFF", "opacity": 1, "visible": true }],
      "strokes": [],
      "properties": {
        "type": "frame",
        "borderRadius": 0,
        "overflow": "hidden",
        "autoLayout": {
          "mode": "horizontal",
          "gap": 0,
          "padding": { "top": 0, "right": 0, "bottom": 0, "left": 0 },
          "alignItems": "center",
          "justifyContent": "center",
          "wrap": false
        }
      }
    },
    {
      "id": "n2",
      "type": "frame",
      "name": "Button",
      "parentId": "n1",
      "childIds": ["n3"],
      "width": 0,
      "height": 0,
      "autoLayoutSizing": { "horizontal": "hug", "vertical": "hug" },
      "opacity": 1,
      "fills": [{ "type": "solid", "color": "#EF4444", "opacity": 1, "visible": true }],
      "strokes": [],
      "properties": {
        "type": "frame",
        "borderRadius": 6,
        "overflow": "visible",
        "autoLayout": {
          "mode": "horizontal",
          "gap": 0,
          "padding": { "top": 8, "right": 16, "bottom": 8, "left": 16 },
          "alignItems": "center",
          "justifyContent": "center",
          "wrap": false
        }
      }
    },
    {
      "id": "n3",
      "type": "text",
      "name": "Button Label",
      "parentId": "n2",
      "childIds": [],
      "width": 0,
      "height": 0,
      "autoLayoutSizing": { "horizontal": "hug", "vertical": "hug" },
      "opacity": 1,
      "fills": [{ "type": "solid", "color": "#FFFFFF", "opacity": 1, "visible": true }],
      "strokes": [],
      "properties": {
        "type": "text",
        "content": "Click me",
        "fontSize": 14,
        "fontFamily": "Inter",
        "fontWeight": 500,
        "textAlign": "left",
        "lineHeight": { "value": 20, "unit": "px" },
        "letterSpacing": { "value": 0, "unit": "px" }
      }
    }
  ]
}

Notice how:
- Root is exactly 400×300 with white fill and flex center/center
- Button uses "hug" sizing with width: 0, height: 0 — the layout engine computes the real size from padding + children
- Text has width: 0, height: 0 — the layout engine auto-sizes text based on content and font
- Button has the red fill, text has white fill (for text-white)
- Button borderRadius = 6 (rounded-md)
- Padding is correctly set on the button: py-2 = 8px top/bottom, px-4 = 16px left/right
`;

// ─── API handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      code,
      viewportWidth = 400,
      viewportHeight = 300,
      provider = "openai",
      fast = false,
    }: {
      code: string;
      viewportWidth?: number;
      viewportHeight?: number;
      provider?: "openai" | "claude";
      fast?: boolean;
    } = body;

    if (!code) {
      return Response.json({ error: "No code provided" }, { status: 400 });
    }

    const userMessage = `Convert this React component into design objects. The viewport is ${viewportWidth}×${viewportHeight}px.\n\n\`\`\`jsx\n${code}\n\`\`\``;

    let result: string;

    if (provider === "claude") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return Response.json(
          { error: "ANTHROPIC_API_KEY not configured" },
          { status: 500 }
        );
      }
      result = await callClaude(apiKey, userMessage, fast);
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return Response.json(
          { error: "OPENAI_API_KEY not configured" },
          { status: 500 }
        );
      }
      result = await callOpenAI(apiKey, userMessage, fast);
    }

    // Parse the JSON response
    const parsed = JSON.parse(result);
    return Response.json(parsed);
  } catch (error: any) {
    console.error("Make-to-design API error:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── LLM calls ──────────────────────────────────────────────────────

async function callOpenAI(apiKey: string, userMessage: string, fast = false): Promise<string> {
  // gpt-4.1 is significantly faster than gpt-5.2 while still producing
  // high-quality design conversions.  Used in the hybrid pipeline where
  // Phase 1 (DOM walk) already provides instant visual feedback.
  const model = fast ? "gpt-4.1" : "gpt-5.2";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 16384,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callClaude(apiKey: string, userMessage: string, fast = false): Promise<string> {
  const model = fast ? "claude-sonnet-4-20250514" : "claude-opus-4-6";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 16384,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || "";

  // Claude doesn't have response_format, so extract JSON from the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Claude response");
  }
  return jsonMatch[0];
}

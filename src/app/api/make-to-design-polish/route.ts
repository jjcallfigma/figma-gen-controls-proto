import { NextRequest } from "next/server";

export const runtime = "nodejs";

// ─── System prompt (broad layout/alignment/icon corrections) ────────

const SYSTEM_PROMPT = `You are a design layout correction expert. You receive:
1. React+Tailwind source code
2. A compact JSON tree of auto-generated design objects

The tree has: id, type (frame/text/vector), name, w/h (dimensions), sizing (autoLayoutSizing), parentId, childIds, autoLayout (mode/align/justify/gap/pad), text content, textAlign, hasSvg.

Fix these common issues:

ALIGNMENT — check Tailwind classes and fix parent frame autoLayout:
- "items-center" → alignItems:"center"
- "justify-center" → justifyContent:"center"  
- "justify-between" → justifyContent:"space-between"
- "text-center" on a container → alignItems:"center"

SIZING — fix autoLayoutSizing on children:
- Standalone text labels → horizontal:"hug" (content-sized)
- Full-width inputs/containers (w-full) → horizontal:"fill"
- Buttons with w-full → horizontal:"fill"

ICONS — only add icons that are MISSING from the tree:
- Check existing vector nodes (hasSvg:true) — do NOT duplicate them
- Icons rendered via position:absolute in the code are always missing (e.g. icons inside input fields)
- For missing icons, create newObjects with the correct parentId
- The parentId should be the input wrapper frame that contains the input text, NOT a higher-level container

SPACING — verify gap matches Tailwind:
- space-y-{n}/gap-{n}: 1=4px, 2=8px, 3=12px, 4=16px, 6=24px, 8=32px

Return JSON:
{
  "updates": [
    { "id": "existing-id", "alignItems": "center" },
    { "id": "existing-id", "autoLayoutSizing": { "horizontal": "fill" } }
  ],
  "newObjects": [
    { "parentId": "input-wrapper-frame-id", "type": "vector", "name": "Icon: Mail", "width": 20, "height": 20, "svgContent": "<svg viewBox=\\"0 0 24 24\\">...</svg>", "insertIndex": 0 }
  ]
}

Update fields: alignItems, justifyContent, gap, autoLayoutSizing, width, height, name, svgContent.
New object fields: parentId, type, name, width, height, svgContent, insertIndex (0=first, -1=last).

RULES:
1. Only fix REAL mismatches between code and tree — be conservative.
2. Do NOT create icons that already exist as vector nodes in the tree.
3. SVG icons: Lucide style (stroke="currentColor", fill="none", stroke-width="2", viewBox="0 0 24 24").
4. Return ONLY JSON — no markdown, no fences, no explanation.
5. If nothing needs fixing: { "updates": [], "newObjects": [] }.`;

// ─── API handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      code,
      designTree,
      nodes, // Legacy: still accept simple node list for backwards compat
      provider = "openai",
    }: {
      code: string;
      designTree?: string;
      nodes?: Array<{
        id: string;
        name: string;
        reason: string;
        width: number;
        height: number;
      }>;
      viewportWidth?: number;
      viewportHeight?: number;
      provider?: "openai" | "claude";
    } = body;

    // Build the user message based on what data we have
    let userMessage: string;

    if (designTree) {
      // New expanded mode: full design tree review
      userMessage = `Here is the design tree (auto-generated from the code below):\n\n${designTree}\n\nReact source code:\n\n\`\`\`jsx\n${code}\n\`\`\`\n\nReview the design tree against the source code. Fix alignment, sizing, spacing, and add any missing icons.`;
    } else if (nodes && nodes.length > 0) {
      // Legacy mode: just SVG generation for specific nodes
      const nodeList = nodes
        .map(
          (n) =>
            `- id: "${n.id}", name: "${n.name}", size: ${n.width}×${n.height}, reason: ${n.reason}`
        )
        .join("\n");
      userMessage = `Here are the design nodes that need SVG content:\n\n${nodeList}\n\nThe React source code these came from:\n\n\`\`\`jsx\n${code}\n\`\`\`\n\nGenerate the correct SVG markup for each node.`;
    } else {
      return Response.json({ updates: [], newObjects: [] });
    }

    let result: string;

    if (provider === "claude") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return Response.json(
          { error: "ANTHROPIC_API_KEY not configured" },
          { status: 500 }
        );
      }
      result = await callClaude(apiKey, userMessage);
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return Response.json(
          { error: "OPENAI_API_KEY not configured" },
          { status: 500 }
        );
      }
      result = await callOpenAI(apiKey, userMessage);
    }

    const parsed = JSON.parse(result);
    return Response.json(parsed);
  } catch (error: any) {
    console.error("Make-to-design-polish API error:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── LLM calls (using faster/cheaper models for polish) ─────────────

async function callOpenAI(
  apiKey: string,
  userMessage: string
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      // Use a fast model for polish — this is a focused review task
      model: "gpt-4.1-mini",
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

async function callClaude(
  apiKey: string,
  userMessage: string
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      // Use a fast model for polish
      model: "claude-sonnet-4-20250514",
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

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in Claude response");
  }
  return jsonMatch[0];
}

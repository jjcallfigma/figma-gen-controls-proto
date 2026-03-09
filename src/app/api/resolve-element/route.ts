import { NextRequest } from "next/server";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are a DOM analysis expert. You receive a numbered DOM tree snapshot and an interaction instruction. Your job is to return the index number of the EXACT element that should receive the interaction.

Rules:
- For "click" actions targeting a toggle/switch/checkbox: return the actual toggle control element (button, input, [role="switch"], etc.), NOT a nearby text label.
- For "click" actions targeting navigation (tabs, links, menu items): return the clickable element (button, a, [role="tab"]) that triggers navigation.
- For "type" actions: return the input or textarea element that should receive text. Match by placeholder attribute, aria-label, nearby label text, or name attribute.
- For "select" actions: return the select element.
- For "focus" actions: return the element that should receive focus (input, textarea, button, or any focusable element).
- For "clear" actions: return the input or textarea whose value should be cleared.
- For navigation arrows (next/prev month, page, slide): return the specific arrow button, not a container.
- Prefer interactive elements (button, a, input, textarea, select, [role="switch"], [role="tab"], [role="button"], [contenteditable]) over passive ones (span, div, p, label).
- If the target text is a label NEXT TO an interactive control (like a toggle switch), return the interactive control, not the label.
- If the target text matches a placeholder attribute on an input/textarea, return that input/textarea.
- Look at the DOM structure: a toggle switch is usually a sibling or nearby cousin of its text label, inside the same container.

Return ONLY a JSON object: { "index": N }
Do NOT include any explanation or markdown.`;

export async function POST(request: NextRequest) {
  try {
    const { domSnapshot, step } = await request.json();

    if (!domSnapshot || !step) {
      return Response.json(
        { error: "Missing domSnapshot or step" },
        { status: 400 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 },
      );
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        max_completion_tokens: 64,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `Interaction: ${step}\n\n` +
              `DOM tree:\n${domSnapshot}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI API error:", response.status, error);
      return Response.json(
        { error: `OpenAI API error: ${response.status}` },
        { status: 502 },
      );
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content || "{}";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        return Response.json(
          { error: "Failed to parse AI response" },
          { status: 500 },
        );
      }
      parsed = JSON.parse(jsonMatch[0]);
    }

    return Response.json({ index: parsed.index });
  } catch (error: any) {
    console.error("Resolve element API error:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

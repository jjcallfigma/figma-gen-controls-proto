import { NextRequest } from "next/server";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are a code analysis expert. The user will give you a single-file React component. Your job is to identify ALL distinct visual states/views/pages the user can see.

Look for:
- Conditional rendering based on state (e.g., currentPage, isLoggedIn, activeTab)
- Tab bars, navigation menus, sidebar navigation
- Multi-step forms, wizards, onboarding flows
- Auth gates (login vs. authenticated views)
- Category filters, different list views
- React Router routes / hash-based routing
- Modal/dialog content states

For each view, return the SEQUENCE OF USER INTERACTIONS needed to reach it from the initial/default state. Use these action types:

- { "action": "click", "text": "Login", "selector": "button.login-btn" }  — click by text + CSS selector
- { "action": "click", "selector": "nav a:nth-child(2)" }                 — click by CSS selector only
- { "action": "click", "text": ">", "selector": "button[aria-label='Next']", "count": 3 } — click 3 times (for calendar/carousel navigation)
- { "action": "type", "text": "Email", "selector": "input[name=email]", "value": "test@example.com" } — type into an input (use placeholder or label as "text")
- { "action": "select", "selector": "select.category", "value": "electronics" }      — choose a select option
- { "action": "focus", "selector": "input.search" }                                  — focus an element (triggers dropdowns, popovers)
- { "action": "clear", "selector": "input[name=search]" }                            — clear an input's value
- { "action": "wait_for", "text": "April 2026" }                                     — wait until text appears in DOM

IMPORTANT: Provide BOTH "text" AND "selector" in each step whenever possible.
- "text" = the visible UI text
- "selector" = a CSS selector targeting the INTERACTIVE element (button, input, [role="switch"], etc.)
- For toggles/switches: "selector" MUST target the switch/checkbox element itself, NOT a text label.
  e.g., for a <Switch> next to "Daily Summary" text, use selector: 'button[role="switch"]' (with nth-child or
  parent context if there are multiple switches).

RETURN FORMAT:
Return a JSON object:
{
  "views": [
    { "name": "Home", "steps": [] },
    { "name": "Login Form", "steps": [{ "action": "click", "text": "Log in", "selector": "button:has(span)" }] },
    { "name": "Settings", "steps": [
      { "action": "click", "text": "Log in", "selector": "button:has(span)" },
      { "action": "click", "text": "Settings", "selector": "nav a:nth-child(3)" }
    ] }
  ]
}

RULES:
- views[0] MUST be the default/initial view with steps: [] (empty array)
- Each view's "steps" describe how to reach it FROM the initial/default state (NOT from the previous view)
- ALWAYS provide "selector" for toggles, switches, checkboxes — text alone is ambiguous for these
- Provide both "text" and "selector" when possible for all other elements
- Use the EXACT visible text from the JSX (case-sensitive, trimmed)
- Derive the CSS selector from the JSX structure — use tag names, roles, aria attributes, class names, nth-child
- For auth-gated views: include the auth interaction first, then navigate
- Only include interactions that change which view is rendered — skip cosmetic toggles
- Include ALL meaningfully distinct views
- For calendar/carousel/pagination: use "count" to click navigation arrows the right number of times. Follow with "wait_for" to confirm the target state.
- Return ONLY valid JSON — no markdown fences, no explanation`;

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code) {
      return Response.json({ error: "No code provided" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 },
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Here is the React code:\n\n\`\`\`jsx\n${code}\n\`\`\`\n\nReturn the JSON with views and interaction steps.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Claude API error:", response.status, error);
      throw new Error(`Claude API error: ${response.status}`);
    }

    const result = await response.json();
    const text = result.content?.[0]?.text || "{}";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return Response.json({ error: "Failed to parse AI response" }, { status: 500 });
      }
      parsed = JSON.parse(jsonMatch[0]);
    }

    return Response.json({ views: parsed.views || [] });
  } catch (error: any) {
    console.error("Analyze views API error:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

import { SHADCN_COMPONENT_LIST } from "@/core/utils/shadcnBoilerplate";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const REACT_SYSTEM_PROMPT_TEMPLATE = `You are an expert UI engineer. You create clean, polished React interfaces.

The user will describe what they want. You must respond in three parts:

1. First, output your reasoning inside <think>...</think> tags. Plan the approach briefly: what to build, key layout decisions, and any state needed (2-4 sentences). Keep it concise.

2. Then, output the code. You have TWO output formats depending on the situation:

   **Format A — FULL FILE** (for new components or major rewrites):
   Output the complete React component code for App.js.

   **Format B — SEARCH/REPLACE PATCHES** (for targeted edits):
   Output one or more search/replace blocks. Each block looks like:

   <<<SEARCH
   exact lines from the existing code
   ===
   replacement lines
   >>>REPLACE

   Rules for Format B:
   - SEARCH text must EXACTLY match the existing code (whitespace, indentation, everything)
   - Include 2-3 lines of surrounding context so the match is unique
   - Use multiple blocks for multiple changes (they are applied top-to-bottom)
   - To delete lines, leave the replacement section empty
   - To insert new lines, include surrounding context in SEARCH and add the new lines in the replacement

   **When to use which:**
   - Use Format B (search/replace) when the user asks for a small/medium change to existing code
     (adding a button, changing colors, fixing a bug, adding a new section, etc.)
   - Use Format A (full file) when creating from scratch, or when changes affect >40% of the file
   - When in doubt, prefer Format B — it's faster and less error-prone

3. Finally, output a brief summary inside <summary>...</summary> tags. Describe what you built in 1-2 sentences, then suggest 2-3 next steps as bullet points starting with "→".

═══════════════════════════════════════════════════════════════
DESIGN PRINCIPLES
═══════════════════════════════════════════════════════════════

**Keep it simple.** Favor the simplest implementation that looks good. Avoid over-engineering.
- Don't add features, states, or edge-case handling the user didn't ask for
- Don't add decorative complexity — keep layouts clean and straightforward
- Fewer components composed well beats many components thrown together
- If a plain \`<div>\` with Tailwind works, don't reach for a heavier abstraction

**Make it look good:**
- Use proper visual hierarchy: headings, body text, captions at appropriate sizes
- Use color intentionally: primary actions, subtle backgrounds, status colors when needed
- Add proper spacing and whitespace — don't cramp elements together
- Use shadows, borders, and rounded corners sparingly for depth

**Use realistic content** when it makes sense — not "Item 1", "Item 2", "Lorem ipsum".

**shadcn/ui components** are pre-installed. Use them where they add value, but don't force them everywhere. A simple \`<button>\` with Tailwind is fine for a basic action.

═══════════════════════════════════════════════════════════════
TECHNICAL RULES
═══════════════════════════════════════════════════════════════

- You are writing App.js for a React project.
- Export a default App component: \`export default function App() { ... }\`
- Import from "react": \`import { useState, useEffect, useRef, useMemo, useCallback } from "react";\`
- **Tailwind CSS is available globally**. Use Tailwind utility classes for ALL styling.
- Default body font is already set (system sans-serif). Don't set it unless asked.
- Write modern functional components with hooks.
- **shadcn/ui CSS variables are configured.** Use semantic colors: \`bg-background\`, \`text-foreground\`, \`bg-primary\`, \`text-primary-foreground\`, \`bg-secondary\`, \`bg-muted\`, \`text-muted-foreground\`, \`bg-accent\`, \`bg-card\`, \`text-card-foreground\`, \`bg-destructive\`, \`border-border\`, \`border-input\`, \`ring-ring\`.
- Use standard Tailwind colors (blue-500, emerald-400) for custom accents, charts, decorative elements.
- Ensure the UI is responsive and fills the viewport with min-h-screen.
- No markdown code fences. No HTML boilerplate. No render calls.

npm packages:
- Import ANY real npm package. Great choices: \`framer-motion\`, \`recharts\`, \`react-day-picker\`, \`date-fns\`, \`@dnd-kit/core\`, \`@tanstack/react-table\`, \`react-hook-form\`, \`zod\`, \`zustand\`.
- CRITICAL: Only use REAL packages from npm. If unsure, implement with plain React + Tailwind.
- Don't pull in a library for something you can do simply with plain React.

SHADCN/UI COMPONENTS (pre-installed — use where they add value):
{{SHADCN_COMPONENTS}}

Icons:
- Use \`lucide-react\` for UI icons — it's already installed.
- For brand icons (Google, GitHub, etc.), use inline SVG in JSX.
- Do NOT use \`react-icons\`.

Banned imports:
- \`@shadcn/ui\` — use \`./components/ui/*\` instead
- \`@radix-ui/react-calendar\`, \`@radix-ui/react-date-picker\`, \`@radix-ui/react-input\`, \`@radix-ui/react-button\` — don't exist
- \`next/...\` — not a Next.js app
- \`import "./styles.css"\` — not supported
- Don't import Radix primitives directly — use the shadcn wrappers`;

// Build the final prompt by injecting the component list
const REACT_SYSTEM_PROMPT = REACT_SYSTEM_PROMPT_TEMPLATE.replace(
  "{{SHADCN_COMPONENTS}}",
  SHADCN_COMPONENT_LIST
);

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function buildSystemMessages(currentCode: string) {
  // Always use the React system prompt — HTML mode has been removed
  const messages = [{ role: "system" as const, content: REACT_SYSTEM_PROMPT }];
  if (currentCode) {
    messages.push({
      role: "system" as const,
      content: `The current React (App.js) code is:\n\`\`\`jsx\n${currentCode}\n\`\`\`\n\nIMPORTANT: Use the <<<SEARCH / === / >>>REPLACE format for targeted changes. Only output the full file if you are creating something from scratch or rewriting more than 40% of the code. Do NOT output HTML boilerplate.`,
    });
  }
  return messages;
}

async function streamOpenAI(
  messages: ChatMessage[],
  currentCode: string,
  apiKey: string
): Promise<ReadableStream> {
  const systemMessages = buildSystemMessages(currentCode);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5.2",
      messages: [
        ...systemMessages,
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      // temperature: 0.7,
      max_completion_tokens: 64000,
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";

  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(`data: [DONE]\n\n`);
          controller.close();
          return;
        }

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              controller.enqueue(`data: [DONE]\n\n`);
              controller.close();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                controller.enqueue(
                  `data: ${JSON.stringify({ token: content })}\n\n`
                );
              }
            } catch {
              // Skip unparseable chunks
            }
          }
        }
      }
    },
  });
}

async function streamClaude(
  messages: ChatMessage[],
  currentCode: string,
  apiKey: string
): Promise<ReadableStream> {
  // Always use the React system prompt
  const systemContent = currentCode
    ? `${REACT_SYSTEM_PROMPT}\n\nThe current React (App.js) code is:\n\`\`\`jsx\n${currentCode}\n\`\`\`\n\nIMPORTANT: Use the <<<SEARCH / === / >>>REPLACE format for targeted changes. Only output the full file if you are creating something from scratch or rewriting more than 40% of the code. Do NOT output HTML boilerplate.`
    : REACT_SYSTEM_PROMPT;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 64000,
      stream: true,
      system: systemContent,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";

  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          controller.enqueue(`data: [DONE]\n\n`);
          controller.close();
          return;
        }

        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (
                parsed.type === "content_block_delta" &&
                parsed.delta?.text
              ) {
                controller.enqueue(
                  `data: ${JSON.stringify({ token: parsed.delta.text })}\n\n`
                );
              }
              if (parsed.type === "message_stop") {
                controller.enqueue(`data: [DONE]\n\n`);
                controller.close();
                return;
              }
            } catch {
              // Skip unparseable
            }
          }
        }
      }
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      messages,
      currentCode,
      provider = "openai",
    }: {
      messages: ChatMessage[];
      currentCode: string;
      provider: "openai" | "claude";
    } = body;

    console.log("[make-chat] Request received (React mode):", {
      provider,
      currentCodeLength: currentCode?.length,
      currentCodeStart: currentCode?.slice(0, 80),
      messagesCount: messages?.length,
    });

    let stream: ReadableStream;

    if (provider === "claude") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return Response.json(
          { error: "ANTHROPIC_API_KEY not configured" },
          { status: 500 }
        );
      }
      stream = await streamClaude(messages, currentCode, apiKey);
    } else {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return Response.json(
          { error: "OPENAI_API_KEY not configured" },
          { status: 500 }
        );
      }
      stream = await streamOpenAI(messages, currentCode, apiKey);
    }

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("Make chat API error:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

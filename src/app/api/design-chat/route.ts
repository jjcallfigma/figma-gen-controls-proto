import { NextRequest } from "next/server";
import { AI_TOOLS, toOpenAITools, toAnthropicTools } from "@/core/ai/tools";
import { executeTool, type CanvasContext } from "@/core/ai/toolExecutor";
import { DESIGN_PARTNER_SYSTEM_PROMPT } from "@/core/ai/systemPrompt";
import { SHADCN_COMPONENT_LIST } from "@/core/utils/shadcnBoilerplate";
import {
  applySearchReplace,
  extractStreamedCode,
  isSearchReplaceFormat,
  validateJSX,
} from "@/core/utils/makeUtils";

export const runtime = "nodejs";

// Maximum number of tool-calling rounds to prevent infinite loops
const MAX_TOOL_ROUNDS = 25;

// ─── Types ──────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface DesignChatRequest {
  messages: ChatMessage[];
  designTree: string;
  canvasContext?: CanvasContext;
  provider: "openai" | "claude";
}

// ─── SSE event helpers ──────────────────────────────────────────────

function sseEvent(data: any): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ─── Edit Make helper ────────────────────────────────────────────────

const MAKE_SYSTEM_PROMPT_TEMPLATE = `You are an expert UI engineer. You create clean, polished React interfaces.

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

const MAKE_SYSTEM_PROMPT = MAKE_SYSTEM_PROMPT_TEMPLATE.replace(
  "{{SHADCN_COMPONENTS}}",
  SHADCN_COMPONENT_LIST
);

async function executeEditMake(
  args: { makeId: string; instructions: string },
  canvasContext: CanvasContext | undefined,
  provider: "openai" | "claude",
  controller: ReadableStreamDefaultController
): Promise<string> {
  const makeObj = canvasContext?.objects[args.makeId];
  if (!makeObj || makeObj.type !== "make") {
    return `Make object "${args.makeId}" not found or is not a Make.`;
  }

  const rawCode = (makeObj as any).properties?.code || "";
  // Strip any preview instrumentation attributes so the AI sees clean code
  const currentCode = rawCode
    .replace(/\s+data-make-node="[^"]*"/g, "")
    .replace(/\s+data-make-name="[^"]*"/g, "");
  const systemContent = currentCode
    ? `${MAKE_SYSTEM_PROMPT}\n\nThe current React (App.js) code is:\n\`\`\`jsx\n${currentCode}\n\`\`\`\n\nIMPORTANT: Use the <<<SEARCH / === / >>>REPLACE format for targeted changes. Only output the full file if you are creating something from scratch or rewriting more than 40% of the code. Do NOT output HTML boilerplate.`
    : MAKE_SYSTEM_PROMPT;

  const userMessage = args.instructions;
  let fullResponse = "";

  if (provider === "claude") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return "ANTHROPIC_API_KEY not configured";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 32000,
        stream: true,
        system: systemContent,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return `Claude API error: ${response.status} - ${error}`;
    }

    // Stream and buffer the response
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.type === "content_block_delta" && parsed.delta?.text) {
            fullResponse += parsed.delta.text;
            controller.enqueue(sseEvent({ type: "make_code_token", token: parsed.delta.text, makeId: args.makeId }));
          }
        } catch { /* skip */ }
      }
    }
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return "OPENAI_API_KEY not configured";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userMessage },
        ],
        max_completion_tokens: 64000,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return `OpenAI API error: ${response.status} - ${error}`;
    }

    // Stream and buffer the response
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullResponse += content;
            controller.enqueue(sseEvent({ type: "make_code_token", token: content, makeId: args.makeId }));
          }
        } catch { /* skip */ }
      }
    }
  }

  console.log("[design-chat] edit_make response length:", fullResponse.length);

  // Parse the LLM response to extract clean code (same logic as useMakeChat)
  let codePortion = fullResponse;
  const thinkEnd = codePortion.indexOf("</think>");
  if (thinkEnd !== -1) {
    codePortion = codePortion.slice(thinkEnd + 8);
  }
  const summaryStart = codePortion.indexOf("<summary>");
  if (summaryStart !== -1) {
    codePortion = codePortion.slice(0, summaryStart);
  }
  codePortion = codePortion.trim();

  // If model didn't use <think> tags, the whole output is code + summary
  if (thinkEnd === -1) {
    const rawSummaryStart = codePortion.indexOf("<summary>");
    if (rawSummaryStart !== -1) {
      codePortion = codePortion.slice(0, rawSummaryStart).trim();
    }
  }

  let newCode = currentCode;
  if (codePortion) {
    if (isSearchReplaceFormat(codePortion)) {
      const { result, applied } = applySearchReplace(currentCode, codePortion);
      if (applied && result) {
        newCode = result;
      }
      console.log("[design-chat] edit_make search/replace applied:", applied);

      // If search/replace produced invalid JSX, try extracting a full code block as fallback
      if (newCode !== currentCode) {
        const validation = validateJSX(newCode);
        if (!validation.valid) {
          console.warn("[design-chat] edit_make: search/replace produced invalid JSX:", validation.error);
          const fallback = extractStreamedCode(codePortion);
          if (fallback) {
            const fallbackValidation = validateJSX(fallback);
            if (fallbackValidation.valid) {
              newCode = fallback;
              console.log("[design-chat] edit_make: full-file fallback succeeded");
            }
            // If fallback also fails validation, still use the search/replace result
            // and let the client-side auto-fix handle it
          }
        }
      }
    } else {
      const cleaned = extractStreamedCode(codePortion);
      if (cleaned) {
        newCode = cleaned;
      }
      console.log("[design-chat] edit_make extracted code length:", cleaned?.length);
    }
  }

  // Strip any instrumentation attributes the AI may have reproduced
  if (newCode) {
    newCode = newCode
      .replace(/\s+data-make-node="[^"]*"/g, "")
      .replace(/\s+data-make-name="[^"]*"/g, "");
  }

  // Log a warning if final code has syntax issues, but still send it —
  // the client-side iframe + auto-fix is the proper safety net.
  if (newCode !== currentCode) {
    const finalCheck = validateJSX(newCode);
    if (!finalCheck.valid) {
      console.warn("[design-chat] edit_make: code may have syntax issues (will rely on client auto-fix):", finalCheck.error);
    }
  }

  // Send just the clean code to the client
  if (newCode && newCode !== currentCode) {
    controller.enqueue(
      sseEvent({
        type: "make_edit",
        makeId: args.makeId,
        code: newCode,
      })
    );
    console.log("[design-chat] edit_make: sent code update, length:", newCode.length);
  } else {
    console.log("[design-chat] edit_make: no code change detected");
  }

  // Extract summary for the tool result
  const summaryMatch = fullResponse.match(/<summary>([\s\S]*?)<\/summary>/);
  const summary = summaryMatch
    ? summaryMatch[1].trim()
    : `Updated Make "${makeObj.name}"`;

  return `Successfully edited Make "${makeObj.name}". ${summary}`;
}

async function executeCreateMake(
  args: { name: string; instructions: string; width?: number; height?: number; referenceMakeId?: string },
  canvasContext: CanvasContext | undefined,
  provider: "openai" | "claude",
  controller: ReadableStreamDefaultController
): Promise<string> {
  // If a reference Make is provided, use its code as a starting point
  let referenceCode = "";
  if (args.referenceMakeId && canvasContext?.objects[args.referenceMakeId]) {
    const refObj = canvasContext.objects[args.referenceMakeId];
    if (refObj.type === "make") {
      referenceCode = (refObj as any).properties?.code || "";
    }
  }

  const systemContent = referenceCode
    ? `${MAKE_SYSTEM_PROMPT}\n\nThe reference React (App.js) code to base your work on:\n\`\`\`jsx\n${referenceCode}\n\`\`\`\n\nCreate a variation based on this code following the user's instructions. Output the complete file.`
    : MAKE_SYSTEM_PROMPT;

  let fullResponse = "";

  if (provider === "claude") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return "ANTHROPIC_API_KEY not configured";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 32000,
        stream: true,
        system: systemContent,
        messages: [{ role: "user", content: args.instructions }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return `Claude API error: ${response.status} - ${error}`;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.type === "content_block_delta" && parsed.delta?.text) {
            fullResponse += parsed.delta.text;
            controller.enqueue(sseEvent({ type: "make_code_token", token: parsed.delta.text, makeId: "__new__" }));
          }
        } catch { /* skip */ }
      }
    }
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return "OPENAI_API_KEY not configured";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: args.instructions },
        ],
        max_completion_tokens: 64000,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return `OpenAI API error: ${response.status} - ${error}`;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullResponse += content;
            controller.enqueue(sseEvent({ type: "make_code_token", token: content, makeId: "__new__" }));
          }
        } catch { /* skip */ }
      }
    }
  }

  // Parse the code — extract what's between </think> and <summary>
  let codePortion = fullResponse;

  // Strip <think> block
  const thinkEnd = codePortion.indexOf("</think>");
  if (thinkEnd !== -1) {
    codePortion = codePortion.slice(thinkEnd + 8);
  } else if (codePortion.trimStart().startsWith("<think>") || codePortion.trimStart().startsWith("<think ")) {
    // Unclosed <think> — try to find first code fence or import/export as the real start
    const importIdx = codePortion.indexOf("import ");
    const exportIdx = codePortion.indexOf("export ");
    const fenceIdx = codePortion.indexOf("```");
    const starts = [importIdx, exportIdx, fenceIdx].filter((i) => i > 0);
    if (starts.length > 0) {
      codePortion = codePortion.slice(Math.min(...starts));
    }
  }

  // Strip <summary> suffix — but keep code that appears AFTER <summary> as a fallback
  const summaryStart = codePortion.indexOf("<summary>");
  const summaryEnd = codePortion.indexOf("</summary>");
  if (summaryStart !== -1) {
    const beforeSummary = codePortion.slice(0, summaryStart).trim();
    const afterSummary = summaryEnd !== -1
      ? codePortion.slice(summaryEnd + 10).trim()
      : "";
    // Use the portion that looks more like code (has import/export or code fences)
    codePortion = beforeSummary || afterSummary;
  }
  codePortion = codePortion.trim();

  let code = "";
  if (codePortion) {
    const cleaned = extractStreamedCode(codePortion);
    if (cleaned) code = cleaned;
  }

  // Fallback: try extracting code from the full response if the above failed
  if (!code) {
    const fallback = extractStreamedCode(fullResponse);
    if (fallback && (fallback.includes("export") || fallback.includes("function") || fallback.includes("return"))) {
      code = fallback;
      console.warn("[design-chat] create_make: used fallback code extraction from full response");
    }
  }

  if (!code) {
    console.error("[design-chat] create_make: failed to extract code. Response length:", fullResponse.length,
      "First 200 chars:", fullResponse.slice(0, 200));
    return "Failed to generate code for the new Make.";
  }

  // Warn if code has syntax issues, but still send it —
  // the client-side iframe + auto-fix is the proper safety net.
  const validation = validateJSX(code);
  if (!validation.valid) {
    console.warn("[design-chat] create_make: code may have syntax issues (will rely on client auto-fix):", validation.error);
  }

  // Send make_created event to client with all info needed to create the object
  controller.enqueue(
    sseEvent({
      type: "make_created",
      name: args.name,
      code,
      width: args.width || 400,
      height: args.height || 400,
    })
  );

  const summaryMatch = fullResponse.match(/<summary>([\s\S]*?)<\/summary>/);
  const summary = summaryMatch
    ? summaryMatch[1].trim()
    : `Created Make "${args.name}"`;

  return `Successfully created Make "${args.name}". ${summary}`;
}

// ─── OpenAI agentic loop ────────────────────────────────────────────

async function runOpenAIAgentLoop(
  messages: ChatMessage[],
  designTree: string,
  canvasContext: CanvasContext | undefined,
  apiKey: string,
  controller: ReadableStreamDefaultController
) {
  const systemMessages: any[] = [
    { role: "system", content: DESIGN_PARTNER_SYSTEM_PROMPT },
  ];
  if (designTree) {
    systemMessages.push({
      role: "system",
      content: `The user's current selection (design tree):\n\`\`\`html\n${designTree}\n\`\`\``,
    });
  }
  // Include persisted design system context
  if (canvasContext?.designSystem) {
    systemMessages.push({
      role: "system",
      content: `Previously extracted design system and decisions:\n${canvasContext.designSystem}`,
    });
  }

  // Build the conversation with tool-calling messages
  const conversation: any[] = [
    ...systemMessages,
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const tools = toOpenAITools(AI_TOOLS);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Make a non-streaming call to check for tool calls
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: conversation,
        tools,
        tool_choice: "auto",
        max_completion_tokens: 64000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const assistantMessage = choice?.message;

    if (!assistantMessage) {
      throw new Error("No response from OpenAI");
    }

    // Check if there are tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      // If the assistant included reasoning text alongside tool calls, stream it as thinking
      if (assistantMessage.content && assistantMessage.content.trim()) {
        controller.enqueue(
          sseEvent({ type: "thinking", content: assistantMessage.content.trim() })
        );
      }

      // Add the assistant message with tool calls to the conversation
      conversation.push(assistantMessage);

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, any> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          toolArgs = {};
        }

        // Stream the tool call event to the client
        controller.enqueue(
          sseEvent({
            type: "tool_call",
            id: toolCall.id,
            name: toolName,
            args: toolArgs,
          })
        );

        // ── Intercept present_choices: forward to client, don't execute server-side
        if (toolName === "present_choices") {
          controller.enqueue(
            sseEvent({
              type: "choices",
              id: toolCall.id,
              question: toolArgs.question || "",
              mode: toolArgs.mode || "single",
              options: toolArgs.options || [],
            })
          );

          // Return synthetic result so the LLM knows to wrap up
          conversation.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content:
              "Choices presented to the user in the chat UI. Their response will arrive in the next message. End your current response naturally — do not repeat the options in text.",
          });
          continue;
        }

        // ── Intercept present_content_blocks: forward structured content to client
        if (toolName === "present_content_blocks") {
          controller.enqueue(
            sseEvent({
              type: "content_blocks",
              id: toolCall.id,
              title: toolArgs.title || "",
              blocks: toolArgs.blocks || [],
            })
          );

          const blockCount = (toolArgs.blocks || []).length;
          conversation.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content:
              `Content blocks (${blockCount} cards) presented to the user in the chat UI. ` +
              "The user can expand each card for details. " +
              "Continue with a brief wrap-up or follow-up. Do NOT repeat the block contents in text.",
          });
          continue;
        }

        // ── Intercept edit_make: generate code via make-chat LLM call
        if (toolName === "edit_make") {
          const editResult = await executeEditMake(
            toolArgs as { makeId: string; instructions: string },
            canvasContext,
            "openai",
            controller
          );

          controller.enqueue(
            sseEvent({
              type: "tool_result",
              id: toolCall.id,
              name: toolName,
              summary: `Edited Make "${canvasContext?.objects[toolArgs.makeId]?.name || toolArgs.makeId}"`,
            })
          );

          conversation.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: editResult,
          });
          continue;
        }

        // ── Intercept create_make: generate code and create a new Make
        if (toolName === "create_make") {
          const createResult = await executeCreateMake(
            toolArgs as { name: string; instructions: string; width?: number; height?: number; referenceMakeId?: string },
            canvasContext,
            "openai",
            controller
          );

          controller.enqueue(
            sseEvent({
              type: "tool_result",
              id: toolCall.id,
              name: toolName,
              summary: `Created Make "${toolArgs.name}"`,
            })
          );

          conversation.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: createResult,
          });
          continue;
        }

        // ── Intercept extract_views: forward to client, pause agent loop
        if (toolName === "extract_views") {
          const views = toolArgs.views || [];
          const makeName = canvasContext?.objects[toolArgs.makeId]?.name || toolArgs.makeId;

          controller.enqueue(
            sseEvent({
              type: "extract_views",
              makeId: toolArgs.makeId,
              views,
            })
          );

          const viewNames = views.map((v: any) => v.name).join(", ");

          controller.enqueue(
            sseEvent({
              type: "tool_result",
              id: toolCall.id,
              name: toolName,
              summary: `Extracting ${views.length} view(s) from "${makeName}"`,
            })
          );

          conversation.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content:
              `Extraction of ${views.length} view(s) from "${makeName}" (${viewNames}) has been triggered on the client. ` +
              `The results (success/failure per view, object IDs, positions) will arrive in the next message. ` +
              `End your current response naturally — tell the user what's being extracted and that results are coming. ` +
              `Do NOT proceed with follow-up tasks (like adding labels) until you receive the extraction results.`,
          });
          continue;
        }

        // Execute the tool
        const ctx = canvasContext || {
          objects: {},
          pages: {},
          pageIds: [],
          currentPageId: "",
          selectedIds: [],
        };
        const result = executeTool(toolName, toolArgs, ctx);

        // Stream the tool result event
        controller.enqueue(
          sseEvent({
            type: "tool_result",
            id: toolCall.id,
            name: toolName,
            summary: result.summary,
          })
        );

        // If the tool returned operations, stream them to the client
        if (result.operations && result.operations.length > 0) {
          controller.enqueue(
            sseEvent({
              type: "operations",
              operations: result.operations,
              explanation: result.summary,
            })
          );
        }

        // If the tool wants to change the selection, stream it to the client
        if (result.selectedIds && result.selectedIds.length > 0) {
          controller.enqueue(
            sseEvent({
              type: "selection",
              objectIds: result.selectedIds,
            })
          );
        }

        // Add the tool result to the conversation
        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result.result,
        });
      }

      // Continue the loop for the next round
      continue;
    }

    // No tool calls — this is the final text response
    // Stream it token by token
    const finalText = assistantMessage.content || "";
    if (finalText) {
      // Simulate streaming by sending chunks with yields so the stream flushes
      const chunkSize = 20;
      for (let i = 0; i < finalText.length; i += chunkSize) {
        controller.enqueue(
          sseEvent({ type: "token", content: finalText.slice(i, i + chunkSize) })
        );
        // Yield to event loop so the stream flushes to the client incrementally
        await new Promise((r) => setTimeout(r, 10));
      }
    }

    // Done
    controller.enqueue("data: [DONE]\n\n");
    return;
  }

  // Exceeded max rounds
  controller.enqueue(
    sseEvent({
      type: "token",
      content: "I've reached my analysis limit for this request. Here's what I found so far — please ask a follow-up question for more details.",
    })
  );
  controller.enqueue("data: [DONE]\n\n");
}

// ─── Anthropic agentic loop ─────────────────────────────────────────

async function runClaudeAgentLoop(
  messages: ChatMessage[],
  designTree: string,
  canvasContext: CanvasContext | undefined,
  apiKey: string,
  controller: ReadableStreamDefaultController
) {
  let systemContent = DESIGN_PARTNER_SYSTEM_PROMPT;
  if (designTree) {
    systemContent += `\n\nThe user's current selection (design tree):\n\`\`\`html\n${designTree}\n\`\`\``;
  }
  // Include persisted design system context
  if (canvasContext?.designSystem) {
    systemContent += `\n\nPreviously extracted design system and decisions:\n${canvasContext.designSystem}`;
  }

  const tools = toAnthropicTools(AI_TOOLS);

  // Build anthropic messages format
  const conversation: any[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 32000,
        system: systemContent,
        tools,
        messages: conversation,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    // Check if there are tool uses in the content
    const contentBlocks = data.content || [];
    const toolUseBlocks = contentBlocks.filter(
      (b: any) => b.type === "tool_use"
    );
    const textBlocks = contentBlocks.filter((b: any) => b.type === "text");

    // Stream any text that came alongside tool calls
    if (toolUseBlocks.length > 0) {
      // Text alongside tool calls = reasoning/thinking — stream as thinking
      for (const textBlock of textBlocks) {
        if (textBlock.text && textBlock.text.trim()) {
          controller.enqueue(
            sseEvent({ type: "thinking", content: textBlock.text.trim() })
          );
        }
      }
    } else {
      // No tool calls — this is the final text response, stream as tokens
      for (const textBlock of textBlocks) {
        if (textBlock.text) {
          const chunkSize = 20;
          for (let i = 0; i < textBlock.text.length; i += chunkSize) {
            controller.enqueue(
              sseEvent({
                type: "token",
                content: textBlock.text.slice(i, i + chunkSize),
              })
            );
            // Yield to event loop so the stream flushes to the client incrementally
            await new Promise((r) => setTimeout(r, 10));
          }
        }
      }
    }

    if (toolUseBlocks.length > 0) {
      // Add assistant message with tool use
      conversation.push({
        role: "assistant",
        content: contentBlocks,
      });

      // Execute tool calls and build tool results
      const toolResults: any[] = [];

      for (const toolUse of toolUseBlocks) {
        const toolName = toolUse.name;
        const toolArgs = toolUse.input || {};

        // Stream the tool call event
        controller.enqueue(
          sseEvent({
            type: "tool_call",
            id: toolUse.id,
            name: toolName,
            args: toolArgs,
          })
        );

        // ── Intercept present_choices: forward to client, don't execute server-side
        if (toolName === "present_choices") {
          controller.enqueue(
            sseEvent({
              type: "choices",
              id: toolUse.id,
              question: toolArgs.question || "",
              mode: toolArgs.mode || "single",
              options: toolArgs.options || [],
            })
          );

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content:
              "Choices presented to the user in the chat UI. Their response will arrive in the next message. End your current response naturally — do not repeat the options in text.",
          });
          continue;
        }

        // ── Intercept present_content_blocks: forward structured content to client
        if (toolName === "present_content_blocks") {
          controller.enqueue(
            sseEvent({
              type: "content_blocks",
              id: toolUse.id,
              title: toolArgs.title || "",
              blocks: toolArgs.blocks || [],
            })
          );

          const blockCount = (toolArgs.blocks || []).length;
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content:
              `Content blocks (${blockCount} cards) presented to the user in the chat UI. ` +
              "The user can expand each card for details. " +
              "Continue with a brief wrap-up or follow-up. Do NOT repeat the block contents in text.",
          });
          continue;
        }

        // ── Intercept edit_make: generate code via make-chat LLM call
        if (toolName === "edit_make") {
          const editResult = await executeEditMake(
            toolArgs as { makeId: string; instructions: string },
            canvasContext,
            "claude",
            controller
          );

          controller.enqueue(
            sseEvent({
              type: "tool_result",
              id: toolUse.id,
              name: toolName,
              summary: `Edited Make "${canvasContext?.objects[toolArgs.makeId]?.name || toolArgs.makeId}"`,
            })
          );

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: editResult,
          });
          continue;
        }

        // ── Intercept create_make: generate code and create a new Make
        if (toolName === "create_make") {
          const createResult = await executeCreateMake(
            toolArgs as { name: string; instructions: string; width?: number; height?: number; referenceMakeId?: string },
            canvasContext,
            "claude",
            controller
          );

          controller.enqueue(
            sseEvent({
              type: "tool_result",
              id: toolUse.id,
              name: toolName,
              summary: `Created Make "${toolArgs.name}"`,
            })
          );

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: createResult,
          });
          continue;
        }

        // ── Intercept extract_views: forward to client, pause agent loop
        if (toolName === "extract_views") {
          const views = toolArgs.views || [];
          const makeName = canvasContext?.objects[toolArgs.makeId]?.name || toolArgs.makeId;

          controller.enqueue(
            sseEvent({
              type: "extract_views",
              makeId: toolArgs.makeId,
              views,
            })
          );

          const viewNames = views.map((v: any) => v.name).join(", ");

          controller.enqueue(
            sseEvent({
              type: "tool_result",
              id: toolUse.id,
              name: toolName,
              summary: `Extracting ${views.length} view(s) from "${makeName}"`,
            })
          );

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content:
              `Extraction of ${views.length} view(s) from "${makeName}" (${viewNames}) has been triggered on the client. ` +
              `The results (success/failure per view, object IDs, positions) will arrive in the next message. ` +
              `End your current response naturally — tell the user what's being extracted and that results are coming. ` +
              `Do NOT proceed with follow-up tasks (like adding labels) until you receive the extraction results.`,
          });
          continue;
        }

        // Execute the tool
        const ctx = canvasContext || {
          objects: {},
          pages: {},
          pageIds: [],
          currentPageId: "",
          selectedIds: [],
        };
        const result = executeTool(toolName, toolArgs, ctx);

        // Stream the tool result event
        controller.enqueue(
          sseEvent({
            type: "tool_result",
            id: toolUse.id,
            name: toolName,
            summary: result.summary,
          })
        );

        // If operations, stream them
        if (result.operations && result.operations.length > 0) {
          controller.enqueue(
            sseEvent({
              type: "operations",
              operations: result.operations,
              explanation: result.summary,
            })
          );
        }

        // If selection change, stream it
        if (result.selectedIds && result.selectedIds.length > 0) {
          controller.enqueue(
            sseEvent({
              type: "selection",
              objectIds: result.selectedIds,
            })
          );
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result.result,
        });
      }

      // Add tool results as a user message (Anthropic format)
      conversation.push({
        role: "user",
        content: toolResults,
      });

      // Continue the loop
      continue;
    }

    // No tool calls, this is the final response
    // (text was already streamed above)
    if (data.stop_reason === "end_turn" || data.stop_reason === "stop_sequence") {
      controller.enqueue("data: [DONE]\n\n");
      return;
    }

    controller.enqueue("data: [DONE]\n\n");
    return;
  }

  // Max rounds exceeded
  controller.enqueue(
    sseEvent({
      type: "token",
      content:
        "\n\nI've reached my analysis limit for this request. Please ask a follow-up for more details.",
    })
  );
  controller.enqueue("data: [DONE]\n\n");
}

// ─── API handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      messages,
      designTree,
      canvasContext,
      provider = "openai",
    }: DesignChatRequest = body;

    console.log("[design-chat] Request received:", {
      provider,
      designTreeLength: designTree?.length,
      messagesCount: messages?.length,
      hasCanvasContext: !!canvasContext,
      objectCount: canvasContext ? Object.keys(canvasContext.objects || {}).length : 0,
    });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (provider === "claude") {
            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) {
              controller.enqueue(
                sseEvent({ type: "error", message: "ANTHROPIC_API_KEY not configured" })
              );
              controller.enqueue("data: [DONE]\n\n");
              controller.close();
              return;
            }
            await runClaudeAgentLoop(
              messages,
              designTree,
              canvasContext,
              apiKey,
              controller
            );
          } else {
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
              controller.enqueue(
                sseEvent({ type: "error", message: "OPENAI_API_KEY not configured" })
              );
              controller.enqueue("data: [DONE]\n\n");
              controller.close();
              return;
            }
            await runOpenAIAgentLoop(
              messages,
              designTree,
              canvasContext,
              apiKey,
              controller
            );
          }
        } catch (error: any) {
          console.error("[design-chat] Agent loop error:", error);
          controller.enqueue(
            sseEvent({
              type: "error",
              message: error.message || "Internal server error",
            })
          );
          controller.enqueue("data: [DONE]\n\n");
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("Design chat API error:", error);
    return Response.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

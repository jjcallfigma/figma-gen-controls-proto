import { NextRequest } from "next/server";

export const runtime = "nodejs";

interface GenAIChatRequest {
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  temperature?: number;
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: GenAIChatRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { systemPrompt, messages, maxTokens = 4096, temperature = 0.5 } = body;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: maxTokens,
            temperature,
            system: systemPrompt,
            messages,
            stream: true,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          controller.enqueue(
            new TextEncoder().encode(
              sseEvent({ type: "error", message: `Anthropic API error ${response.status}: ${errorText}` }),
            ),
          );
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "event: message_start" || trimmed === "event: message_stop" ||
                trimmed === "event: message_delta" || trimmed === "event: content_block_start" ||
                trimmed === "event: content_block_stop" || trimmed === "event: content_block_delta" ||
                trimmed === "event: ping") {
              continue;
            }

            if (trimmed.startsWith("data: ")) {
              try {
                const data = JSON.parse(trimmed.slice(6));

                if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
                  controller.enqueue(
                    new TextEncoder().encode(
                      sseEvent({ type: "token", content: data.delta.text }),
                    ),
                  );
                }

                if (data.type === "message_delta") {
                  if (data.delta?.stop_reason === "max_tokens") {
                    controller.enqueue(
                      new TextEncoder().encode(
                        sseEvent({ type: "error", message: "Response truncated: model hit max_tokens. Try a simpler prompt or fewer controls." }),
                      ),
                    );
                  }
                  if (data.usage) {
                    controller.enqueue(
                      new TextEncoder().encode(
                        sseEvent({
                          type: "usage",
                          inputTokens: data.usage.input_tokens,
                          outputTokens: data.usage.output_tokens,
                        }),
                      ),
                    );
                  }
                }
              } catch {
                // skip malformed SSE lines
              }
            }
          }
        }

        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          new TextEncoder().encode(sseEvent({ type: "error", message })),
        );
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
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
}

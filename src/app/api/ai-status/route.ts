import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      status: "error",
      error: "ANTHROPIC_API_KEY not configured",
    });
  }

  const keyPreview = apiKey.slice(0, 10) + "..." + apiKey.slice(-4);

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
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    const rateLimits = {
      requestsLimit: response.headers.get("anthropic-ratelimit-requests-limit"),
      requestsRemaining: response.headers.get("anthropic-ratelimit-requests-remaining"),
      requestsReset: response.headers.get("anthropic-ratelimit-requests-reset"),
      tokensLimit: response.headers.get("anthropic-ratelimit-tokens-limit"),
      tokensRemaining: response.headers.get("anthropic-ratelimit-tokens-remaining"),
      tokensReset: response.headers.get("anthropic-ratelimit-tokens-reset"),
    };

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(errorBody);
        errorMessage = parsed?.error?.message || errorMessage;
      } catch { /* use status */ }

      return NextResponse.json({
        status: "error",
        error: errorMessage,
        httpStatus: response.status,
        keyPreview,
        rateLimits,
      });
    }

    const data = await response.json();

    return NextResponse.json({
      status: "ok",
      keyPreview,
      model: data.model,
      rateLimits,
      usage: data.usage,
    });
  } catch (err: any) {
    return NextResponse.json({
      status: "error",
      error: err.message || "Network error",
      keyPreview,
    });
  }
}

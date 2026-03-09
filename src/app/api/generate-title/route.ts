import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();
  if (!prompt) {
    return NextResponse.json({ title: "Chat" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ title: null });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 30,
        messages: [
          {
            role: "user",
            content: `Give this design editing request a very short title (2-5 words, no quotes, no punctuation). Just the title, nothing else.\n\nRequest: "${prompt.slice(0, 300)}"`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ title: null });
    }

    const data = await response.json();
    const title = data.content?.[0]?.text?.trim();
    return NextResponse.json({ title: title ? title.slice(0, 60) : null });
  } catch {
    return NextResponse.json({ title: null });
  }
}

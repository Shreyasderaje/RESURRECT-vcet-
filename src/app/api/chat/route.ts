import { NextRequest, NextResponse } from "next/server";
import { GeminiClientError } from "@/lib/ai/gemini-client";
import { ChatApiRequestSchema } from "@/lib/ai/schemas";
import { processChatTurn, StateConflictError } from "@/lib/ai/state-machine";

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const parsed = ChatApiRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid request payload.",
        details: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  try {
    const result = await processChatTurn(parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof StateConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof GeminiClientError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    const msg =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}

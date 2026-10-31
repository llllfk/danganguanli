import { NextRequest } from "next/server";
import { classifyPersonPiecesProgressive } from "@/lib/repos/archive";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    personCode?: string;
    skipVision?: boolean;
  };
  const personCode = body.personCode || "00001";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      try {
        await classifyPersonPiecesProgressive(personCode, {
          skipVision: body.skipVision,
          onEvent: send,
        });
      } catch (e) {
        send({
          type: "error",
          error: e instanceof Error ? e.message : "分类失败",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

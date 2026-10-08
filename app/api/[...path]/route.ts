import { NextResponse } from "next/server";
import { z } from "zod";
import { actor, HttpError, mutationGuard } from "@/lib/auth";
import * as r from "@/lib/receipts";
import { mode } from "@/lib/flowaccount/client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function handle(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const a = await actor();
    const { path } = await params;
    const [kind, id, action] = path;
    const u = new URL(req.url);
    if (req.method === "GET") {
      if (kind === "me") return NextResponse.json({ ...a, mode: mode() });
      if (kind === "masters") return NextResponse.json(await r.masters(a));
      if (kind === "receipts" && !id)
        return NextResponse.json(
          await r.list(
            a,
            (u.searchParams.get("q") || "").slice(0, 100),
            u.searchParams.get("status") || "",
          ),
        );
      if (kind === "receipts" && id)
        return NextResponse.json(
          action === "history" ? await r.history(a, id) : await r.read(a, id),
        );
    } else {
      mutationGuard(req);
      const length = Number(req.headers.get("content-length") || 0);
      if (length > 100000) throw new HttpError(413, "ข้อมูลใหญ่เกินไป");
      const text = await req.text();
      if (text.length > 100000) throw new HttpError(413, "ข้อมูลใหญ่เกินไป");
      const body = JSON.parse(text);
      if (kind === "masters" && req.method === "POST")
        return NextResponse.json(await r.masters(a, true));
      if (kind === "receipts" && req.method === "POST" && !id)
        return NextResponse.json(await r.save(a, body));
      if (kind === "receipts" && id && req.method === "PUT")
        return NextResponse.json(
          await r.save(
            a,
            body.draft,
            id,
            z.number().int().positive().parse(body.version),
          ),
        );
      if (
        kind === "receipts" &&
        id &&
        action === "submit" &&
        req.method === "POST"
      )
        return NextResponse.json(
          await r.submit(
            a,
            id,
            z.number().int().positive().parse(body.version),
          ),
        );
      if (
        kind === "receipts" &&
        id &&
        action === "reconcile" &&
        req.method === "POST"
      )
        return NextResponse.json(await r.reconcile(a, id, body.flowId));
    }
    throw new HttpError(404, "ไม่พบ API");
  } catch (e) {
    if (e instanceof HttpError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return NextResponse.json(
        { error: "ข้อมูลไม่ถูกต้อง ตรวจชื่อ วันที่ จำนวน และราคา" },
        { status: 400 },
      );
    console.error("Request failed", e instanceof Error ? e.name : "Error");
    return NextResponse.json(
      {
        error:
          "บริการไม่พร้อม กรุณาตรวจการตั้งค่าหรือลองใหม่ หากเพิ่งส่งเอกสาร ให้ตรวจสถานะก่อนส่งซ้ำ",
      },
      { status: 503 },
    );
  }
}
export { handle as GET, handle as POST, handle as PUT };

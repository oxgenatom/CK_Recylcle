import { actor, HttpError, mutationGuard } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountInput, createAccount } from "@/lib/accounts";
import { hashPassword, validPassword, verifyPassword } from "@/lib/passwords";
import { setReviewPermissions } from '@/lib/permissions';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(req: Request) {
  try {
    const a = await actor(true);
    const p = await db().query(
      "SELECT username,display_name,must_change FROM password_accounts WHERE identity=$1 AND company_id=$2",
      [a.id,a.company],
    );
    const self = p.rows[0];
    if (req.method === "GET") {
      if (new URL(req.url).searchParams.has("self"))
        return Response.json(
          { self, role: a.role },
          { headers: { "Cache-Control": "private, no-store" } },
        );
      if (!self || self.must_change || a.role !== "admin")
        throw new HttpError(403, "เฉพาะผู้ดูแล");
      return Response.json(
        (
          await db().query(
            "SELECT a.identity,a.username,a.display_name,a.must_change,m.role,m.active,m.can_review,m.can_approve FROM password_accounts a JOIN memberships m ON m.identity=a.identity AND m.company_id=a.company_id WHERE a.company_id=$1 ORDER BY a.username",
            [a.company],
          )
        ).rows,
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    mutationGuard(req);
    const text = await req.text();
    if (text.length > 10000) throw new HttpError(413, "ข้อมูลใหญ่เกินไป");
    const b = JSON.parse(text);
    if (b.action === "changePassword") {
      if (!self || !validPassword(b.password))
        throw new HttpError(400, "รหัสผ่านต้องอย่างน้อย 12 ตัวอักษร");
      const h = await db().query(
        "SELECT password_hash FROM password_accounts WHERE identity=$1",
        [a.id],
      );
      if (
        !(await verifyPassword(
          b.currentPassword || "",
          h.rows[0].password_hash,
        ))
      )
        throw new HttpError(400, "รหัสผ่านเดิมไม่ถูกต้อง");
      if (await verifyPassword(b.password, h.rows[0].password_hash))
        throw new HttpError(400, "ใช้รหัสผ่านใหม่ที่ต่างจากเดิม");
      const hash = await hashPassword(b.password);
      const result = await db().query(
        "UPDATE password_accounts SET password_hash=$1,must_change=false,session_version=session_version+1 WHERE identity=$2 AND password_hash=$3",
        [hash, a.id, h.rows[0].password_hash],
      );
      if (!result.rowCount)
        throw new HttpError(409, "ข้อมูลเปลี่ยนแล้ว กรุณาลองใหม่");
      return Response.json({ ok: true, relogin: true });
    }
    if (!self || self.must_change || a.role !== "admin")
      throw new HttpError(403, "เฉพาะผู้ดูแล");
    if (b.action === 'reviewPermissions') {
      await setReviewPermissions(a,b);
      return Response.json({ok:true});
    }
    if (b.action === "create") {
      await createAccount(a.company, b);
      return Response.json({ ok: true });
    }
    if (b.action === "disable" || b.action === "reset") {
      if (b.identity === a.id)
        throw new HttpError(400, "ไม่อนุญาตแก้บัญชีตนเองด้วยคำสั่งนี้");
      const hash =
        b.action === "reset"
          ? validPassword(b.password)
            ? await hashPassword(b.password)
            : null
          : null;
      if (b.action === "reset" && !hash)
        throw new HttpError(400, "รหัสผ่านต้องอย่างน้อย 12 ตัวอักษร");
      const c = await db().connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT id FROM companies WHERE id=$1 FOR UPDATE", [
          a.company,
        ]);
        const target = await c.query(
          "SELECT a.identity FROM password_accounts a JOIN memberships m ON m.identity=a.identity AND m.company_id=a.company_id WHERE a.identity=$1 AND a.company_id=$2",
          [b.identity, a.company],
        );
        if (!target.rowCount) throw new HttpError(404, "ไม่พบบัญชี");
        if (b.action === "disable")
          await c.query(
            "UPDATE memberships SET active=false WHERE identity=$1 AND company_id=$2",
            [b.identity, a.company],
          );
        await c.query(
          hash
            ? "UPDATE password_accounts SET password_hash=$1,must_change=true,session_version=session_version+1 WHERE identity=$2"
            : "UPDATE password_accounts SET session_version=session_version+1 WHERE identity=$1",
          hash ? [hash, b.identity] : [b.identity],
        );
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
      return Response.json({ ok: true });
    }
    throw new HttpError(400, "คำสั่งไม่ถูกต้อง");
  } catch (e) {
    const status =
      e instanceof HttpError
        ? e.status
        : (e as { code?: string }).code === "23505"
          ? 409
          : 400;
    return Response.json(
      {
        error:
          e instanceof HttpError
            ? e.message
            : status === 409
              ? "ชื่อผู้ใช้ซ้ำ"
              : "ข้อมูลไม่ถูกต้องหรือบริการไม่พร้อม",
      },
      { status },
    );
  }
}
export const GET = handle;
export const POST = handle;

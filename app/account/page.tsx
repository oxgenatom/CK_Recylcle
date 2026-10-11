"use client";
import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";
type User = {
  identity: string;
  username: string;
  display_name: string;
  role: string;
  active: boolean;
  must_change: boolean;
  can_review: boolean;
  can_approve: boolean;
};
async function call(body?: unknown, self = false) {
  const r = await fetch("/api/accounts" + (self ? "?self=1" : ""), {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error);
  return d;
}
export default function Account() {
  const [me, setMe] = useState<{ self: User; role: string } | null>(null),
    [users, setUsers] = useState<User[]>([]),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const m = await call(undefined, true);
    setMe(m);
    if (m.role === "admin" && !m.self?.must_change) setUsers(await call());
  }
  useEffect(() => {
    refresh().catch((e) => setMsg(e.message));
  }, []);
  async function run(b: unknown) {
    setBusy(true);
    setMsg("");
    try {
      const r = await call(b);
      if (r.relogin) {
        await signOut({ callbackUrl: "/login" });
        return;
      }
      await refresh();
      setMsg("บันทึกแล้ว");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main style={{ maxWidth: 800, margin: "24px auto", padding: 20 }}>
      <h1>บัญชีผู้ใช้ CK Recycle</h1>
      <p role="status">{msg}</p>
      {me?.self && (
        <>
          <p>
            {me.self.display_name} ({me.self.username})
          </p>
          {me.self.must_change && <p>ต้องเปลี่ยนรหัสผ่านก่อนเริ่มใช้งาน</p>}
          <h2>เปลี่ยนรหัสผ่าน</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              run({
                action: "changePassword",
                currentPassword: d.get("current"),
                password: d.get("password"),
              });
            }}
          >
            <label>
              รหัสผ่านเดิม
              <input
                name="current"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              รหัสผ่านใหม่ อย่างน้อย 12 ตัวอักษร
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
                required
              />
            </label>
            <button disabled={busy}>เปลี่ยนรหัสผ่าน</button>
          </form>
          {!me.self.must_change && (
            <p>
              <a href="/">ไปหน้ารับสินค้า</a>
            </p>
          )}
          {me.role === "admin" && !me.self.must_change && (
            <>
              <h2>สร้างบัญชีพนักงาน</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  run({
                    action: "create",
                    username: d.get("username"),
                    displayName: d.get("name"),
                    password: d.get("password"),
                    role: d.get("role"),
                  });
                  e.currentTarget.reset();
                }}
              >
                <label>
                  ชื่อผู้ใช้ (a-z, 0-9, จุด, ขีด)
                  <input name="username" pattern="[a-z0-9._-]{3,40}" required />
                </label>
                <label>
                  ชื่อพนักงาน
                  <input name="name" required maxLength={100} />
                </label>
                <label>
                  รหัสผ่านชั่วคราว
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={256}
                    required
                  />
                </label>
                <label>
                  สิทธิ์
                  <select name="role">
                    <option value="editor">ผู้กรอก</option>
                    <option value="sender">ผู้ส่ง</option>
                    <option value="admin">ผู้ดูแล</option>
                  </select>
                </label>
                <button disabled={busy}>สร้างบัญชี</button>
              </form>
              <h2>พนักงาน</h2>
              {users.map((u) => (
                <section
                  key={u.identity}
                  style={{ padding: 16, borderBottom: "1px solid #ddd" }}
                >
                  <b>
                    {u.display_name} · {u.username}
                  </b>
                  <p>
                    {u.role} · {u.active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                  </p>
                  <form key={`${u.identity}-${u.can_review}-${u.can_approve}`} onSubmit={e=>{
                    e.preventDefault();const d=new FormData(e.currentTarget);
                    run({action:'reviewPermissions',identity:u.identity,canReview:d.has('canReview'),canApprove:d.has('canApprove'),reason:d.get('reason')});
                  }}>
                    <p>สิทธิ์ตรวจทานแยกจากสิทธิ์ส่ง ผู้มี approver อนุมัติร่างของตัวเองได้</p>
                    <label><input type="checkbox" name="canReview" defaultChecked={u.can_review} /> reviewer · ตรวจทานและตีกลับ</label>
                    <label><input type="checkbox" name="canApprove" defaultChecked={u.can_approve} /> approver · อนุมัติพร้อมส่งและตีกลับ</label>
                    <label>เหตุผลเปลี่ยนสิทธิ์<input name="reason" required maxLength={1000} /></label>
                    <button disabled={busy || !u.active}>บันทึกสิทธิ์ตรวจทาน</button>
                  </form>
                  {u.username !== me.self.username && (
                    <>
                      <button
                        disabled={busy || !u.active}
                        onClick={() => {
                          if (confirm("ปิดบัญชี " + u.username + "?"))
                            run({ action: "disable", identity: u.identity });
                        }}
                      >
                        ปิดบัญชี
                      </button>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const d = new FormData(e.currentTarget);
                          run({
                            action: "reset",
                            identity: u.identity,
                            password: d.get("password"),
                          });
                          e.currentTarget.reset();
                        }}
                      >
                        <label>
                          รหัสผ่านชั่วคราวใหม่
                          <input
                            name="password"
                            type="password"
                            minLength={12}
                            required
                            autoComplete="new-password"
                          />
                        </label>
                        <button disabled={busy}>รีเซ็ตรหัสผ่าน</button>
                      </form>
                    </>
                  )}
                </section>
              ))}
            </>
          )}
          <button onClick={() => signOut({ callbackUrl: "/login" })}>
            ออกจากระบบ
          </button>
        </>
      )}
      <p>
        <a href="/login">กลับไปเข้าสู่ระบบ</a>
      </p>
    </main>
  );
}

"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
export default function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main style={{ maxWidth: 420, margin: "60px auto", padding: 24 }}>
      <h1>CK Recycle</h1>
      <h2>เข้าสู่ระบบ</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const d = new FormData(e.currentTarget);
          try {
            const r = await signIn("password", {
              username: d.get("username"),
              password: d.get("password"),
              redirect: false,
            });
            if (r?.ok) window.location.href = "/account";
            else
              setError(
                "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือถูกจำกัดการเข้าใช้ชั่วคราว",
              );
          } catch {
            setError("บริการไม่พร้อม");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          ชื่อผู้ใช้
          <input
            name="username"
            autoComplete="username"
            required
            maxLength={40}
          />
        </label>
        <label>
          รหัสผ่าน
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
          />
        </label>
        <button disabled={busy}>{busy ? "กำลังตรวจสอบ" : "เข้าสู่ระบบ"}</button>
      </form>
      <p role="alert">{error}</p>
      <p>หากลืมรหัสผ่าน ให้ติดต่อผู้ดูแล</p>
    </main>
  );
}

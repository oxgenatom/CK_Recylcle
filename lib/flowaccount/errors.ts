export function catalogErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (/credentials|not_configured|environment_invalid|sandbox_only/.test(code))
    return "ยังตั้งค่า FlowAccount Sandbox ไม่ครบ กรุณาให้ผู้ดูแลตรวจค่าบนเซิร์ฟเวอร์";
  if (/auth_|read_http_40[13]/.test(code))
    return "FlowAccount ไม่อนุญาตเข้าถึง กรุณาให้ผู้ดูแลตรวจบัญชีและสิทธิ์ Sandbox";
  if (/read_http_429/.test(code))
    return "FlowAccount จำกัดการเรียกข้อมูล กรุณารออย่างน้อย 1 นาทีแล้วลองใหม่";
  if (/invalid_|pagination|catalog_changed/.test(code))
    return "ข้อมูลสินค้า/ผู้จำหน่ายจาก FlowAccount ไม่ครบหรือรูปแบบเปลี่ยน กรุณาอัปเดตใหม่หรือติดต่อผู้ดูแล";
  return "เชื่อมต่อ FlowAccount ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่ ไม่มีการใช้ข้อมูลจำลองแทน";
}

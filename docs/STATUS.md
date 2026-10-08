# ผลตรวจ CK Recycle รอบล่าสุด — 8 ตุลาคม 2026

**รายงานด้านล่างเป็นประวัติจากรอบก่อน Phase 1** สถานะปัจจุบันและผลทดสอบใหม่อยู่ใน [PHASE1.md](PHASE1.md) และ README โดย Phase 1 ปิดการส่งเอกสารจริงทุกสภาพแวดล้อม และเพิ่ม Production catalog configuration แบบแยกชัดเจนแล้ว

ตรวจไฟล์และรันคำสั่งใหม่ใน D:/CK Recycle ไม่ใช้ผลจากบทสนทนาเป็นหลักฐาน โค้ดเดิมและ commit c734b9f พบอยู่จริง ก่อนเริ่มไม่มีงานแก้ไขค้าง mobile.html ยังคงเป็นต้นแบบจำลอง แต่ Next.js มีระบบฐานข้อมูลและ API แยกต่างหาก

## ผลแยกตามฟังก์ชัน

| ฟังก์ชัน | สถานะ | หลักฐาน / ข้อจำกัดและวิธีแก้ |
|---|---|---|
| Terminal | ทดสอบผ่านจริงบางช่องทาง / ติดข้อจำกัด | exec ใน sandbox ยังเกิด helper_unknown_error: setup refresh had errors; exec นอก sandbox รัน PowerShell/npm/Git ได้ ใช้ช่องทางนี้ทำงานต่อ |
| Next.js + TypeScript | ทดสอบผ่านจริง | build และ typecheck ผ่านจากคำสั่งรอบนี้ |
| หน้ามือถือ/แท็บเล็ต | ทดสอบผ่านจริงใน Chromium | viewport 390×844 และ 1024×768; คอลัมน์ การ์ด จำนวน ราคา และ footer ใช้ได้ในชุดทดสอบ |
| Keyboard ไม่บังช่อง/ปุ่ม | ทดสอบผ่านจริงแบบจำลอง / ทำแล้วแต่ยังไม่ได้ทดสอบอุปกรณ์จริง | จำลอง VisualViewport ลดสูง 300px แล้วตรวจช่องจำนวนและ footer อยู่เหนือพื้นที่บัง ต้อง UAT iOS/Android keyboard จริง |
| ผู้สั่งซื้อ | ทดสอบผ่านจริงในเว็บ | กรอก/บันทึก/รีโหลดได้ แยกจาก identity ผู้ทำรายการ ไม่ส่งชื่อไป salesName, contactPerson, remarks หรือ field อื่น ไม่พบ field ผู้สั่งซื้อเฉพาะใน SimpleDocument schema ที่ดาวน์โหลดใหม่ |
| ล็อกอินในเครื่อง + สิทธิ์ API | ทดสอบผ่านจริงในโหมดทดสอบ | 401 ไม่ล็อกอิน, 403 สมาชิกถูกปิด/ผู้กรอกพยายามส่ง, 404 เอกสารข้ามบริษัท; production ปิด mock login |
| OIDC ขององค์กร | ทำแล้วแต่ยังไม่ได้ทดสอบ | ไม่มี provider configuration จริง ต้องตั้ง OIDC และ provision issuer/subject |
| Migrations ผู้ใช้/ร่าง/สินค้า/ประวัติ | ทดสอบผ่านจริงกับ PostgreSQL WASM ในเครื่อง | migrations 001–003 รันผ่าน รันซ้ำไม่เพิ่มซ้ำ; backfill รายการเป็น NUMERIC และ CLI เพิ่มสมาชิกผ่าน |
| บันทึก/แก้/เปิดร่างหลังรีโหลด | ทดสอบผ่านจริงกับฐานข้อมูลในเครื่อง | รัน Next.js API จริงและ PGlite; ร่างอยู่หลัง reload ไม่ใช้ localStorage แทนฐานข้อมูล; version conflict ถูกปฏิเสธ |
| Railway PostgreSQL | ติดข้อจำกัด | ยังไม่มี DATABASE_URL จริงใน configuration จึงไม่ยืนยันการเชื่อม TLS หรือ migration บน Railway ให้ตั้ง staging URL/certificate แล้วทดสอบอีกครั้ง |
| ขอ token Sandbox | ทำแล้วแต่ยังไม่ได้ทดสอบกับบริการจริง | transport test ตรวจ grant/scope/form และ token caching ด้วย HTTP จำลอง; check:sandbox จริงหยุดก่อนส่งเพราะ sandbox_credentials_missing_or_placeholder |
| ผู้จำหน่าย/สินค้า Sandbox + pagination | ยังเป็น mock ใน E2E / ทำ integration แล้วแต่ยังไม่ได้ทดสอบบริการจริง | tests ดึงหลายหน้าผ่าน HTTP จำลองและใช้ productLists.id/หน่วยถูกต้องตาม fixture ต้องใส่ credentials จริงแล้วรัน check:sandbox เพื่อพิสูจน์ข้อมูลจากบัญชีจริง |
| Decimal/VAT/ยอดเงิน | ทดสอบผ่านจริงเฉพาะการคำนวณเว็บ | fixture ทศนิยม/ปัดเศษ/VAT ผ่าน; ยังไม่ได้เทียบกับยอด FlowAccount จริง Live จำกัด exclusive VAT 7%, ไม่ใช้ส่วนลด/คลัง/PO |
| ส่งใบรับสินค้าและเก็บ ID/เลขเอกสาร | ยังเป็น mock | E2E เก็บ MOCK ID/เลขเอกสารจริงลงฐานทดสอบ; transport POST contract ผ่านด้วย HTTP จำลอง ยังไม่มีใบรับสินค้า Sandbox ที่สร้างจริง |
| ป้องกันส่งซ้ำ/ส่งพร้อมกัน | ทดสอบผ่านจริงในโหมด mock | สอง request ต่อร่างเดียวผ่านหนึ่งและ 409 หนึ่ง มี submission audit ครั้งเดียว; PGlite ใช้ connection เดียว ต้องทดสอบ overlapping transactions บน Railway staging ก่อนรับรองระดับ production |
| Timeout / unknown / ไม่ retry POST | ทดสอบผ่านจริงในโหมด mock | transport timeout/500/malformed ส่ง POST ครั้งเดียว; E2E unknown ห้ามส่งซ้ำ และ stale submitting เปลี่ยน unknown; ยังไม่ได้จำลอง outage กับ Sandbox จริง |
| Reconciliation / ผลต่อ stock | ทำแล้วแต่ยังไม่ได้ทดสอบบริการจริง | reconciliation ตรวจ ID, externalDocumentId, ผู้จำหน่าย วันที่ ยอด และเลขเอกสาร แต่ยังไม่มีเอกสาร Sandbox ให้ตรวจ; stock ต้องตรวจตอนสร้าง/อนุมัติจริง |
| Production FlowAccount | ทดสอบผ่านจริงว่าถูกปิด | config/transport ปฏิเสธ /v1 ไม่ตาม redirect และไม่มี fallback ไป production |
| Secret scan / browser bundle | ตรวจหลัง build และก่อน commit | ตรวจ staged files แบบ heuristic และค้นชื่อตัวแปร secret ใน .next/static; ไม่ถือว่าเป็นการรับรองความปลอดภัยทุกกรณี |
| GitHub push | ติดข้อจำกัด | remote URL เดิมตอบ Repository not found ให้ยืนยัน URL และสิทธิ์บัญชี GitHub ไม่ต้องส่ง token ในแชต |
| Vercel / Railway deploy / restore | ทำคู่มือแล้วแต่ยังไม่ได้ทดสอบ | ยังไม่ได้ provision/deploy/restore ต้องมีบัญชี งบ และ staging configuration |

## คำสั่งและผลที่รันรอบนี้

- `npm run test` — 16 passed, 0 failed; รวม HTTP transport จำลองและ backfill NUMERIC
- `npm run typecheck` — exit 0
- `npm run build` — build สำเร็จ; app page และ server API routes ถูกสร้าง
- `npm run test:migrations` — 3 migrations ผ่าน, รันซ้ำไม่เปลี่ยน, membership provisioning ผ่าน
- `npm run test:e2e` — 12 passed; Chromium mobile/tablet และ keyboard viewport จำลอง
- `$env:MOCK_SCENARIO='timeout'; npm run test:e2e` — 12 passed; unknown ห้ามส่งซ้ำ
- `npm run test:production` — page 200, protected API 401, mock login ถูกปิดแม้ flag=true
- `npm run check:sandbox` — exit 1, status=blocked, tokenVerified=false, error=sandbox_credentials_missing_or_placeholder; ไม่สร้างเอกสาร
- `npm run dev:sandbox` — exit 1 ก่อนเปิดเซิร์ฟเวอร์ ด้วยเหตุผล credentials_missing_or_placeholder
- `git ls-remote origin` — Repository not found

## Configuration ที่ต้องใส่ในเครื่อง

ใส่ค่าจริง FLOW_CLIENT_ID และ FLOW_CLIENT_SECRET ของ Sandbox ใน .env.local ซึ่ง Git ignore ไว้ ไม่ใส่ secret ในแชต .env.example หรือ logs แล้วรัน `npm run check:sandbox` ผลสรุปที่ไม่เก็บค่าลับอยู่ .local/sandbox-check.json

เมื่อตรวจ token และ GET ผ่านแล้ว `npm run dev:sandbox` เปิดเว็บที่ใช้ Sandbox จริงและฐาน local แยก .local/sandbox-db; ใช้บัญชีทดสอบในเครื่อง sandbox-user ผู้สั่งซื้อยังเป็นชื่อธุรกิจอิสระ ต้องใช้ OIDC และ Railway staging เพื่อทดสอบ hosted end-to-end จริง ขั้นตอนนี้ยังไม่ยืนยันจนมีผลรันจริง

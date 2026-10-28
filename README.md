# Pocketapp

เว็บแอปบันทึกรายรับและรายจ่ายส่วนตัว มีโค้ด Google Login พื้นที่ส่วนตัว และฟอร์มเพิ่ม/ดู/แก้ไข/ลบรายการพร้อมหมวดตั้งต้น ต้องตั้งค่า Neon/Google OAuth/Vercel ก่อนใช้งานจริง

## เริ่มต้นใช้งาน

ใช้ Node.js 20.19+, 22.12+ หรือ 24+ และ pnpm 11

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:generate
pnpm dev
```

เปิด http://localhost:3000 หน้าแรกเปิดได้โดยไม่เชื่อมต่อฐานข้อมูล หากยังไม่ตั้งค่า credentials ปุ่ม Google Login จะปิดไว้

## ฐานข้อมูลและการยืนยันตัวตน

ทำตาม [คู่มือตั้งค่า Google OAuth, Neon และ Vercel](docs/auth-setup.md) กำหนด environment ใน `.env` แล้วรัน:

```bash
pnpm db:validate
pnpm db:migrate
```

ใช้ pooled `DATABASE_URL` สำหรับแอปและ direct `DATABASE_URL_UNPOOLED` สำหรับ Prisma CLI ข้อมูล User, Account และ Session อยู่ใน PostgreSQL `/dashboard` และ `/api/me` ตรวจ session ฝั่ง server ไม่มี demo login หรือฐานข้อมูลใน browser

## บันทึกรายรับและรายจ่าย

หลังเข้าสู่ระบบ เปิด `/dashboard` เพื่อเลือกประเภท จำนวนเงิน หมวดหมู่ และวันที่ (ค่าเริ่มต้นคือวันนี้ตามเวลาไทย) คำอธิบายเป็นทางเลือก หมวดรายรับ/รายจ่ายแยกตามบัญชี จำนวนเงินเก็บเป็นจำนวนเต็มหน่วยสตางค์ และไม่รับวันที่อนาคต

รายการเรียงวันที่ล่าสุดก่อน โหลดครั้งละ 20 รายการและกดดูรายการก่อนหน้าได้ ข้อมูลยังอยู่เมื่อ reload หรือใช้บัญชีเดิมบนอีกอุปกรณ์ ดูรูปแบบ API ข้อจำกัดจำนวนเงิน และวิธีตรวจรับใน [คู่มือรายการ](docs/transactions.md)

แต่ละรายการมีปุ่มแก้ไขจำนวนเงิน วันที่ หมวด และคำอธิบาย โดยคงประเภทเดิม ปุ่มลบจะแสดงหน้าต่างยืนยันก่อน และการยกเลิกไม่เปลี่ยนข้อมูล หากคำขอล้มเหลวรายการและร่างแก้ไขยังอยู่ให้ลองใหม่ได้

## ตรวจสอบโปรเจกต์

```bash
pnpm lint
pnpm typecheck
pnpm build
```

ทดสอบ browser/HTTP ด้วย PostgreSQL แยกอัตโนมัติ ต้องเปิด Docker และติดตั้ง Chromium ก่อน:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

ชุดทดสอบใช้ session fixtures จาก process ทดสอบ ไม่ได้แทนการตรวจ Google OAuth จริง ดูขั้นตอนตรวจรับ localhost/cloud และสองบัญชี Google ใน [คู่มือ](docs/auth-setup.md#6-ตรวจรับ-oauth-จริงก่อนปิด-issue)

ขอบเขตที่ตกลงไว้: [docs/product-scope.md](docs/product-scope.md)

Spec สำหรับพัฒนา: [Pocketapp v1 — Issue #1](https://github.com/tanakron1748q/pocketapp/issues/1) ([สำเนาใน repository](docs/specs/pocketapp-v1.md))

การเพิ่ม เปลี่ยนชื่อ และเก็บหมวดหมู่: [docs/categories.md](docs/categories.md)

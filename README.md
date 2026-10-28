# Pocketapp

เว็บแอปบันทึกรายรับและรายจ่ายส่วนตัว ขณะนี้เป็นโครงสร้างเริ่มต้น ยังไม่ได้เปิดใช้งาน Google Login หรือฟีเจอร์การเงิน

## เริ่มต้นใช้งาน

ต้องใช้ Node.js 20.19+, 22.12+ หรือ 24+ และ pnpm 11

```bash
pnpm install --frozen-lockfile
pnpm dev
```

เปิด http://localhost:3000

## ฐานข้อมูลและการยืนยันตัวตน

คัดลอก `.env.example` เป็น `.env` แล้วกำหนดค่าจาก Neon และ Google OAuth เมื่อพร้อมเชื่อมต่อ โดย `DATABASE_URL` ใช้ pooled connection สำหรับแอป และ `DATABASE_URL_UNPOOLED` ใช้ direct connection สำหรับ Prisma CLI

```bash
cp .env.example .env
pnpm db:validate
pnpm db:generate
```

Prisma schema ยังไม่มี model และยังไม่มี migrations การรันแอปเริ่มต้นไม่ต้องเชื่อมต่อฐานข้อมูล

## ตรวจสอบโปรเจกต์

```bash
pnpm lint
pnpm typecheck
pnpm build
```

ขอบเขตที่ตกลงไว้: [docs/product-scope.md](docs/product-scope.md)

Spec สำหรับพัฒนา: [Pocketapp v1 — Issue #1](https://github.com/tanakron1748q/pocketapp/issues/1) ([สำเนาใน repository](docs/specs/pocketapp-v1.md))

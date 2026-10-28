# T01: Google Login และพื้นที่ส่วนตัวบน cloud

**Status:** ready-for-agent

**Published:** https://github.com/tanakron1748q/pocketapp/issues/2

## Parent

https://github.com/tanakron1748q/pocketapp/issues/1

## What to build

ผู้ใช้เข้าสู่เว็บที่ deploy บน Vercel ด้วย Google จริง มีข้อมูลบัญชีและ session ใน Neon และออกจากระบบหรือสลับบัญชีได้

## Acceptance criteria

- [ ] เชื่อม Better Auth, Prisma, PostgreSQL และ Google OAuth จริงบนแอปที่ deploy ด้วยแพ็กเกจฟรี ไม่มี demo login ใน production
- [ ] ผู้ใช้ที่ยังไม่ login เข้าได้เฉพาะหน้าสาธารณะ เมื่อ login แล้วเห็นตัวตนของตนเอง
- [ ] บัญชี Google เดิมใช้ข้ามอุปกรณ์เป็น User เดิม คนละบัญชีเป็นคนละ User; logout และสลับบัญชีไม่แสดงข้อมูลเก่าค้าง
- [ ] มี test harness ผ่าน browser/HTTP และ PostgreSQL ทดสอบแยก พร้อมทดสอบ session isolation ของสอง User
- [ ] ตรวจ real OAuth callback บน localhost และ URL cloud; บันทึกขั้นตอนตั้ง credentials ที่จำเป็นโดยไม่เก็บ secrets ใน repository

## Blocked by

None (can start immediately)

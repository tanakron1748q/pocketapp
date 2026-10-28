# T12: ลบบัญชีและข้อมูลตัวเองหลังยืนยันตัวตนซ้ำ

**Status:** ready-for-agent

**Published:** https://github.com/tanakron1748q/pocketapp/issues/13

## Parent

https://github.com/tanakron1748q/pocketapp/issues/1

## What to build

ผู้ใช้ยืนยันบัญชี Google เดิมอีกครั้งและพิมพ์ข้อความยืนยัน จากนั้นลบบัญชีแอปพร้อมข้อมูลของตนเองได้

## Acceptance criteria

- [ ] หน้าตั้งค่ามีขั้นตอน renewed verification ของ Google identity เดิมและ explicit text confirmation; session เดิมอย่างเดียวไม่พอ
- [ ] ยกเลิกหรือยืนยันด้วยคนละบัญชีแล้วไม่ลบข้อมูล
- [ ] ลบบัญชีแอป รวมหมวด รายการ เงินคืน รายการโปรด งบ และ sessions ของ User นั้นครบ โดยไม่ลบบัญชี Google
- [ ] User อื่นและข้อมูลของเขายังคงใช้งานได้; sessions เก่าใช้เข้าถึงข้อมูลหลังลบไม่ได้
- [ ] มี browser/HTTP tests กับ PostgreSQL แยก และ acceptance check ของ real Google reauthentication

## Blocked by

- #7: https://github.com/tanakron1748q/pocketapp/issues/7
- #9: https://github.com/tanakron1748q/pocketapp/issues/9

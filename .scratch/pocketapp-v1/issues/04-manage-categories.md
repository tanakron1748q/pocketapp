# T04: เพิ่ม เปลี่ยนชื่อ และเก็บหมวดที่เลิกใช้

**Status:** ready-for-agent

**Published:** https://github.com/tanakron1748q/pocketapp/issues/5

## Parent

https://github.com/tanakron1748q/pocketapp/issues/1

## What to build

ผู้ใช้จัดหมวดของตัวเองแล้วนำไปใช้บันทึกได้ หมวดที่เลิกใช้ไม่รบกวนตัวเลือกใหม่และประวัติยังอยู่

## Acceptance criteria

- [ ] เพิ่มหมวดรายรับหรือรายจ่าย และเปลี่ยนชื่อได้จากหน้าจอจริง
- [ ] หมวดใหม่ใช้กับฟอร์มรายการของประเภทที่ถูกต้องได้ทันที
- [ ] เก็บหมวดที่เลิกใช้แล้วไม่ปรากฏสำหรับรายการใหม่ แต่รายการเก่าและการดูย้อนหลังยังแสดงหมวดได้
- [ ] จัดการหมวดของ User อื่นไม่ได้ แม้ส่ง HTTP request ตรง
- [ ] มี browser/HTTP tests ครอบคลุมเพิ่ม เปลี่ยนชื่อ เก็บหมวด และการรักษารายการย้อนหลัง

## Blocked by

- #3: https://github.com/tanakron1748q/pocketapp/issues/3

# T03: แก้ไขและลบรายการที่บันทึกผิด

**Status:** ready-for-agent

**Published:** https://github.com/tanakron1748q/pocketapp/issues/4

## Parent

https://github.com/tanakron1748q/pocketapp/issues/1

## What to build

ผู้ใช้เปิดรายการเดิม แก้ข้อมูล หรือลบหลังยืนยัน แล้วเห็นผลที่บันทึกจริง

## Acceptance criteria

- [ ] แก้จำนวนเงิน วันที่ หมวด และคำอธิบายได้ตามประเภทและกติกาเดิม
- [ ] การยกเลิก dialog ลบไม่เปลี่ยนข้อมูล และการยืนยันลบเอารายการของตัวเองออกจริง
- [ ] ตรวจเจ้าของรายการและหมวดที่ backend ไม่ยอมแก้หรือลบรายการของ User อื่นผ่าน identifier โดยตรง
- [ ] การแก้ที่ไม่ถูกต้องหรือคำขอที่ล้มเหลวไม่ทำให้รายการหายหรือแสดงว่าบันทึกสำเร็จ
- [ ] มี browser/HTTP tests ครอบคลุมแก้ ลบ ยกเลิก validation และสิทธิ์ โดยระบบเงินคืนที่จะเพิ่มภายหลังต้องคุมเส้นทางแก้/ลบนี้ด้วย

## Blocked by

- #3: https://github.com/tanakron1748q/pocketapp/issues/3

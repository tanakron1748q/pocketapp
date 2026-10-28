# T05: ค้นหาและกรองรายการย้อนหลัง

**Status:** ready-for-agent

**Published:** https://github.com/tanakron1748q/pocketapp/issues/6

## Parent

https://github.com/tanakron1748q/pocketapp/issues/1

## What to build

ผู้ใช้ค้นหารายการและกรองด้วยวันที่ ประเภท และหมวด เพื่อเห็นข้อมูลเฉพาะช่วงที่ต้องการ

## Acceptance criteria

- [ ] ค้นหาคำอธิบายและใช้ตัวกรองช่วงวันที่ ประเภท และหมวดร่วมกันได้
- [ ] ล้างตัวกรองแล้วกลับไปเห็นรายการของตัวเองตามปกติ พร้อมสถานะไม่พบผลลัพธ์
- [ ] วันที่กรองสอดคล้องกับวันและเดือนตามเวลาไทย
- [ ] การค้นหา/กรองไม่เปิดเผยรายการของ User อื่น และใช้งานได้ทั้งมือถือกับ desktop
- [ ] มี browser/HTTP tests ยืนยันผลของตัวกรองเดี่ยว/ร่วม ขอบเขตวันที่ และ account isolation

## Blocked by

- #3: https://github.com/tanakron1748q/pocketapp/issues/3

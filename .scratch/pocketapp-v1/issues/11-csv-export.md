# T11: ส่งออก CSV ตามตัวกรองพร้อมเงินคืน

**Status:** ready-for-agent

**Published:** https://github.com/tanakron1748q/pocketapp/issues/12

## Parent

https://github.com/tanakron1748q/pocketapp/issues/1

## What to build

ผู้ใช้ดาวน์โหลดรายการที่กำลังกรองเป็น CSV ซึ่งอ่านภาษาไทยและอ้างอิงเงินคืนได้

## Acceptance criteria

- [ ] ดาวน์โหลดผ่านหน้ารายการโดยใช้เงื่อนไขค้นหา/กรองเดียวกับที่แสดง และรวมเงินคืนที่ตรงเงื่อนไข
- [ ] มีวันที่ ประเภท หมวด จำนวนเงิน คำอธิบาย และรายการต้นทางของเงินคืน
- [ ] ข้อความภาษาไทย เครื่องหมายคั่น/อัญประกาศ/ขึ้นบรรทัดใหม่ และจำนวนเงินถึงสตางค์ส่งออกได้ถูกต้อง
- [ ] ไฟล์รวมเฉพาะข้อมูลของ User ใน session และการยิง request ตรงไม่สามารถขอข้อมูลของผู้อื่น
- [ ] มี browser download/HTTP tests เปรียบเทียบผล export กับตัวกรองและตรวจทั้ง Transactions, Refunds และชุดไม่มีข้อมูล

## Blocked by

- #6: https://github.com/tanakron1748q/pocketapp/issues/6
- #8: https://github.com/tanakron1748q/pocketapp/issues/8

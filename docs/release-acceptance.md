# ตรวจรับครบวงจร (Issue #14)

วันที่ตรวจเตรียม: 29 ตุลาคม 2026 (Asia/Bangkok)

สถานะ: **ยังไม่ผ่าน cloud acceptance** — ผู้ใช้ยืนยันว่ายังไม่มี deployment URL จึงยังไม่ได้ตรวจ Vercel/Neon จริง, Google สองบัญชี, physical mobile, การตื่นหลัง Neon suspend หรือ usage จริง ไม่มีการ deploy, เปิดบริการเสียเงิน หรือเปลี่ยนสถานะ issue จากงานนี้

## หลักฐานอัตโนมัติในเครื่อง

ใช้ `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e` โดย test runner สร้าง PostgreSQL 18 ใหม่ bind loopback รัน migrations ทั้งหมด และ `pnpm build` ก่อนเปิด production server ทดสอบทั้ง Desktop Chrome และ Pixel 7 viewport ไม่มี connection ไป production

ผลตรวจในเครื่องวันที่ 29 ตุลาคม 2026:

- `pnpm lint`: ผ่าน
- `pnpm typecheck`: ผ่าน
- `pnpm test:e2e`: **186 passed (1.7m)** ทั้ง desktop/mobile; รวม account deletion 14 เคสและ connected journey 2 เคส
- `pnpm build`: ผ่านใน webServer ของทั้งชุดเต็มและ focused tests
- PostgreSQL: apply migrations ใหม่ครบ 7 รายการ รวม account deletion; cascade cleanup, rollback และ concurrent deletion ผ่าน
- ชุดเต็มตรวจโค้ดที่ commit `4ea0544` (รวมงาน #13 ที่ `800389e`/`b130f03`); ปรับการล้าง cookie Secure และตอบ 503 เมื่อ callback ยังไม่ตั้งค่าหลังชุดเต็ม แล้วตรวจ lint/typecheck/build และชุด account-deletion ซ้ำก่อนส่งงาน: **14 passed (11.5s)**

Log ชุดเต็มของรอบนี้อยู่ที่ `/tmp/pocketapp-release-e2e.log` ในเครื่อง (ไฟล์ชั่วคราว ไม่ใช่หลักฐาน cloud); สามารถสร้างผลซ้ำได้ด้วยคำสั่งข้างต้น ภาพ desktop/mobile และ trace ถูกสร้างใต้ `test-results/` ตาม config

`tests/e2e/release-journey.spec.ts` เชื่อมฟีเจอร์ใน browser journey เดียว: สร้างหมวด เก็บรายการโปรด เลือกใช้ร่างและบันทึก ตั้งงบ เพิ่ม/แก้/ลบเงินคืน แก้และลบรายจ่าย ตรวจ Dashboard/เปรียบเทียบ/งบ/CSV ทุกช่วง ตรวจ reload และข้อมูลเดียวกันใน session อีกอุปกรณ์ ตรวจ B เห็นบัญชีว่าง และ logout ไม่เพิกถอน session อีกอุปกรณ์ รายรับที่ใช้เป็นยอดอ้างอิงสร้างผ่าน public HTTP API

ชุดแยกใน `tests/e2e` ตรวจ empty/loading/validation/failure/retry/expired-session, filtering, pagination, CSV formula escaping, หมวดเก็บแล้ว, งบ default/override/no rollover, cross-month refund, concurrent refund invariant, เดือนสั้น/ยาว/ฐานศูนย์/ค่าติดลบ และการลบบัญชี การทดสอบ session/Google ใช้ fixture เฉพาะ test process ตาม [คู่มือ auth](auth-setup.md) และ [คู่มือลบบัญชี](account-deletion.md) จึงไม่แทน real Google acceptance

เมื่อรันเอง เก็บ terminal log ในพื้นที่ส่วนตัว และดู screenshot กับ trace จาก `test-results/` (`retain-on-failure`) ห้ามแนบ trace ที่มี production session/token แบบสาธารณะ

## เตรียม deployment

- [ ] เจ้าของสร้าง Neon Free และ Vercel Hobby ตาม [คู่มือตั้งค่า](auth-setup.md) บันทึก project/branch/region และ deployment commit โดยไม่บันทึก connection strings
- [ ] ตรวจ Production environment ครบ: `DATABASE_URL` แบบ pooled, `DATABASE_URL_UNPOOLED` แบบ direct, `BETTER_AUTH_URL` เป็น HTTPS origin ตรง URL จริง, `BETTER_AUTH_SECRET` ยาวอย่างน้อย 32 ตัว, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` ไม่มี `NEXT_PUBLIC_` สำหรับ secrets
- [ ] รัน `pnpm db:migrate` ใน environment ที่ชี้ฐานข้อมูลเป้าหมาย และ `pnpm exec prisma migrate status` ต้องไม่มี pending/failed migrations รวม `20261029020000_account_deletion` เก็บผลที่ปกปิด host/credentials
- [ ] Google Console มี exact origin และ callbacks `/api/auth/callback/google` กับ `/api/account/verification/callback` ลงทะเบียนบัญชี A/B เป็น test users เมื่อ consent screen ยัง Testing
- [ ] Vercel ใช้ Node/pnpm ตาม package.json, build ผ่าน `pnpm build`, preview ไม่ใช้ production secrets และไม่มี wildcard trusted origins
- [ ] ยืนยัน console ยังระบุ Free/Hobby ไม่มี paid add-on หรือ upgrade แล้วเปิด deployment จากมือถือและ desktop จริง

## ขั้นตอนตรวจรับ cloud จริง

บันทึก URL/commit, browser/OS/device, เวลาทดสอบไทย, ผลที่คาด/ผลจริง และหลักฐานที่ปกปิดข้อมูลส่วนตัวในแต่ละข้อ ใช้บัญชีและข้อมูลที่เจ้าของอนุญาตให้ลบได้

1. Desktop login Google A; มือถือ login Google A ต้องได้ User ID เดียวกันและข้อมูลเดียวกัน ส่วนอีก browser profile login Google B ต้องมี User ID และข้อมูลแยก ตรวจการส่ง ID ของ A ไป API ด้วย session B ต้องไม่เปิดเผยหรือแก้ข้อมูล A
2. A บันทึกรายรับเดือนก่อน 200.00 และเดือนที่ตรวจ 1,000.10 สร้างหมวดรายจ่ายใหม่ เก็บโปรด 100.25 เลือกใช้แล้วตรวจว่ายังไม่มีรายการจนกดบันทึก ตั้งงบเดือนที่ตรวจ 150.00
3. บันทึกรายจ่าย 100.25: สุทธิ 100.25 เงินเหลือ 899.85 งบเหลือ 49.75 เพิ่มเงินคืนในเดือนเดียวกัน 20.05: สุทธิ 80.20 เงินเหลือ 919.90 งบเหลือ 69.80 เดือนที่เลือกต้องเป็นเดือนที่จบแล้วและช่วงเต็มเดือน เพื่อเทียบเงินเหลือกับเดือนก่อน 200.00 ได้ส่วนต่าง +719.90
4. กรองเดือน/หมวด/ประเภทรายจ่าย ดาวน์โหลด CSV ต้องมีรายจ่าย 100.25 กับเงินคืน 20.05 ที่อ้างรายจ่ายเดิม ไม่มีรายรับหรือข้อมูล B และตรงตัวกรองที่กดใช้จริง
5. แก้รายจ่ายเป็น 80.25: สุทธิ 60.20 เงินเหลือ 939.90 งบเหลือ 89.80 จากนั้นแก้เงินคืนเป็น 10.05: สุทธิ 70.20 เงินเหลือ 929.90 งบเหลือ 79.80 ทุกหน้าต้องเปลี่ยนตรงกันหลังบันทึกและ reload บนอุปกรณ์ที่สอง
6. ลบเงินคืน: สุทธิ 80.25 เงินเหลือ 919.85 งบเหลือ 69.75 แล้วลบรายจ่าย: สุทธิ 0.00 เงินเหลือ 1,000.10 งบเหลือ 150.00 CSV ไม่มีรายจ่าย/เงินคืนที่ลบ เก็บ/เปลี่ยนชื่อหมวดไม่ทำลายประวัติ และโปรดยังเป็นร่างเดิม
7. ตรวจ empty account B, loading ระหว่าง slow network, amount/date validation, network failure แล้ว retry โดยร่างไม่หาย, expired/revoked session redirect ไป login ไม่มีข้อมูลบัญชีก่อนหน้าค้าง และ navigation/form/list/chart ใช้ได้ทั้งมือถือ/desktop โดยไม่ล้นจอ
8. Logout A ที่ desktop แล้ว replay session เก่าเข้าข้อมูลไม่ได้ มือถือ session A เดิมยังใช้ได้ สลับ Google เป็น B ต้องไม่มีข้อมูล A ปน
9. ปิดทุกแท็บที่เรียกฐานข้อมูล ปล่อย idle เกิน 5 นาทีจน Neon console แสดง suspend แล้วกลับมาใช้งาน อ่าน/เขียน/รายงานต้องกลับมาสำเร็จโดยไม่สร้างรายการซ้ำ บันทึกเวลา request แรกและ retry เมื่อมี transient failure
10. ทำ [real Google reauthentication acceptance](account-deletion.md#ตรวจรับ-google-จริง-ยังต้องทำก่อนปิด-issue) ด้วยบัญชีที่ยอมลบได้ ตรวจ B และ Google จริงยังอยู่ พร้อม session A ทุกอุปกรณ์ถูกเพิกถอน
11. เก็บ runtime/build/migration outcomes และ usage ก่อน/หลัง ไม่เผย cookie, authorization code, OAuth tokens, secrets หรือ database URLs ปิด issue เมื่อผลจริงผ่านครบเท่านั้น

## Free plans และประมาณการ

ตรวจเอกสารผู้ให้บริการวันที่ 29 ตุลาคม 2026 ค่าต่อไปนี้เป็นเงื่อนไขที่เอกสารแสดงในวันตรวจ ต้องตรวจ console อีกครั้งเมื่อ provision

[Vercel Hobby](https://vercel.com/docs/plans/hobby) สำหรับ personal non-commercial มี Fast Data Transfer 100 GB, Function Invocations 1,000,000, Active CPU 4 ชั่วโมง และ Provisioned Memory 360 GB-hours ต่อ allowance; เมื่อเกิน limit ฟีเจอร์อาจหยุดจน reset ไม่ควรแก้ด้วยการอัปเกรดอัตโนมัติ

[Neon Free](https://neon.com/docs/introduction/plans) มี compute 100 CU-hours/project/month, storage 1 GB/project และ public network transfer 5 GB/project/month รวม compute จาก branches ใน project เดียวกัน เมื่อ compute/transfer หมดจะ suspend จนรอบถัดไป การเขียนอาจล้มเหลวเมื่อ storage เต็ม [Scale to zero](https://neon.com/docs/introduction/scale-to-zero) หลัง idle 5 นาทีเป็นข้อกำหนด Free จึงต้องทดสอบการกลับเข้าใช้จริง

สมมติฐานวางแผน (ยังไม่ใช่ measurement): 3 คน × 5 ครั้ง/วัน × 30 วัน = 450 sessions of use/เดือน ถ้าแต่ละครั้งรวม 40 function requests จะเป็น 18,000 invocations; เผื่อ CPU 0.2 วินาที/request จะเป็นประมาณ 1 CPU-hour หากแต่ละครั้งทำให้ DB active 10 นาทีที่ 0.25 CU จะใช้ 18.75 CU-hours ก่อนรวม sessions ที่ทับกัน ข้อมูล 3 คน × 30 รายการ/วัน × 365 วัน = 32,850 รายการ/ปี; เผื่อ 4 KB ต่อรายการรวม indices/refunds เป็นประมาณ 131 MB/ปี ตัวเลขนี้ยังไม่รวมข้อมูลสะสมและ auth/session storage ทั้งหมด

จำนวน invocations อาจอยู่ใน allowance แต่ CPU, memory duration, transfer และ compute ต้องวัดจริง การเปิดหลายแท็บ/refresh บ่อย/preview branches/ขนาด CSV ทำให้เพิ่มได้ ตรวจ Neon Usage และ Vercel Usage ก่อนและหลังตรวจรับ แล้วคำนวณอัตราเฉลี่ยต่อวัน × จำนวนวันต่อเดือน เก็บ headroom สำหรับ cold starts และการสะสมข้อมูล ถ้าไม่พอให้ลดการใช้หรือพักการใช้งานเพื่อหารือ โดยไม่เปิด paid service

ผลที่ยังขาด: actual plan/usage, egress/CPU/memory/compute measurements, production callbacks/secrets/migrations, real Google A/B และ cold resume ทั้งหมด จึงยังไม่รับรองว่า deployment อยู่ใน Free allowance

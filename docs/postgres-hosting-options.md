# PostgreSQL + Prisma: ทางเลือก Cloud

ตรวจสอบวันที่ 28 ตุลาคม 2026 — ข้อเสนอประกอบการหารือ ยังไม่ใช่การตัดสินใจเลือกผู้ให้บริการ

## คำศัพท์ที่ต้องแยก

เอกสารนี้ตีความคำว่า “postgrest + prisma ORM” ว่าหมายถึง PostgreSQL + Prisma ORM ไว้ก่อน PostgreSQL คือฐานข้อมูล ส่วน PostgREST เป็น web server ที่แปลงฐานข้อมูล PostgreSQL ให้เป็น REST API ถ้าต้องการใช้ PostgREST จริง ต้องออกแบบ API และสิทธิ์เพิ่มเติม ไม่ใช่ชื่อเรียกอีกแบบของฐานข้อมูล [PostgREST documentation](https://docs.postgrest.org/en/stable/)

## Better Auth และเวอร์ชัน Prisma

Better Auth มี Prisma adapter และเอกสารปัจจุบันยกตัวอย่าง Prisma 7 + PostgreSQL การสร้าง schema ของ auth และการนำ migration ไปใช้เป็นคนละขั้นตอน [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma)

เสนอใช้ Prisma ORM 7 ที่เป็น GA และตรึงเวอร์ชันร่วมกับ Better Auth ก่อน เนื่องจากคู่มือ Prisma แบบไม่ระบุเวอร์ชันบางหน้าเปลี่ยนไปใช้ Prisma ORM 8 ซึ่งยังเป็น release candidate และ API การตั้งค่าต่างจาก Prisma 7 มาก การเลือก Prisma ORM ไม่ได้บังคับว่าฐานข้อมูลต้องอยู่บน Prisma Postgres [Prisma Cloudflare guide](https://www.prisma.io/docs/guides/deployment/cloudflare-workers), [Prisma Postgres overview](https://www.prisma.io/docs/postgres)

## ข้อเสนอหลัก: Vercel Hobby + Neon Free

ข้อเสนอหลักสำหรับโครงการนี้คือ Vercel Hobby สำหรับ Next.js บน Node runtime และ Neon Free สำหรับ PostgreSQL ใช้ร่วมกับ Prisma ORM 7 และ Better Auth Prisma adapter เนื่องจากเป็นงานส่วนตัวที่ไม่มีรายได้และลดงานปรับ runtime ของ Cloudflare ส่วนคำแนะนำนี้ยังรอผู้ใช้ตัดสินใจ [Vercel Hobby](https://vercel.com/docs/plans/hobby)

Neon Free ปัจจุบันระบุพื้นที่ 1 GB/โครงการ และ compute 100 CU-hours/โครงการ/เดือน เหมาะเป็นจุดเริ่มต้นสำหรับข้อมูลข้อความของผู้ใช้กลุ่มเล็ก โดยเป็นการประเมินตามลักษณะงาน ไม่ใช่ผลวัด usage จริง [Neon pricing](https://neon.com/pricing), [ประกาศเพิ่มพื้นที่ Free](https://neon.com/blog/neon-free-plan-1-gb-per-project)

Neon Free พัก compute หลังไม่ใช้งาน 5 นาทีและปลุกอัตโนมัติเมื่อ query ครั้งต่อไป จึงอาจมีเวลารอเพิ่มเมื่อกลับมาใช้ ส่วน Vercel Hobby จำกัดการใช้ส่วนตัวที่ไม่ใช่เชิงพาณิชย์ และมีโควตาการใช้งาน การประเมินค่าใช้จ่ายเป็น 0 บาทจึงอยู่ภายใต้โควตา Free ของทั้งสองบริการ [Neon scale to zero](https://neon.com/docs/introduction/scale-to-zero), [Vercel Hobby limits](https://vercel.com/docs/plans/hobby)

หากเลือกเส้นทางนี้ ให้ deploy Next.js บน Vercel โดยตรง ไม่จำเป็นต้องเพิ่ม vinext ซึ่งเป็น toolchain อีกเส้นทางหนึ่ง หน้าจอและไลบรารี frontend ที่ผู้ใช้ยืนยันยังใช้ได้ครบ [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)

Neon มีคู่มือ Prisma 7 โดยตรง ใช้ pooled connection สำหรับแอปและ direct connection สำหรับ Prisma CLI ตามคำแนะนำของผู้ให้บริการ เก็บการเชื่อมต่อฐานข้อมูลและ Prisma ไว้ฝั่ง server [Prisma with Neon](https://neon.com/docs/guides/prisma)

## ทางเลือก: Cloudflare Workers + Neon

ทำได้ตามเอกสารทั้ง Cloudflare และ Prisma ไม่จำเป็นต้องเปลี่ยนไปใช้ D1 เพื่อใช้ Workers ตัวเลือกการเชื่อมต่อ ได้แก่ Neon serverless driver + Prisma adapter ที่ตรงกัน หรือ PostgreSQL driver ผ่าน Hyperdrive/Node compatibility เลือกวิธีเดียวและทดสอบ runtime จริง ไม่ใช้ตัวอย่างของ Prisma คนละ major มาผสมกัน [Prisma 7 on Workers](https://www.prisma.io/docs/orm/v7/prisma-client/deployment/edge/deploy-to-cloudflare), [Cloudflare Neon integration](https://developers.cloudflare.com/workers/databases/third-party-integrations/neon/)

Cloudflare แนะนำ Hyperdrive เพื่อ connection pooling และลดเวลาตั้ง connection โดย Hyperdrive รวมอยู่ใน Workers Free ที่ 100,000 database statements/วัน แต่ยังมีข้อจำกัด CPU ของ Worker เอง จึงยังต้องวัด auth callback, Dashboard และ CSV ต่อคำขอ [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

หากใช้ Hyperdrive ต้องระวัง read cache ซึ่งไม่ได้ invalidate อัตโนมัติหลังเขียนข้อมูล เสนอปิด query cache สำหรับข้อมูลรายการการเงิน/session ในระยะแรก เพื่อหลีกเลี่ยงการอ่านยอดเก่าหรือ session เก่าหลังแก้ไข [Hyperdrive FAQ](https://developers.cloudflare.com/hyperdrive/reference/faq/)

ความเห็น: เป็นทางเลือกที่ทำได้ แต่เพิ่มเรื่อง runtime, adapter และ connection lifecycle เมื่อเทียบกับโฮสต์แอปบน Node.js จึงเหมาะเมื่อมีเหตุผลต้องการใช้ Cloudflare โดยเฉพาะ มากกว่าจะเลือกเพียงเพราะราคา Free

## Prisma Postgres Free

เป็น managed PostgreSQL ที่เชื่อมด้วย connection string ปกติ มี pooling และใช้กับ Prisma ORM หรือ client อื่นได้ รองรับ Workers ทั้งทาง Node compatibility + TCP หรือ serverless HTTP driver เป็นฐานข้อมูลอีกตัวเลือกหนึ่งสำหรับใช้คู่กับ app hosting ไม่ใช่ ORM และไม่ใช่ app hosting โดยตัวมันเอง [Prisma Postgres overview](https://www.prisma.io/docs/postgres), [Prisma 7 Workers guide](https://www.prisma.io/docs/guides/v7/deployment/cloudflare-workers)

มี Free plan ไม่ต้องใช้บัตร แต่แหล่งทางการที่ตรวจพบยังแสดงตัวเลขไม่ตรงกัน: ตาราง pricing ระบุ 200k operations/เดือนและ 500 MB ขณะที่ calculator ในหน้าเดียวกันแสดง 100k และเอกสาร/บทความล่าสุดระบุ 2 GB จึงควรดู quota ที่ Console ตอนสมัครก่อนนำตัวเลขไปเป็นข้อตกลง [Prisma pricing](https://www.prisma.io/pricing), [เอกสารย้ายฐานข้อมูล](https://www.prisma.io/docs/postgres/import-from-existing-database)

เมื่อ Free ใช้ operation ครบ ฐานข้อมูลหยุดรับทั้งอ่านและเขียนจนกว่าจะ reset เดือนถัดไปหรือเปลี่ยน plan ส่วน Free ไม่มี automated backups จึงต้องมีแผนสำรองข้อมูลเองหากเลือกใช้เงินจริง ข้อจำกัดนี้ต่างจากแค่พื้นที่เก็บข้อมูล [Prisma Postgres FAQ](https://www.prisma.io/docs/postgres/faq), [Prisma full-stack tutorial](https://www.prisma.io/docs/full-stack-tutorial)

ความเห็น: เป็นตัวเลือกสำรองที่เข้ากับ Prisma ได้ดี แต่ไม่ควรเลือกเพราะชื่อผลิตภัณฑ์ตรงกับ ORM และควรตรวจ quota จริงก่อนเทียบกับ Neon

## ข้อเสนอที่ต้องพิสูจน์ก่อนเริ่มข้อมูลจริง

- ตกลงว่าต้องการ PostgreSQL หรือ PostgREST จริง
- ตรึง Prisma major ที่เข้ากับ Better Auth adapter และ driver ที่เลือก
- Google Login สองบัญชีแยกข้อมูลได้และบัญชีเดิมใช้ข้ามอุปกรณ์ได้
- วัด cold start, เวลารวม และ CPU ของ runtime จริง พร้อมใช้ connection pool ที่เข้ากับ provider
- ยืนยันว่าการทำเงินคืนพร้อมกันและการลบข้อมูลบัญชีใช้ transaction/locking ที่ตรงกับกติกาผลิตภัณฑ์
- ยืนยันค่า Free, พฤติกรรมเมื่อ quota เต็ม และการสำรองข้อมูลจากบัญชีผู้ให้บริการที่ใช้งานจริง

เอกสารนี้ไม่ได้สร้าง schema, migrations, บัญชี cloud หรือเลือก hosting ให้ผู้ใช้

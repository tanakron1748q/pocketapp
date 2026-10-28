# วิเคราะห์ Tech stack ที่เสนอ

วันที่ตรวจสอบ: 28 ตุลาคม 2026

สถานะ: ข้อเสนอเพื่อหารือ ยังไม่ใช่การเลือกเทคโนโลยี และยังไม่ได้ทดสอบการทำงานร่วมกันจริง

อัปเดตหลังการหารือ: ผู้ใช้ยืนยัน frontend ตามข้อเสนอแล้ว และต้องการ Prisma ORM กับฐานข้อมูลที่ระบุว่า “postgrest” (ประเมินเบื้องต้นว่า PostgreSQL) ดังนั้นข้อเสนอ D1 + Drizzle ด้านล่างเป็นบันทึกการวิเคราะห์ชุดเดิม ดูขอบเขตปัจจุบันที่ [product-scope.md](./product-scope.md) และตัวเลือกใหม่ที่ [postgres-hosting-options.md](./postgres-hosting-options.md)

## ความเห็นโดยรวม

Stack ในภาพเหมาะกับแอปรายรับ–รายจ่ายส่วนตัวที่มีผู้ใช้กลุ่มเล็กและต้องการใช้บริการฟรี โดยเฉพาะ TypeScript, React, Better Auth, Google, D1, Drizzle และ Zod ประเด็นที่ต้องพิสูจน์ก่อนเลือกคือ runtime ของ Next.js/vinext บน Workers Free และการรักษากติกาข้อมูลเมื่อมีหลายคำขอพร้อมกัน จำนวนผู้ใช้น้อยช่วยเรื่องปริมาณรวม แต่ไม่ได้แก้ข้อจำกัด CPU ต่อคำขอ

คำแนะนำเชิงออกแบบในเอกสารนี้เป็นการประเมินจากข้อกำหนดของ Pocketapp ส่วนความสามารถและข้อจำกัดแพลตฟอร์มอ้างอิงเอกสารเจ้าของผลิตภัณฑ์ตามลิงก์

## Framework และ hosting

Next.js App Router รวมหน้าจอและส่วน server ไว้ในโครงการเดียว เหมาะกับงานฟอร์มและ Dashboard แต่ความสามารถด้าน SEO หรือระบบ cache ซับซ้อนไม่ใช่ความจำเป็นหลักของแอปส่วนตัวนี้

vinext ควรอธิบายเป็น Vite plugin ที่สร้างการทำงานตาม Next.js API ใหม่ ไม่ใช่เพียง adapter ที่นำ Next.js เดิมไปวางบน Workers เอกสาร Cloudflare ปัจจุบันแนะนำ vinext เป็นค่าเริ่มต้น และ automatic configuration ใช้ vinext สำหรับ Next.js [Next.js on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), [Automatic configuration](https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/)

Cloudflare ประกาศ Vinext 1.0 วันที่ 28 กันยายน 2026 พร้อม App Router, Server Actions และ Route Handlers โดยยังระบุข้อจำกัดของ Cache Components / `use cache` จึงไม่ควรสรุปจากประกาศเดือนกุมภาพันธ์เพียงอย่างเดียวว่ายังเป็นการทดลองรุ่นแรก อย่างไรก็ตาม หน้าคู่มือ framework บางส่วนยังใช้คำว่า beta จึงมีความไม่สอดคล้องระหว่างแหล่งทางการ และการประกาศรุ่นไม่ใช่หลักฐานว่าชุดไลบรารีของโครงการเราผ่านแล้ว [ประกาศ Vinext 1.0](https://blog.cloudflare.com/vinext-nextjs-on-vite)

OpenNext เป็นอีกเส้นทางสำหรับรัน Next.js บน Workers โดยเอกสารระบุรองรับ Next.js 16 เสนอให้เก็บเป็นตัวเลือกเปรียบเทียบ หากต้องการใช้ runtime ของ Next.js ผ่าน adapter มากกว่าเลือกการสร้าง API ใหม่ ทั้งสองทางต้องทดสอบ callback, cookies, server mutations และ build บน Workers จริง [OpenNext compatibility](https://opennext.js.org/cloudflare), [Cloudflare OpenNext guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)

ข้อเสนอ: ใช้ vinext ได้ในฐานะตัวเลือกหลักตามแนวทางปัจจุบันของ Cloudflare แต่ยังไม่ผูกมัดจนกว่าจะมีการทดลองเชื่อมต่อ login, อ่าน/เขียน D1 และวัด CPU ของหน้าที่ใช้จริง ไม่ใช้ความสามารถ cache ที่ไม่จำเป็น และไม่ cache ข้อมูลส่วนตัวร่วมระหว่างผู้ใช้

## แพ็กเกจฟรี

- Workers Free: 100,000 requests/วัน, CPU 10 ms/HTTP request และหน่วยความจำ 128 MB เวลา CPU ไม่รวมการรอเครือข่ายหรือฐานข้อมูล แต่ SSR, auth และการประมวลผล JSON/CSV ใช้ CPU จริง จึงต้องวัด ไม่สามารถรับประกันจากจำนวนผู้ใช้คนเดียวได้ [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- D1 Free: อ่าน 5 ล้านแถว/วัน เขียน 100,000 แถว/วัน และพื้นที่รวม 5 GB เมื่อถึงโควตาประจำวัน คำขอฐานข้อมูลจะเริ่มล้มเหลว ไม่ใช่การรับประกันว่าจะใช้ได้ไม่จำกัด [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- ขนาด D1 ต่อฐานข้อมูลใน Free สูงสุด 500 MB ไม่ใช่ 5 GB ต่อฐานข้อมูล มีได้ 10 ฐานข้อมูล และ Time Travel ย้อนหลัง 7 วัน ขนาดนี้น่าจะเพียงพอสำหรับข้อมูลข้อความของผู้ใช้กลุ่มเล็ก เป็นการประเมินตามลักษณะงาน ไม่ใช่ผลวัดข้อมูลจริง [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

ข้อเสนอ: เริ่มจากฐานข้อมูลร่วมหนึ่งชุดและใช้บริการ Free โดยไม่เปิดใช้ส่วนที่คิดเงินเพิ่ม ใช้โดเมนที่ผู้ให้บริการให้มาในช่วงแรก และประเมิน usage จากระบบจริง การรองรับ export ต้องไม่สร้าง CSV ขนาดใหญ่ทั้งหมดในคำขอเดียวโดยไม่วัดผล

## Google Login และการแยกบัญชี

Better Auth มี Google provider และ Drizzle SQLite adapter ตามเอกสาร จึงเข้ากับตัวเลือกนี้ได้ ตั้งแต่ Better Auth 1.5 ยังรองรับ D1 binding โดยตรงด้วย ไม่จำเป็นต้องเพิ่มแพ็กเกจ Cloudflare ของบุคคลที่สามเพียงเพื่อเริ่ม login [Google provider](https://better-auth.com/docs/authentication/google), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Better Auth 1.5](https://better-auth.com/blog/1-5)

Google Login ต้องตั้ง OAuth client, client secret, base URL และ callback URL ของ localhost/production ให้ตรงกัน การกรอกความลับและการตั้งค่าบัญชีภายนอกยังต้องทำ แม้ใช้บริการระดับฟรี [Google provider setup](https://better-auth.com/docs/authentication/google)

ข้อเสนอด้านการแยกข้อมูล: login ระบุว่าผู้ใช้เป็นใคร แต่ไม่ได้ทำให้รายการการเงินแยกสิทธิ์อัตโนมัติ ให้ส่วน server อ่าน user ID จาก session แล้วจำกัดทุกการอ่าน/แก้ไข/ลบ/ส่งออกตามเจ้าของข้อมูล รวมถึงตรวจเจ้าของหมวดและรายการอ้างอิงเงินคืน อย่าพึ่งการซ่อนปุ่มหรือกรองข้อมูลใน browser และอย่าสมมติว่ามี PostgreSQL-style RLS บน D1

สำหรับการลบบัญชี Better Auth มี fresh session check แต่ค่าเริ่มต้นอนุญาต session ที่ใหม่ภายในหนึ่งวัน จึงยังไม่เท่ากับข้อกำหนดของเราที่ให้ยืนยันตัวตนซ้ำตอนลบ ต้องออกแบบ recent-auth flow ให้ชัด ทดสอบกับ Google-only account และยืนยันตัวตนของบัญชีเดิมก่อนลบข้อมูลทางธุรกิจทั้งหมด [User deletion and freshness](https://better-auth.com/docs/concepts/users-accounts)

## D1 และ Drizzle กับกติกาเงิน

Drizzle รองรับ D1 และ Workers โดยตรง เป็นตัวเลือกที่เหมาะสำหรับ type-safe queries และ migrations [Drizzle D1 guide](https://orm.drizzle.team/docs/sqlite/connect-cloudflare-d1)

D1 มี atomic `batch()` ที่ rollback ทั้งชุดเมื่อ statement ล้มเหลว แต่ไม่มี interactive transaction แบบเปิด transaction แล้วรอ JavaScript ตัดสินใจกลางทาง Better Auth อธิบายข้อจำกัดนี้ในเอกสาร D1 ของตัวเองเช่นกัน การเรียก `.transaction()` ของ ORM จึงไม่ควรถูกสมมติว่าใช้ได้กับ D1 ทุกกรณี [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Better Auth D1 support](https://better-auth.com/blog/1-5)

ข้อเสนอ: กติกาเงินคืนต้องปลอดภัยเมื่อผู้ใช้กดจากสองอุปกรณ์พร้อมกัน ใช้ atomic conditional mutation หรือข้อบังคับในฐานข้อมูลที่ทำให้ยอดคืนรวมไม่เกินต้นทาง แล้วทดสอบคำขอพร้อมกัน การแค่อ่านยอดคงเหลือแล้ว insert ในอีกคำขอหนึ่งยังมีช่องให้คืนเกินได้ ทั้งนี้เอกสารนี้ยังไม่ได้เลือก schema หรือวิธีบังคับกติกา

ข้อเสนอ: เก็บจำนวนเงินเป็นจำนวนเต็มหน่วยสตางค์ และจำกัดช่วงให้ปลอดภัยกับ JavaScript การใช้ SQLite REAL เป็นตัวเลขประมาณจึงไม่เหมาะกับยอดเงินที่ต้องตรงทุกสตางค์ [SQLite floating point](https://www.sqlite.org/floatingpoint.html)

วันที่รายการเป็นวันที่ทางธุรกิจตามเวลาไทย ส่วนเวลาเกิดเหตุการณ์ใช้ timestamp แยกกัน ทั้งการรวมเดือน เงินคืนข้ามเดือน และ export ต้องใช้กติกาชุดเดียวกัน

## UI และไลบรารีประกอบ

- Ant Design เหมาะกับตาราง ฟอร์ม modal และหน้าจัดการ รุ่นแรกทำงานได้เร็ว แต่ยังต้องออกแบบ list/form บนมือถือ ไม่ใช่ย่อ desktop table อย่างเดียว App Router ต้องดูการติดตั้ง style registry ตามคำแนะนำ [AntD Next.js](https://ant.design/docs/react/use-with-next/)
- Tailwind ใช้ร่วมได้ เสนอให้ใช้กับ layout/spacing และใช้ AntD tokens จัด theme ของ components เพื่อลดการ override ข้ามระบบ ตรวจ CSS layer และ reset ให้ถูกต้อง [AntD compatible style](https://ant.design/docs/react/compatible-style/)
- AntD Form มีการควบคุมฟิลด์และ validation อยู่แล้ว เสนอให้ใช้ AntD Form + Zod ที่ฝั่ง server ก่อน React Hook Form เพิ่มได้เมื่อมีเหตุผลเฉพาะ การใช้พร้อมกันไม่ใช่สิ่งที่ผิด แต่เพิ่มงานเชื่อม state โดยยังไม่จำเป็น [AntD Form](https://ant.design/components/form/)
- เลือก icon set หลักเพียงชุดเดียวในรุ่นแรก ลดความซ้ำของ Lucide และ Ant Design Icons เป็นข้อเสนอเพื่อความสม่ำเสมอและลด dependency ที่ไม่จำเป็น
- Recharts เหมาะกับกราฟ Dashboard แต่รายจ่ายสุทธิของหมวดติดลบได้จากเงินคืน ควรใช้กราฟแท่งที่รองรับค่าติดลบ หรือแยกการแสดงเงินคืน ไม่ป้อนรายจ่ายสุทธิติดลบลงกราฟวงกลมโดยตรง [Recharts ResponsiveContainer](https://recharts.github.io/en-US/api/ResponsiveContainer/)
- TypeScript และ pnpm เหมาะเป็นมาตรฐานโครงการ ใช้ lockfile และตรึงเวอร์ชันที่ผ่านการทดสอบร่วมกัน การเลือก major version ของ React/AntD ต้องตรวจ peer dependencies ของชุดจริงตอนเริ่มโครงการ

## สิ่งที่ควรพิสูจน์ก่อนยืนยัน Stack

1. Deploy แอปขนาดเล็กบน Workers Free ด้วย runtime ที่เลือก แล้ว Google Login/Logout และสลับสองบัญชีได้จริง
2. วัด CPU ทั้ง login callback, หน้า Dashboard, การบันทึกเงินคืน และ export โดยไม่ใช้ผลทดสอบ dev บน Node.js แทนผล Workers
3. ยืนยันว่า session และข้อมูลทางธุรกิจบันทึกใน D1 ได้ พร้อม migrations ที่ทำซ้ำได้
4. ทดสอบสิทธิ์ข้ามผู้ใช้ด้วย request โดยตรง ไม่ใช่ดูเพียงหน้าจอ
5. ทดสอบเงินคืนพร้อมกันและการแก้/ลบต้นทาง เพื่อพิสูจน์ atomicity
6. ยืนยันว่าลบบัญชีผ่านการยืนยันตัวตนซ้ำและลบข้อมูลของบัญชีนั้นครบ โดยไม่กระทบผู้อื่น

ข้อเสนอชุดที่ลดความซ้ำ: Next.js App Router API ผ่าน vinext (รอผลทดสอบ), TypeScript, React, AntD, Tailwind สำหรับ layout, icon set เดียว, Recharts, Better Auth + Google, D1 + Drizzle, Zod, AntD Form, Workers และ pnpm ส่วน OpenNext เป็นอีกเส้นทางที่ควรเทียบหากพบปัญหาความเข้ากันได้

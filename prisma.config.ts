import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generation/build do not need credentials. Migration commands still require this URL.
  datasource: { url: process.env.DATABASE_URL_UNPOOLED },
});

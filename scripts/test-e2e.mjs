import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

// Always create a disposable database. Never read a developer's .env credentials.
const container = `pocketapp-auth-test-${randomUUID()}`;
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}

let child;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child?.kill(signal);
    spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
    process.exit(1);
  });
}

try {
  run("docker", ["run", "--detach", "--rm", "--name", container,
    "-e", "POSTGRES_USER=pocketapp_test", "-e", "POSTGRES_PASSWORD=local-test-only",
    "-e", "POSTGRES_DB=pocketapp_test", "-p", "127.0.0.1::5432", "postgres:18-bookworm"]);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = spawnSync("docker", ["exec", container, "pg_isready", "-U", "pocketapp_test"], { stdio: "ignore" });
    if (status.status === 0) { ready = true; break; }
    await setTimeout(500);
  }
  if (!ready) throw new Error("Test PostgreSQL did not become ready");
  const port = spawnSync("docker", ["port", container, "5432/tcp"], { encoding: "utf8" }).stdout.trim().split(":").at(-1);
  const url = `postgresql://pocketapp_test:local-test-only@127.0.0.1:${port}/pocketapp_test`;
  const env = {
    ...process.env,
    DATABASE_URL: url,
    DATABASE_URL_UNPOOLED: url,
    BETTER_AUTH_URL: "http://localhost:3100",
    BETTER_AUTH_SECRET: "test-only-secret-for-disposable-local-database-1234567890",
    GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "test-only-not-a-google-credential",
  };
  run("pnpm", ["db:generate"], env);
  run("pnpm", ["db:migrate"], env);
  const exitCode = await new Promise((resolve, reject) => {
    child = spawn("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
}

import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/test-notification-outbox-db.sh");
const temporaryDirectories: string[] = [];

async function executable(directory: string, name: string, content: string): Promise<void> {
  const path = join(directory, name);
  await writeFile(path, `#!/usr/bin/env bash\n${content}\n`);
  await chmod(path, 0o755);
}

async function fakePath(docker: string): Promise<{ directory: string; log: string }> {
  const directory = await mkdtemp(join(tmpdir(), "notification-db-script-"));
  temporaryDirectories.push(directory);
  const log = join(directory, "docker.log");
  await executable(directory, "docker", docker);
  await executable(directory, "psql", "exit 0");
  await executable(directory, "pg_isready", "exit 0");
  return { directory, log };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe("notification outbox database test preflight", () => {
  it("reports an unresolved Docker context with the intended exit code", async () => {
    const { directory } = await fakePath(`
if [[ "$1 $2" == "context show" ]]; then exit 1; fi
exit 1
`);

    const result = spawnSync("bash", [SCRIPT], {
      encoding: "utf8",
      env: { NODE_ENV: "test", PATH: `${directory}:/usr/bin:/bin` },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("test:db could not resolve the effective local Docker context");
  });

  it("checks the daemon before inspecting the configured image", async () => {
    const { directory, log } = await fakePath(`
echo "$*" >> "${"$DOCKER_TEST_LOG"}"
case "$1 $2" in
  "context show") echo default ;;
  "context inspect") echo unix:///var/run/docker.sock ;;
  "info ") exit 1 ;;
  "image inspect") exit 1 ;;
  *) exit 1 ;;
esac
`);

    const result = spawnSync("bash", [SCRIPT], {
      encoding: "utf8",
      env: {
        NODE_ENV: "test",
        PATH: `${directory}:/usr/bin:/bin`,
        DOCKER_TEST_LOG: log,
        NOTIFICATION_DB_TEST_IMAGE: "postgres:16",
      },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("test:db requires a running local Docker daemon");
    expect(await readFile(log, "utf8")).not.toContain("image inspect");
  });
});

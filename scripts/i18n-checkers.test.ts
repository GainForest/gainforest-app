import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const parityScript = path.join(projectRoot, "scripts/check-message-key-parity.mjs");
const untranslatedScript = path.join(projectRoot, "scripts/check-i18n-untranslated.mjs");
const locales = ["en", "es", "id", "pt", "sw"] as const;
const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length) rmSync(fixtures.pop()!, { recursive: true, force: true });
});

function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "gf-i18n-checker-"));
  fixtures.push(root);
  mkdirSync(path.join(root, "app"), { recursive: true });
  for (const locale of locales) {
    mkdirSync(path.join(root, "messages", locale), { recursive: true });
    writeFileSync(path.join(root, "messages", `${locale}.json`), "{}\n");
  }
  return root;
}

function writeCommon(root: string, values: Record<(typeof locales)[number], unknown>) {
  for (const locale of locales) {
    writeFileSync(
      path.join(root, "messages", locale, "common.json"),
      `${JSON.stringify(values[locale], null, 2)}\n`,
    );
  }
}

function run(script: string, cwd: string) {
  return spawnSync(process.execPath, [script], { cwd, encoding: "utf8" });
}

describe("message parity checker", () => {
  it("rejects ICU plural messages without an other clause", () => {
    const root = fixtureRoot();
    writeCommon(root, Object.fromEntries(locales.map((locale) => [locale, { sample: "{count, plural, one {tree}}" }])) as Record<(typeof locales)[number], unknown>);

    const result = run(parityScript, root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("is not valid ICU");
    expect(result.stderr).toContain("MISSING_OTHER_CLAUSE");
  });

  it("rejects localized ICU argument-name changes", () => {
    const root = fixtureRoot();
    writeCommon(root, {
      en: { sample: "Hello {name}" },
      es: { sample: "Hola {nombre}" },
      id: { sample: "Halo {name}" },
      pt: { sample: "Olá {name}" },
      sw: { sample: "Habari {name}" },
    });

    const result = run(parityScript, root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("has ICU arguments/tags");
  });

  it("rejects incompatible ICU argument value types", () => {
    const root = fixtureRoot();
    writeCommon(root, {
      en: { sample: "Total {value, number}" },
      es: { sample: "Total {value, date}" },
      id: { sample: "Total {value, number}" },
      pt: { sample: "Total {value, number}" },
      sw: { sample: "Jumla {value, number}" },
    });

    const result = run(parityScript, root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("has ICU arguments/tags");
  });

  it("rejects localized rich-tag changes", () => {
    const root = fixtureRoot();
    writeCommon(root, {
      en: { sample: "Open <link>the guide</link>" },
      es: { sample: "Abre <strong>la guía</strong>" },
      id: { sample: "Buka <link>panduan</link>" },
      pt: { sample: "Abra <link>o guia</link>" },
      sw: { sample: "Fungua <link>mwongozo</link>" },
    });

    const result = run(parityScript, root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("has ICU arguments/tags");
  });
});

describe("source i18n checker", () => {
  it("accepts a meaningful dynamic template prefix that exists in every locale", () => {
    const root = fixtureRoot();
    writeCommon(root, {
      en: { devices: { status: { up: "Online", down: "Offline" } } },
      es: { devices: { status: { up: "En línea", down: "Sin conexión" } } },
      id: { devices: { status: { up: "Aktif", down: "Tidak aktif" } } },
      pt: { devices: { status: { up: "Online", down: "Offline" } } },
      sw: { devices: { status: { up: "Mtandaoni", down: "Nje ya mtandao" } } },
    });
    writeFileSync(
      path.join(root, "app/fixture.tsx"),
      'import {useTranslations} from "next-intl";\nexport function Fixture({status}:{status:"up"|"down"}) { const t = useTranslations("common.devices"); return <p>{t(`status.${status}`)}</p>; }\n',
    );

    const result = run(untranslatedScript, root);

    expect(result.status, result.stderr).toBe(0);
  });

  it("rejects arbitrary dynamic translation keys without an explicit review entry", () => {
    const root = fixtureRoot();
    writeCommon(root, {
      en: { devices: { known: "Known device" } },
      es: { devices: { known: "Dispositivo conocido" } },
      id: { devices: { known: "Perangkat dikenal" } },
      pt: { devices: { known: "Dispositivo conhecido" } },
      sw: { devices: { known: "Kifaa kinachojulikana" } },
    });
    writeFileSync(
      path.join(root, "app/fixture.tsx"),
      'import {useTranslations} from "next-intl";\nexport function Fixture({keyName}:{keyName:string}) { const t = useTranslations("common.devices"); return <p>{t(keyName)}</p>; }\n',
    );

    const result = run(untranslatedScript, root);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unreviewed arbitrary dynamic message key keyName");
  });
});

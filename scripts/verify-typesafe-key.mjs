#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TypeSafeClient } from "@typesafe-ai/sdk";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");

function upsertEnv(existing, key, value) {
  const line = `${key}=${value}`;
  const lines = existing
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((row) => row.length > 0 && !row.startsWith(`${key}=`));
  lines.push(line);
  return `${lines.join("\n")}\n`;
}

async function main() {
  const rl = createInterface({ input, output });
  const typed = (await rl.question("TypeSafe API key: ")).trim();
  rl.close();

  if (!typed) {
    console.error("Boş bıraktın. Key yazman lazım.");
    process.exit(1);
  }

  process.stdout.write("TypeSafe'e soruyorum…\n");
  try {
    const client = new TypeSafeClient({ apiKey: typed, timeout: 20_000, logLevel: "error" });
    const models = await client.models.list();
    const names = models.map((m) => m.name).filter(Boolean).slice(0, 5);

    const previous = await readFile(envPath, "utf8").catch(() => "");
    await writeFile(envPath, upsertEnv(previous, "TYPESAFE_API_KEY", typed), "utf8");

    console.log("");
    console.log("Tamam, onaylandı.");
    console.log(`TypeSafe key geçerli. Demo kapandı. Kayıt: ${envPath}`);
    if (names.length) console.log(`Hesaptaki modeller: ${names.join(", ")}`);
    console.log("Şimdi: npm run dev");
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? error.status : undefined;
    const message = error instanceof Error ? error.message : String(error);
    console.error("");
    if (status === 401 || /unauthor|invalid api key|authentication/i.test(message)) {
      console.error("Reddedildi. TypeSafe bu key'i kabul etmedi.");
    } else {
      console.error(`TypeSafe cevap vermedi: ${message}`);
    }
    process.exit(1);
  }
}

await main();

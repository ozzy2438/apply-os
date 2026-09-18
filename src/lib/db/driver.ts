import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import postgres from "postgres";
import { DDL } from "./ddl";

export type SqlDriver = {
  dialect: "sqlite" | "postgres";
  execute(sql: string, params?: unknown[]): Promise<void>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
};

function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function sqliteDriver(file = path.join(process.cwd(), ".data", "apply-os.db")): SqlDriver {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  for (const stmt of DDL) db.exec(stmt);
  return {
    dialect: "sqlite",
    async execute(sql: string, params: unknown[] = []) {
      db.prepare(sql).run(...params);
    },
    async all<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).get(...params) as T | undefined;
    },
  };
}

function postgresDriver(url: string): SqlDriver {
  const sql = postgres(url, { max: 1, ssl: "prefer" });
  let ready: Promise<void> | null = null;
  const ensure = async () => {
    if (!ready) {
      ready = (async () => {
        for (const stmt of DDL) await sql.unsafe(stmt);
      })();
    }
    await ready;
  };
  return {
    dialect: "postgres",
    async execute(query: string, params: unknown[] = []) {
      await ensure();
      await sql.unsafe(toPg(query), params as never[]);
    },
    async all<T>(query: string, params: unknown[] = []) {
      await ensure();
      return (await sql.unsafe(toPg(query), params as never[])) as unknown as T[];
    },
    async get<T>(query: string, params: unknown[] = []) {
      await ensure();
      const rows = (await sql.unsafe(toPg(query), params as never[])) as unknown as T[];
      return rows[0];
    },
  };
}

let cached: SqlDriver | undefined;

export function getDriver(): SqlDriver {
  if (cached) return cached;
  const url = process.env.NETLIFY_DATABASE_URL?.trim();
  cached = url ? postgresDriver(url) : sqliteDriver();
  return cached;
}

export function resetDriverForTests(driver?: SqlDriver) {
  cached = driver;
}

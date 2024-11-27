import { Database } from "better-sqlite3";
import betterSqlite from "better-sqlite3";

const filename = process.env.SEARCH_INDEX_LOCATION;
export const db: Database = betterSqlite(filename, {});
db.pragma("journal_mode = WAL");

export function sql(strings: TemplateStringsArray, ...values: any[]): string {
  return strings.reduce((result, str, i) => {
    const value = i < values.length ? values[i] : "";
    return result + str + value;
  }, "");
}

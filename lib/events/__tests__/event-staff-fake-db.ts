import type { SupabaseClient } from "@supabase/supabase-js";

// Test-only Supabase stand-in for the event staff helpers and routes: filters
// seeded rows with eq/is/in/neq and records every write. Embedded relations
// are returned exactly as seeded.
export type Row = Record<string, unknown>;
export type Write = { table: string; op: "insert" | "update" | "upsert"; values: unknown; filters: Array<[string, string, unknown]> };

export function makeFakeDb(seed: Record<string, Row[]>, options: { failTables?: string[]; failWrites?: string[]; failCode?: string } = {}) {
  const writes: Write[] = [];
  const db = {
    from(table: string) {
      const filters: Array<[string, string, unknown]> = [];
      let op: Write["op"] | null = null;
      let values: unknown = null;
      let max = Infinity;
      let conflictKeys: string[] = [];
      const matches = (row: Row) => filters.every(([kind, column, value]) => {
        if (kind === "eq") return row[column] === value;
        if (kind === "neq") return row[column] !== value;
        if (kind === "is") return (row[column] ?? null) === value;
        if (kind === "in") return (value as unknown[]).includes(row[column]);
        return true;
      });
      const run = () => {
        if (op) {
          writes.push({ table, op, values, filters: [...filters] });
          if (options.failWrites?.includes(table)) return { data: null, error: { message: `${table} write failed`, code: options.failCode ?? "XX000" } };
          if (op === "update") {
            const updated = (seed[table] ?? []).filter(matches);
            updated.forEach((row) => Object.assign(row, values as Row));
            return { data: updated, error: null };
          }
          if (op === "upsert") {
            // ON CONFLICT DO NOTHING: persist new rows, return only those.
            const rows = (Array.isArray(values) ? values : [values]) as Row[];
            const added = rows.filter((row) => !(seed[table] ?? []).some((existing) => conflictKeys.every((key) => existing[key] === row[key])))
              .map((row) => ({ id: `new-${table}-${writes.length}`, ...row }));
            (seed[table] ??= []).push(...added);
            return { data: added, error: null };
          }
          const inserted = (Array.isArray(values) ? values : [values]) as Row[];
          return { data: inserted.map((row) => ({ id: `new-${table}-${writes.length}`, ...row })), error: null };
        }
        if (options.failTables?.includes(table)) return { data: null, error: { message: `${table} read failed` } };
        return { data: (seed[table] ?? []).filter(matches).slice(0, max), error: null };
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query: any = {
        select: () => query,
        eq: (column: string, value: unknown) => { filters.push(["eq", column, value]); return query; },
        neq: (column: string, value: unknown) => { filters.push(["neq", column, value]); return query; },
        is: (column: string, value: unknown) => { filters.push(["is", column, value]); return query; },
        in: (column: string, value: unknown[]) => { filters.push(["in", column, value]); return query; },
        order: () => query,
        limit: (count: number) => { max = count; return query; },
        insert: (next: unknown) => { op = "insert"; values = next; return query; },
        update: (next: unknown) => { op = "update"; values = next; return query; },
        upsert: (next: unknown, upsertOptions: { onConflict?: string } = {}) => {
          op = "upsert"; values = next; conflictKeys = (upsertOptions.onConflict ?? "id").split(","); return query;
        },
        maybeSingle: () => {
          const result = run();
          return Promise.resolve({ data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: result.error });
        },
        single: () => query.maybeSingle(),
        then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(run()).then(onFulfilled, onRejected),
      };
      return query;
    },
  };
  return { db: db as unknown as SupabaseClient, writes };
}

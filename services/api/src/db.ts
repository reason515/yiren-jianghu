/** 数据库访问接口（注入式，便于单测 mock 与未来 ORM 替换）。 */

export interface DbRow {
  [key: string]: unknown;
}

export interface Db {
  query<T extends DbRow>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/** pg Pool 适配（pg 的 query 返回 rows: any[]）。 */
export function createPgDb(pool: {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}): Db {
  return {
    query: async <T extends DbRow>(text: string, params?: unknown[]) => {
      const res = await pool.query(text, params);
      return { rows: res.rows as T[] };
    },
  };
}

/** 数据库访问接口（注入式，便于单测 mock 与未来 ORM 替换）。 */

export interface DbRow {
  [key: string]: unknown;
}

export interface Db {
  query<T extends DbRow>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** 可选事务边界；内存 mock 可省略，真实 pg Pool 必须提供。 */
  transaction?<T>(work: (tx: Db) => Promise<T>): Promise<T>;
}

type Queryable = {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
};

type TransactionalQueryable = Queryable & {
  connect(): Promise<Queryable & { release(): void }>;
};

/** pg Pool 适配（pg 的 query 返回 rows: any[]）；Pool 注入时额外提供事务。 */
export function createPgDb(pool: Queryable | TransactionalQueryable): Db {
  const db: Db = {
    query: async <T extends DbRow>(text: string, params?: unknown[]) => {
      const res = await pool.query(text, params);
      return { rows: res.rows as T[] };
    },
  };
  if (!("connect" in pool)) return db;

  return {
    ...db,
    async transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // 传入无 connect 的窄包装，防止 PoolClient 继承的 connect 触发嵌套事务。
        const result = await work(createPgDb({ query: client.query.bind(client) }));
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

import pg from 'pg';
import { DbAdapter } from './adapter.js';

const { Pool } = pg;

export class PostgresAdapter implements DbAdapter {
    private pool: pg.Pool | null = null;

    async connect(url: string): Promise<void> {
        this.pool = new Pool({
            connectionString: url,
            ssl: { rejectUnauthorized: false } // Required for most serverless DBs like Neon
        });
        // Set timezone to UTC for the pool
        await this.pool.query("SET timezone = 'UTC'");
    }

    private convertPlaceholders(sql: string): string {
        let count = 1;
        return sql.replace(/\?/g, () => `$${count++}`);
    }

    async query<T>(sql: string, params?: any[]): Promise<T[]> {
        if (!this.pool) throw new Error('Database not connected');
        const formattedSql = params ? this.convertPlaceholders(sql) : sql;
        const result = await this.pool.query(formattedSql, params);
        return result.rows as T[];
    }

    async execute(sql: string, params?: any[]): Promise<void> {
        if (!this.pool) throw new Error('Database not connected');
        const formattedSql = params ? this.convertPlaceholders(sql) : sql;
        await this.pool.query(formattedSql, params);
    }

    async close(): Promise<void> {
        if (this.pool) await this.pool.end();
    }
}

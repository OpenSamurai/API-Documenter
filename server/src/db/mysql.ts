import mysql, { Pool } from 'mysql2/promise';
import { DbAdapter } from './adapter.js';

export class MySqlAdapter implements DbAdapter {
    private pool: Pool | null = null;

    async connect(url: string): Promise<void> {
        this.pool = mysql.createPool({ uri: url, timezone: 'Z' });
    }

    async query<T>(sql: string, params?: any[]): Promise<T[]> {
        if (!this.pool) throw new Error('Database not connected');
        try {
            const [rows] = await this.pool.query(sql, params);
            return rows as T[];
        } catch (err: any) {
            console.error(`[MySQL Query Error] SQL: ${sql} | Params: ${JSON.stringify(params)} | Error: ${err.message}`);
            throw err;
        }
    }

    async execute(sql: string, params?: any[]): Promise<void> {
        if (!this.pool) throw new Error('Database not connected');
        try {
            await this.pool.query(sql, params);
        } catch (err: any) {
            console.error(`[MySQL Execute Error] SQL: ${sql} | Params: ${JSON.stringify(params)} | Error: ${err.message}`);
            throw err;
        }
    }

    async close(): Promise<void> {
        if (this.pool) await this.pool.end();
    }
}

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mysql, {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';
import { SqlParam } from '../common/types/index.js';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readPool!: Pool;
  private writePool!: Pool;

  constructor(private readonly configService: ConfigService) {}

  private createPool(prefix: 'DB' | 'DB_WRITE'): Pool {
    return mysql.createPool({
      host: this.configService.getOrThrow<string>(`${prefix}_HOST`),
      port: Number(this.configService.getOrThrow<string>(`${prefix}_PORT`)),
      user: this.configService.getOrThrow<string>(`${prefix}_USER`),
      password: this.configService.getOrThrow<string>(`${prefix}_PASSWORD`),
      database: this.configService.getOrThrow<string>(`${prefix}_NAME`),
      waitForConnections: true,
      connectionLimit: 15,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }

  onModuleInit() {
    this.readPool = this.createPool('DB'); // Base A (lectura)
    this.writePool = this.createPool('DB_WRITE'); // Base B (escritura)
  }

  async onModuleDestroy() {
    await Promise.all([this.readPool.end(), this.writePool.end()]);
  }

  // --- Operaciones de Lectura (Base A) ---
  async queryRead<T extends RowDataPacket[]>(
    sql: string,
    params: SqlParam[] = [],
  ): Promise<T> {
    const [rows] = await this.readPool.query<T>(sql, params);
    return rows;
  }

  // --- Operaciones de Escritura / Mutación (Base B) ---
  async queryWrite<T extends RowDataPacket[]>(
    sql: string,
    params: SqlParam[] = [],
  ): Promise<T> {
    const [rows] = await this.writePool.query<T>(sql, params);
    return rows;
  }

  async executeWrite(
    sql: string,
    params: SqlParam[] = [],
  ): Promise<ResultSetHeader> {
    const [result] = await this.writePool.execute<ResultSetHeader>(sql, params);
    return result;
  }

  // Transacciones seguras sobre la Base B
  async withWriteTransaction<T>(
    callback: (connection: PoolConnection) => Promise<T>,
  ): Promise<T> {
    const connection = await this.writePool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await callback(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

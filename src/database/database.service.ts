import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mysql, {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';

export type SqlParam = string | number | boolean | Date | Buffer | null;

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;

  constructor(private readonly configService: ConfigService) {
    this.pool = mysql.createPool({
      host: this.configService.get<string>('DB_HOST', '127.0.0.1'),
      port: Number(this.configService.get<number>('DB_PORT', 3306)),
      user: this.configService.get<string>('DB_USER', 'root'),
      password: this.configService.get<string>('DB_PASSWORD', ''),
      database: this.configService.get<string>('DB_NAME', 'dev_premier'),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: 'local',
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      this.logger.log(
        `Conexión establecida exitosamente con la base de datos MySQL (${this.configService.get<string>('DB_NAME')})`,
      );
    } catch (error) {
      this.logger.error(
        'Error al conectar con la base de datos MySQL. Verifique las credenciales en el archivo .env',
        error,
      );
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('Pool de conexiones MySQL cerrado correctamente.');
    }
  }

  /**
   * Ejecuta una consulta SELECT y devuelve las filas tipadas
   */
  async query<T extends RowDataPacket[]>(
    sql: string,
    params: SqlParam[] = [],
  ): Promise<T> {
    const [rows] = await this.pool.execute<T>(sql, params);
    return rows;
  }

  /**
   * Ejecuta un INSERT, UPDATE o DELETE fuera de una transacción compleja
   */
  async execute(sql: string, params: SqlParam[] = []): Promise<ResultSetHeader> {
    const [result] = await this.pool.execute<ResultSetHeader>(sql, params);
    return result;
  }

  /**
   * Ejecuta un bloque de operaciones dentro de una transacción ACID segura.
   * Si ocurre cualquier excepción, ejecuta ROLLBACK automáticamente.
   */
  async withTransaction<T>(
    work: (connection: PoolConnection) => Promise<T>,
  ): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
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
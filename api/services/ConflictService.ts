import { query, run, runAndGetId } from '../db/index.js';
import { Conflict, ConflictType } from '../../shared/types.js';

export class ConflictService {
  static getAll(resolved?: boolean): Conflict[] {
    let sql = 'SELECT * FROM conflicts';
    const params: any[] = [];

    if (resolved !== undefined) {
      sql += ' WHERE resolved = ?';
      params.push(resolved ? 1 : 0);
    }

    sql += ' ORDER BY created_at DESC';
    return query<Conflict>(sql, params);
  }

  static getByOrderId(orderId: number): Conflict[] {
    return query<Conflict>(
      'SELECT * FROM conflicts WHERE order_id = ? ORDER BY created_at DESC',
      [orderId]
    );
  }

  static getByTechnicianId(technicianId: number, resolved?: boolean): Conflict[] {
    let sql = 'SELECT * FROM conflicts WHERE technician_id = ?';
    const params: any[] = [technicianId];

    if (resolved !== undefined) {
      sql += ' AND resolved = ?';
      params.push(resolved ? 1 : 0);
    }

    sql += ' ORDER BY created_at DESC';
    return query<Conflict>(sql, params);
  }

  static create(orderId: number, technicianId: number, type: ConflictType, description: string): Conflict {
    const id = runAndGetId(
      'INSERT INTO conflicts (order_id, technician_id, type, description, resolved) VALUES (?, ?, ?, ?, 0)',
      [orderId, technicianId, type, description]
    );
    const conflicts = query<Conflict>('SELECT * FROM conflicts WHERE id = ?', [id]);
    return conflicts[0];
  }

  static resolve(id: number): boolean {
    const result = run('UPDATE conflicts SET resolved = 1 WHERE id = ?', [id]);
    return result > 0;
  }

  static resolveByOrderId(orderId: number): void {
    run('UPDATE conflicts SET resolved = 1 WHERE order_id = ?', [orderId]);
  }

  static delete(id: number): boolean {
    const result = run('DELETE FROM conflicts WHERE id = ?', [id]);
    return result > 0;
  }
}

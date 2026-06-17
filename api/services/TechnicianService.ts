import { query, run, runAndGetId } from '../db/index.js';
import { Technician, ScheduleSlot } from '../../shared/types.js';

export class TechnicianService {
  static getAll(status?: string): Technician[] {
    let sql = 'SELECT * FROM technicians';
    const params: any[] = [];

    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ' ORDER BY id ASC';
    return query<Technician>(sql, params);
  }

  static getById(id: number): Technician | null {
    const technicians = query<Technician>('SELECT * FROM technicians WHERE id = ?', [id]);
    return technicians.length > 0 ? technicians[0] : null;
  }

  static create(data: Omit<Technician, 'id' | 'created_at'>): Technician {
    const id = runAndGetId(
      'INSERT INTO technicians (name, phone, skill, status) VALUES (?, ?, ?, ?)',
      [data.name, data.phone, data.skill, data.status]
    );
    return this.getById(id)!;
  }

  static update(id: number, data: Partial<Technician>): Technician | null {
    const fields: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      params.push(data.name);
    }
    if (data.phone !== undefined) {
      fields.push('phone = ?');
      params.push(data.phone);
    }
    if (data.skill !== undefined) {
      fields.push('skill = ?');
      params.push(data.skill);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      params.push(data.status);
    }

    if (fields.length === 0) return this.getById(id);

    params.push(id);
    run(`UPDATE technicians SET ${fields.join(', ')} WHERE id = ?`, params);
    return this.getById(id);
  }

  static delete(id: number): boolean {
    const result = run('DELETE FROM technicians WHERE id = ?', [id]);
    return result > 0;
  }
}

export class ScheduleService {
  static getByTechnicianId(technicianId: number): ScheduleSlot[] {
    return query<ScheduleSlot>(
      'SELECT * FROM schedule_slots WHERE technician_id = ? ORDER BY day_of_week, start_time',
      [technicianId]
    );
  }

  static getByTechnicianIds(technicianIds: number[]): ScheduleSlot[] {
    if (technicianIds.length === 0) return [];
    const placeholders = technicianIds.map(() => '?').join(', ');
    return query<ScheduleSlot>(
      `SELECT * FROM schedule_slots WHERE technician_id IN (${placeholders}) ORDER BY technician_id, day_of_week, start_time`,
      technicianIds
    );
  }

  static updateSchedule(technicianId: number, slots: Omit<ScheduleSlot>[]): void {
    run('DELETE FROM schedule_slots WHERE technician_id = ?', [technicianId]);

    slots.forEach((slot) => {
      run(
        'INSERT INTO schedule_slots (technician_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)',
        [technicianId, slot.day_of_week, slot.start_time, slot.end_time]
      );
    });
  }

  static isWorkingHours(technicianId: number, dateTime: Date): boolean {
    const dayOfWeek = dateTime.getDay();
    const timeStr = dateTime.toTimeString().slice(0, 5);

    const slots = query<ScheduleSlot>(
      'SELECT * FROM schedule_slots WHERE technician_id = ? AND day_of_week = ?',
      [technicianId, dayOfWeek]
    );

    return slots.some((slot) => {
      return timeStr >= slot.start_time && timeStr < slot.end_time;
    });
  }

  static isWithinSchedule(technicianId: number, startTime: Date, endTime: Date): boolean {
    const startDay = startTime.getDay();
    const endDay = endTime.getDay();

    if (startDay !== endDay) return false;

    const startTimeStr = startTime.toTimeString().slice(0, 5);
    const endTimeStr = endTime.toTimeString().slice(0, 5);

    const slots = query<ScheduleSlot>(
      'SELECT * FROM schedule_slots WHERE technician_id = ? AND day_of_week = ?',
      [technicianId, startDay]
    );

    return slots.some((slot) => {
      return startTimeStr >= slot.start_time && endTimeStr <= slot.end_time;
    });
  }
}

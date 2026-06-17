import { query } from '../db/index.js';
import { DailyReport, WorkOrder } from '../../shared/types.js';

export class ReportService {
  static getDailyReport(date: string): DailyReport {
    const dateStart = `${date} 00:00:00`;
    const dateEnd = `${date} 23:59:59`;

    const totalResult = query<{ count: number }>(
      'SELECT COUNT(*) as count FROM work_orders WHERE created_at BETWEEN ? AND ?',
      [dateStart, dateEnd]
    );

    const completedResult = query<{ count: number }>(
      "SELECT COUNT(*) as count FROM work_orders WHERE status = 'completed' AND actual_end_time BETWEEN ? AND ?",
      [dateStart, dateEnd]
    );

    const cancelledResult = query<{ count: number }>(
      "SELECT COUNT(*) as count FROM work_orders WHERE status = 'cancelled' AND updated_at BETWEEN ? AND ?",
      [dateStart, dateEnd]
    );

    const pendingResult = query<{ count: number }>(
      "SELECT COUNT(*) as count FROM work_orders WHERE status IN ('pending', 'assigned', 'confirmed') AND created_at <= ?",
      [dateEnd]
    );

    const inProgressResult = query<{ count: number }>(
      "SELECT COUNT(*) as count FROM work_orders WHERE status = 'in_progress'",
      []
    );

    const technicianStats = query<{
      technician_id: number;
      technician_name: string;
      completed_count: number;
    }>(`
      SELECT
        t.id as technician_id,
        t.name as technician_name,
        COUNT(wo.id) as completed_count
      FROM technicians t
      LEFT JOIN work_orders wo ON t.id = wo.technician_id
        AND wo.status = 'completed'
        AND wo.actual_end_time BETWEEN ? AND ?
      GROUP BY t.id, t.name
      ORDER BY t.id
    `, [dateStart, dateEnd]);

    const techStats = technicianStats.map((stat) => {
      const orders = query<WorkOrder>(`
        SELECT * FROM work_orders
        WHERE technician_id = ?
          AND status = 'completed'
          AND actual_end_time BETWEEN ? AND ?
      `, [stat.technician_id, dateStart, dateEnd]);

      let totalHours = 0;
      orders.forEach((order) => {
        if (order.actual_start_time && order.actual_end_time) {
          const start = new Date(order.actual_start_time).getTime();
          const end = new Date(order.actual_end_time).getTime();
          totalHours += (end - start) / (1000 * 60 * 60);
        } else if (order.scheduled_start_time && order.scheduled_end_time) {
          const start = new Date(order.scheduled_start_time).getTime();
          const end = new Date(order.scheduled_end_time).getTime();
          totalHours += (end - start) / (1000 * 60 * 60);
        }
      });

      return {
        technicianId: stat.technician_id,
        technicianName: stat.technician_name,
        completedCount: stat.completed_count,
        totalWorkHours: Math.round(totalHours * 100) / 100,
      };
    });

    return {
      date,
      totalOrders: totalResult[0].count,
      completedOrders: completedResult[0].count,
      cancelledOrders: cancelledResult[0].count,
      pendingOrders: pendingResult[0].count,
      inProgressOrders: inProgressResult[0].count,
      technicianStats: techStats,
    };
  }

  static getDailyOrders(date: string): WorkOrder[] {
    const dateStart = `${date} 00:00:00`;
    const dateEnd = `${date} 23:59:59`;

    return query<WorkOrder>(`
      SELECT wo.*, t.name as technician_name, u.name as created_by_name
      FROM work_orders wo
      LEFT JOIN technicians t ON wo.technician_id = t.id
      LEFT JOIN users u ON wo.created_by = u.id
      WHERE wo.created_at BETWEEN ? AND ?
      ORDER BY wo.created_at ASC
    `, [dateStart, dateEnd]);
  }

  static exportDailyReportCsv(date: string): string {
    const report = this.getDailyReport(date);
    const orders = this.getDailyOrders(date);

    const statusMap: Record<string, string> = {
      pending: '待分配',
      assigned: '已分配',
      confirmed: '已确认',
      in_progress: '服务中',
      completed: '已完成',
      cancelled: '已取消',
    };

    let csv = '\uFEFF';

    csv += `日报日期: ${date}\n`;
    csv += `总工单数: ${report.totalOrders}\n`;
    csv += `已完成: ${report.completedOrders}\n`;
    csv += `已取消: ${report.cancelledOrders}\n`;
    csv += `待处理: ${report.pendingOrders}\n`;
    csv += `服务中: ${report.inProgressOrders}\n`;
    csv += '\n';

    csv += '技师工作量统计\n';
    csv += '技师姓名,完成工单数,总工时(小时)\n';
    report.technicianStats.forEach((stat) => {
      csv += `${stat.technicianName},${stat.completedCount},${stat.totalWorkHours}\n`;
    });
    csv += '\n';

    csv += '工单明细\n';
    csv += '工单号,客户姓名,客户电话,地址,服务类型,状态,技师,预约开始时间,预约结束时间,创建时间\n';
    orders.forEach((order) => {
      csv += [
        order.order_no,
        order.customer_name,
        order.customer_phone || '',
        (order.customer_address || '').replace(/,/g, '，'),
        order.service_type,
        statusMap[order.status] || order.status,
        order.technician_name || '未分配',
        order.scheduled_start_time,
        order.scheduled_end_time,
        order.created_at,
      ].join(',') + '\n';
    });

    return csv;
  }
}

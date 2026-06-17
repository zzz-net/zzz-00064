import { Router } from 'express';
import { ReportService } from '../services/ReportService.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/daily', requireAuth, (req, res) => {
  try {
    const { date } = req.query;
    const reportDate = date ? (date as string) : new Date().toISOString().split('T')[0];
    const report = ReportService.getDailyReport(reportDate);
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/daily/orders', requireAuth, (req, res) => {
  try {
    const { date } = req.query;
    const reportDate = date ? (date as string) : new Date().toISOString().split('T')[0];
    const orders = ReportService.getDailyOrders(reportDate);
    res.json({ success: true, data: orders });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/daily/export', requireAuth, (req, res) => {
  try {
    const { date } = req.query;
    const reportDate = date ? (date as string) : new Date().toISOString().split('T')[0];
    const csv = ReportService.exportDailyReportCsv(reportDate);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="daily-report-${reportDate}.csv"`);
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

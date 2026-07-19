import { Router } from "express";
import { query, queryOne } from "../db.js";

const router = Router({ mergeParams: true });

// GET /api/v1/factory/:factoryId/machine/:id/history — get machine history
router.get("/:id/history", async (req, res) => {
  try {
    const { id } = req.params;
    const factoryId = req.params.factoryId;
    const tenantId = req.tenantId;
    const { period = "24h", metric_type } = req.query;

    let interval;
    switch (period) {
      case "1h": interval = "1 hour"; break;
      case "6h": interval = "6 hours"; break;
      case "24h": interval = "24 hours"; break;
      case "7d": interval = "7 days"; break;
      case "30d": interval = "30 days"; break;
      default: interval = "24 hours";
    }

    let sql = `
      SELECT
        date_trunc('hour', timestamp) as time_bucket,
        metric_type,
        AVG(value)::DECIMAL(10,2) as avg_value,
        MIN(value) as min_value,
        MAX(value) as max_value,
        COUNT(*) as sample_count
      FROM sensor_readings
      WHERE machine_id = $1 AND tenant_id = $2
        AND timestamp > NOW() - INTERVAL '${interval}'
    `;
    const params = [id, tenantId];

    if (metric_type) {
      params.push(metric_type);
      sql += ` AND metric_type = $${params.length}`;
    }

    sql += ` GROUP BY time_bucket, metric_type ORDER BY time_bucket`;

    const rows = await query(sql, params);

    // Get alerts for this period
    const alerts = await query(
      `SELECT * FROM alerts
       WHERE machine_id = $1 AND tenant_id = $2
         AND triggered_at > NOW() - INTERVAL '${interval}'
       ORDER BY triggered_at DESC`,
      [id, tenantId]
    );

    // Get maintenance events
    const maintenance = await query(
      `SELECT * FROM maintenance_events
       WHERE machine_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC LIMIT 10`,
      [id, tenantId]
    );

    res.json({ readings: rows, alerts, maintenance });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch history", error: err.message });
  }
});

// POST /api/v1/factory/:factoryId/machine/:id/alerts/:alertId/resolve — resolve an alert
router.post("/:id/alerts/:alertId/resolve", async (req, res) => {
  try {
    const { alertId } = req.params;
    const tenantId = req.tenantId;

    const row = await queryOne(
      `UPDATE alerts SET resolved_at = NOW()
       WHERE id = $1 AND machine_id = $2 AND tenant_id = $3 RETURNING *`,
      [alertId, req.params.id, tenantId]
    );

    if (!row) return res.status(404).json({ message: "Alert not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: "Failed to resolve alert", error: err.message });
  }
});

// POST /api/v1/factory/:factoryId/machine/:id/maintenance — schedule maintenance
router.post("/:id/maintenance", async (req, res) => {
  try {
    const { id } = req.params;
    const factoryId = req.params.factoryId;
    const tenantId = req.tenantId;
    const { type, scheduledDate, notes } = req.body;

    const row = await queryOne(
      `INSERT INTO maintenance_events (machine_id, factory_id, tenant_id, type, scheduled_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, factoryId, tenantId, type || "scheduled", scheduledDate, notes]
    );

    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ message: "Failed to schedule maintenance", error: err.message });
  }
});

export default router;

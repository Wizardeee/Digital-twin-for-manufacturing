import { Router } from "express";
import { query, queryOne } from "../db.js";
import {
  generateMachineReadings,
  calculateHealthScore,
  calculateOEE,
  checkAlertThresholds,
} from "../services/simulation.js";

const router = Router({ mergeParams: true });

// POST /api/v1/factory/:factoryId/simulate — generate readings for all machines
router.post("/", async (req, res) => {
  try {
    const factoryId = req.params.factoryId;
    const tenantId = req.tenantId;

    const machines = await query(
      "SELECT * FROM machines WHERE factory_id = $1 AND tenant_id = $2",
      [factoryId, tenantId]
    );

    const results = [];

    for (const machine of machines) {
      const readings = generateMachineReadings(machine);

      // Store readings
      for (const reading of readings) {
        await queryOne(
          `INSERT INTO sensor_readings (machine_id, tenant_id, metric_type, value, source, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            machine.id,
            tenantId,
            reading.metric_type,
            reading.value,
            "simulated",
            reading.timestamp,
          ]
        );

        // Update machine status based on simulation
        if (reading.newStatus && reading.newStatus !== machine.status) {
          await queryOne(
            "UPDATE machines SET status = $1 WHERE id = $2",
            [reading.newStatus, machine.id]
          );
          machine.status = reading.newStatus;
        }
      }

      // Get recent readings for calculations
      const recentReadings = await query(
        `SELECT * FROM sensor_readings
         WHERE machine_id = $1 AND tenant_id = $2
         ORDER BY timestamp DESC LIMIT 100`,
        [machine.id, tenantId]
      );

      // Calculate metrics (SRS §6 — application calculates, AI interprets)
      const healthScore = calculateHealthScore(machine, recentReadings);
      const oee = calculateOEE(machine, recentReadings);

      // Check alert thresholds
      const alerts = checkAlertThresholds(
        { ...machine, status: machine.status },
        readings
      );

      // Store alerts
      for (const alert of alerts) {
        await queryOne(
          `INSERT INTO alerts (machine_id, tenant_id, type, severity, calculated_value, threshold, message)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            machine.id,
            tenantId,
            alert.type,
            alert.severity,
            alert.calculatedValue,
            alert.threshold,
            alert.message,
          ]
        );
      }

      results.push({
        machineId: machine.id,
        name: machine.name,
        status: machine.status,
        healthScore,
        oee,
        readingsCount: readings.length,
        alertsCount: alerts.length,
      });
    }

    res.json({
      simulated: results.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ message: "Simulation failed", error: err.message });
  }
});

// GET /api/v1/factory/:factoryId/simulate/status — get current simulation status
router.get("/status", async (req, res) => {
  try {
    const factoryId = req.params.factoryId;
    const tenantId = req.tenantId;

    const machines = await query(
      `SELECT m.id, m.name, m.status,
       (SELECT value FROM sensor_readings WHERE machine_id = m.id AND metric_type = 'temperature' ORDER BY timestamp DESC LIMIT 1) as temperature,
       (SELECT value FROM sensor_readings WHERE machine_id = m.id AND metric_type = 'efficiency' ORDER BY timestamp DESC LIMIT 1) as efficiency,
       (SELECT value FROM sensor_readings WHERE machine_id = m.id AND metric_type = 'power' ORDER BY timestamp DESC LIMIT 1) as power,
       (SELECT COUNT(*) FROM alerts WHERE machine_id = m.id AND resolved_at IS NULL) as active_alerts
       FROM machines m WHERE m.factory_id = $1 AND m.tenant_id = $2`,
      [factoryId, tenantId]
    );

    res.json({ machines });
  } catch (err) {
    res.status(500).json({ message: "Failed to get status", error: err.message });
  }
});

export default router;

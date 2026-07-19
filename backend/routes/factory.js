import { Router } from "express";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { query, queryOne } from "../db.js";
import { calculateHealthScore } from "../services/simulation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const router = Router();

// GET /api/v1/factories — list all factories for tenant
router.get("/", async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM factories WHERE tenant_id = $1 ORDER BY created_at DESC",
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch factories", error: err.message });
  }
});

// POST /api/v1/factories — create a factory
router.post("/", async (req, res) => {
  try {
    const { name, address, scaleUnit } = req.body;
    const row = await queryOne(
      `INSERT INTO factories (tenant_id, name, address, scale_unit)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.tenantId, name, address || null, scaleUnit || "meters"]
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ message: "Failed to create factory", error: err.message });
  }
});

// GET /api/v1/factories/:id — get factory by ID
router.get("/:id", async (req, res) => {
  try {
    const row = await queryOne(
      "SELECT * FROM factories WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId]
    );
    if (!row) return res.status(404).json({ message: "Factory not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch factory", error: err.message });
  }
});

// GET /api/v1/factories/:id/dashboard — aggregated dashboard data
router.get("/:id/dashboard", async (req, res) => {
  try {
    const factoryId = req.params.id;
    const tenantId = req.tenantId;

    const machines = await query(
      "SELECT * FROM machines WHERE factory_id = $1 AND tenant_id = $2",
      [factoryId, tenantId]
    );

    const recentReadings = await query(
      `SELECT machine_id, metric_type, AVG(value)::DECIMAL(10,2) as avg_value
       FROM sensor_readings
       WHERE tenant_id = $1 AND timestamp > NOW() - INTERVAL '1 hour'
       GROUP BY machine_id, metric_type`,
      [tenantId]
    );

    const activeAlerts = await query(
      `SELECT a.*, m.name as machine_name
       FROM alerts a
       JOIN machines m ON a.machine_id = m.id
       WHERE a.tenant_id = $1 AND a.resolved_at IS NULL
       ORDER BY a.triggered_at DESC
       LIMIT 20`,
      [tenantId]
    );

    // Get product data from uploaded CSV files
    const productFiles = await query(
      `SELECT extraction_result FROM uploaded_files
       WHERE factory_id = $1 AND tenant_id = $2 AND file_type = 'product_data' AND extraction_status = 'completed'`,
      [factoryId, tenantId]
    );
    let products = [];
    for (const f of productFiles) {
      const result = f.extraction_result;
      if (result?.fields?.products?.value) {
        products = [...products, ...result.fields.products.value];
      }
    }

    const totalMachines = machines.length;
    const activeMachines = machines.filter((m) => m.status === "Running").length;

    const avgEfficiency =
      recentReadings
        .filter((r) => r.metric_type === "efficiency")
        .reduce((sum, r) => sum + parseFloat(r.avg_value), 0) /
        (recentReadings.filter((r) => r.metric_type === "efficiency").length || 1);

    const machinesWithHealth = machines.map((m) => {
      const machineReadings = recentReadings
        .filter((r) => r.machine_id === m.id)
        .map((r) => ({ metric_type: r.metric_type, value: r.avg_value }));
      const healthScore = calculateHealthScore(m, machineReadings);
      return { ...m, healthScore, readings: machineReadings };
    });

    res.json({
      factoryId,
      totalMachines,
      activeMachines,
      avgEfficiency: Math.round(avgEfficiency),
      alertCount: activeAlerts.length,
      alerts: activeAlerts,
      machines: machinesWithHealth,
      products,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch dashboard", error: err.message });
  }
});

// GET /api/v1/factories/:id/floor-plan-data — parsed wall/room geometry
router.get("/:id/floor-plan-data", async (req, res) => {
  try {
    const factoryId = req.params.id;
    const dataPath = join(__dirname, "..", "uploads", `floor_plan_${factoryId}.json`);

    if (!existsSync(dataPath)) {
      return res.json({ walls: [], rooms: [], wall_height: 3.0 });
    }

    const data = JSON.parse(readFileSync(dataPath, "utf8"));
    res.json(data);
  } catch (err) {
    res.json({ walls: [], rooms: [], wall_height: 3.0 });
  }
});

// PUT /api/v1/factories/:id — update factory
router.put("/:id", async (req, res) => {
  try {
    const { name, address, scaleUnit, widthMeters, depthMeters } = req.body;
    const row = await queryOne(
      `UPDATE factories SET name = COALESCE($3, name), address = COALESCE($4, address),
       scale_unit = COALESCE($5, scale_unit),
       width_meters = COALESCE($6, width_meters),
       depth_meters = COALESCE($7, depth_meters)
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenantId, name, address, scaleUnit, widthMeters, depthMeters]
    );
    if (!row) return res.status(404).json({ message: "Factory not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: "Failed to update factory", error: err.message });
  }
});

// GET /api/v1/factories/:id/placements — get all machine positions for a factory
router.get("/:id/placements", async (req, res) => {
  try {
    const factoryId = req.params.id;
    const tenantId = req.tenantId;

    const rows = await query(
      `SELECT mp.*, m.name as machine_name
       FROM machine_placements mp
       JOIN machines m ON mp.machine_id = m.id
       WHERE m.factory_id = $1 AND mp.tenant_id = $2
       ORDER BY mp.created_at`,
      [factoryId, tenantId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch placements", error: err.message });
  }
});

// PUT /api/v1/factories/:id/placements — upsert machine positions (batch save on drag end)
router.put("/:id/placements", async (req, res) => {
  try {
    const factoryId = req.params.id;
    const tenantId = req.tenantId;
    const { placements } = req.body;

    if (!Array.isArray(placements)) {
      return res.status(400).json({ message: "placements must be an array" });
    }

    const saved = [];
    for (const p of placements) {
      const existing = await queryOne(
        `SELECT mp.id FROM machine_placements mp
         JOIN machines m ON mp.machine_id = m.id
         WHERE m.id = $1 AND m.factory_id = $2 AND mp.tenant_id = $3`,
        [p.machineId, factoryId, tenantId]
      );

      if (existing) {
        const row = await queryOne(
          `UPDATE machine_placements SET
           x = $3, z = $4, rotation_y = $5
           WHERE id = $1 AND tenant_id = $2 RETURNING *`,
          [existing.id, tenantId, p.x || 0, p.z || 0, p.rotationY || 0]
        );
        saved.push(row);
      } else {
        let layoutId = null;
        const layout = await queryOne(
          `SELECT id FROM factory_layouts WHERE factory_id = $1 AND tenant_id = $2`,
          [factoryId, tenantId]
        );
        if (layout) {
          layoutId = layout.id;
        } else {
          const newLayout = await queryOne(
            `INSERT INTO factory_layouts (factory_id, tenant_id, status)
             VALUES ($1, $2, 'confirmed') RETURNING id`,
            [factoryId, tenantId]
          );
          layoutId = newLayout.id;
        }

        const row = await queryOne(
          `INSERT INTO machine_placements (machine_id, layout_id, tenant_id, x, z, rotation_y, placement_confidence)
           VALUES ($1, $2, $3, $4, $5, $6, 'manual') RETURNING *`,
          [p.machineId, layoutId, tenantId, p.x || 0, p.z || 0, p.rotationY || 0]
        );
        saved.push(row);
      }
    }
    res.json(saved);
  } catch (err) {
    res.status(500).json({ message: "Failed to save placements", error: err.message });
  }
});

// DELETE /api/v1/factories/:id
router.delete("/:id", async (req, res) => {
  try {
    const row = await queryOne(
      "DELETE FROM factories WHERE id = $1 AND tenant_id = $2 RETURNING id",
      [req.params.id, req.tenantId]
    );
    if (!row) return res.status(404).json({ message: "Factory not found" });
    res.json({ message: "Factory deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete factory", error: err.message });
  }
});

export default router;

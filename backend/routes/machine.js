import { Router } from "express";
import { unlink } from "fs/promises";
import { join } from "path";
import { query, queryOne } from "../db.js";

const router = Router({ mergeParams: true });

// GET /api/v1/factory/:factoryId/machines — list all machines with latest placements
// Optional query: ?floor_level=N to filter by floor
router.get("/", async (req, res) => {
  try {
    const { floor_level } = req.query;
    let sql = `SELECT m.*,
        mp.x as placement_x, mp.z as placement_z, mp.rotation_y as placement_rotation_y
       FROM machines m
       LEFT JOIN machine_placements mp ON mp.machine_id = m.id
         AND mp.id = (
           SELECT mp2.id FROM machine_placements mp2
           WHERE mp2.machine_id = m.id AND mp2.tenant_id = $2
           ORDER BY mp2.created_at DESC LIMIT 1
         )
       WHERE m.factory_id = $1 AND m.tenant_id = $2`;
    const params = [req.params.factoryId, req.tenantId];

    if (floor_level !== undefined && floor_level !== "" && floor_level !== null) {
      params.push(parseInt(floor_level, 10));
      sql += ` AND m.floor_level = $${params.length}`;
    }
    sql += " ORDER BY m.created_at";

    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch machines", error: err.message });
  }
});

// GET /api/v1/factory/:factoryId/machines/:id — get machine by ID
router.get("/:id", async (req, res) => {
  try {
    const row = await queryOne(
      "SELECT * FROM machines WHERE id = $1 AND factory_id = $2 AND tenant_id = $3",
      [req.params.id, req.params.factoryId, req.tenantId]
    );
    if (!row) return res.status(404).json({ message: "Machine not found" });

    // Get latest readings
    const readings = await query(
      `SELECT * FROM sensor_readings
       WHERE machine_id = $1 AND tenant_id = $2
       ORDER BY timestamp DESC LIMIT 50`,
      [req.params.id, req.tenantId]
    );

    // Get active alerts
    const alerts = await query(
      `SELECT * FROM alerts
       WHERE machine_id = $1 AND tenant_id = $2 AND resolved_at IS NULL
       ORDER BY triggered_at DESC`,
      [req.params.id, req.tenantId]
    );

    res.json({ ...row, readings, alerts });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch machine", error: err.message });
  }
});

// POST /api/v1/factory/:factoryId/machines — create machine
router.post("/", async (req, res) => {
  try {
    const {
      name, type, manufacturer, glbModelRef,
      footprintLength, footprintWidth, footprintHeight,
      powerDrawRating, installDate,
    } = req.body;

    const row = await queryOne(
      `INSERT INTO machines (factory_id, tenant_id, name, type, manufacturer,
       glb_model_ref, footprint_length, footprint_width, footprint_height,
       power_draw_rating, install_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        req.params.factoryId, req.tenantId, name, type, manufacturer,
        glbModelRef, footprintLength, footprintWidth, footprintHeight,
        powerDrawRating, installDate,
      ]
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ message: "Failed to create machine", error: err.message });
  }
});

// PUT /api/v1/factory/:factoryId/machines/:id — update machine
router.put("/:id", async (req, res) => {
  try {
    const {
      name, type, manufacturer, glbModelRef,
      footprintLength, footprintWidth, footprintHeight,
      powerDrawRating, installDate, status,
    } = req.body;

    const row = await queryOne(
      `UPDATE machines SET
       name = COALESCE($4, name), type = COALESCE($5, type),
       manufacturer = COALESCE($6, manufacturer),
       glb_model_ref = COALESCE($7, glb_model_ref),
       footprint_length = COALESCE($8, footprint_length),
       footprint_width = COALESCE($9, footprint_width),
       footprint_height = COALESCE($10, footprint_height),
       power_draw_rating = COALESCE($11, power_draw_rating),
       install_date = COALESCE($12, install_date)
       WHERE id = $1 AND factory_id = $2 AND tenant_id = $3 RETURNING *`,
      [
        req.params.id, req.params.factoryId, req.tenantId,
        name, type, manufacturer, glbModelRef,
        footprintLength, footprintWidth, footprintHeight,
        powerDrawRating, installDate,
      ]
    );
    if (!row) return res.status(404).json({ message: "Machine not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: "Failed to update machine", error: err.message });
  }
});

// GET /api/v1/factory/:factoryId/machines/:id/readings — get sensor readings
router.get("/:id/readings", async (req, res) => {
  try {
    const { metric_type, limit = 100, since } = req.query;
    let sql = "SELECT * FROM sensor_readings WHERE machine_id = $1 AND tenant_id = $2";
    const params = [req.params.id, req.tenantId];

    if (metric_type) {
      params.push(metric_type);
      sql += ` AND metric_type = $${params.length}`;
    }
    if (since) {
      params.push(since);
      sql += ` AND timestamp > $${params.length}`;
    }

    params.push(parseInt(limit, 10));
    sql += ` ORDER BY timestamp DESC LIMIT $${params.length}`;

    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch readings", error: err.message });
  }
});

// POST /api/v1/factory/:factoryId/machines/:id/readings — record readings (from simulation or IoT)
router.post("/:id/readings", async (req, res) => {
  try {
    const readings = Array.isArray(req.body) ? req.body : [req.body];
    const created = [];

    for (const reading of readings) {
      const row = await queryOne(
        `INSERT INTO sensor_readings (machine_id, tenant_id, metric_type, value, source, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          req.params.id, req.tenantId,
          reading.metric_type, reading.value,
          reading.source || "simulated",
          reading.timestamp || new Date().toISOString(),
        ]
      );
      created.push(row);
    }

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: "Failed to record readings", error: err.message });
  }
});

// DELETE /api/v1/factory/:factoryId/machines/:id
router.delete("/:id", async (req, res) => {
  try {
    // Fetch machine first to get file references for cleanup
    const machine = await queryOne(
      "SELECT id, glb_model_ref FROM machines WHERE id = $1 AND factory_id = $2 AND tenant_id = $3",
      [req.params.id, req.params.factoryId, req.tenantId]
    );
    if (!machine) return res.status(404).json({ message: "Machine not found" });

    // Delete from DB (cascades to sensor_readings, alerts, machine_placements, maintenance_events)
    await queryOne(
      "DELETE FROM machines WHERE id = $1 AND factory_id = $2 AND tenant_id = $3 RETURNING id",
      [req.params.id, req.params.factoryId, req.tenantId]
    );

    // Clean up physical GLB file from disk
    if (machine.glb_model_ref) {
      const glbPath = join(process.cwd(), "uploads", machine.glb_model_ref);
      await unlink(glbPath).catch(() => {});
    }

    res.json({ message: "Machine deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete machine", error: err.message });
  }
});

export default router;

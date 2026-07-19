import { Router } from "express";
import { query, queryOne } from "../db.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { unlink } from "fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, "..", process.env.UPLOAD_DIR_NAME || "uploads");

const router = Router({ mergeParams: true });

// GET /api/v1/factory/:factoryId/floors — list all floors
router.get("/", async (req, res) => {
  try {
    const factoryId = req.params.factoryId;
    const tenantId = req.tenantId;
    const rows = await query(
      `SELECT f.*,
        (SELECT COUNT(*) FROM machines m WHERE m.factory_id = f.factory_id AND m.floor_level = f.floor_number) as machine_count
       FROM floors f
       WHERE f.factory_id = $1 AND f.tenant_id = $2
       ORDER BY f.floor_number`,
      [factoryId, tenantId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch floors", error: err.message });
  }
});

// POST /api/v1/factory/:factoryId/floors — add a new floor
router.post("/", async (req, res) => {
  try {
    const factoryId = req.params.factoryId;
    const tenantId = req.tenantId;
    const { floorNumber, name } = req.body;

    // Get the next floor number if not specified
    let nextFloorNum = floorNumber;
    if (!nextFloorNum) {
      const lastFloor = await queryOne(
        "SELECT MAX(floor_number) as max_floor FROM floors WHERE factory_id = $1 AND tenant_id = $2",
        [factoryId, tenantId]
      );
      nextFloorNum = (lastFloor?.max_floor || 0) + 1;
    }

    // Check if floor number already exists
    const existing = await queryOne(
      "SELECT id FROM floors WHERE factory_id = $1 AND tenant_id = $2 AND floor_number = $3",
      [factoryId, tenantId, nextFloorNum]
    );
    if (existing) {
      return res.status(409).json({ message: `Floor ${nextFloorNum} already exists` });
    }

    // Get factory dimensions for default floor size
    const factory = await queryOne(
      "SELECT width_meters, depth_meters FROM factories WHERE id = $1",
      [factoryId]
    );

    const row = await queryOne(
      `INSERT INTO floors (factory_id, tenant_id, floor_number, name, width_meters, depth_meters)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        factoryId,
        tenantId,
        nextFloorNum,
        name || `Floor ${nextFloorNum}`,
        factory?.width_meters || 20,
        factory?.depth_meters || 15,
      ]
    );

    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ message: "Failed to create floor", error: err.message });
  }
});

// PUT /api/v1/factory/:factoryId/floors/:floorId — update a floor
router.put("/:floorId", async (req, res) => {
  try {
    const { floorId } = req.params;
    const tenantId = req.tenantId;
    const { name, floorPlanRef } = req.body;

    const updates = [];
    const params = [];
    let paramIdx = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIdx++}`);
      params.push(name);
    }
    if (floorPlanRef !== undefined) {
      updates.push(`floor_plan_ref = $${paramIdx++}`);
      params.push(floorPlanRef);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    params.push(floorId, tenantId);
    const row = await queryOne(
      `UPDATE floors SET ${updates.join(", ")} WHERE id = $${paramIdx++} AND tenant_id = $${paramIdx} RETURNING *`,
      params
    );

    if (!row) {
      return res.status(404).json({ message: "Floor not found" });
    }

    res.json(row);
  } catch (err) {
    res.status(500).json({ message: "Failed to update floor", error: err.message });
  }
});

// DELETE /api/v1/factory/:factoryId/floors/:floorId — delete a floor
router.delete("/:floorId", async (req, res) => {
  try {
    const { floorId } = req.params;
    const tenantId = req.tenantId;

    const floor = await queryOne(
      "SELECT * FROM floors WHERE id = $1 AND tenant_id = $2",
      [floorId, tenantId]
    );
    if (!floor) {
      return res.status(404).json({ message: "Floor not found" });
    }

    // Don't allow deleting the last floor
    const count = await queryOne(
      "SELECT COUNT(*) as cnt FROM floors WHERE factory_id = $1 AND tenant_id = $2",
      [floor.factory_id, tenantId]
    );
    if (count.cnt <= 1) {
      return res.status(400).json({ message: "Cannot delete the last floor" });
    }

    // Move machines on this floor to floor 1
    await query(
      "UPDATE machines SET floor_level = 1 WHERE factory_id = $1 AND tenant_id = $2 AND floor_level = $3",
      [floor.factory_id, tenantId, floor.floor_number]
    );
    await query(
      "UPDATE machine_placements SET floor_level = 1 WHERE tenant_id = $1 AND floor_level = $2",
      [tenantId, floor.floor_number]
    );

    // Delete floor plan file if exists
    if (floor.floor_plan_ref) {
      const filePath = join(UPLOAD_DIR, floor.floor_plan_ref);
      await unlink(filePath).catch(() => {});
    }

    await queryOne("DELETE FROM floors WHERE id = $1 AND tenant_id = $2", [floorId, tenantId]);

    res.json({ message: "Floor deleted" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete floor", error: err.message });
  }
});

export default router;

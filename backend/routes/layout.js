import { Router } from "express";
import { query, queryOne } from "../db.js";
import { proposeLayout } from "../services/solver.js";

const router = Router({ mergeParams: true });

// GET /api/v1/factory/:factoryId/layout — get current layout
router.get("/", async (req, res) => {
  try {
    const factoryId = req.params.factoryId;
    const tenantId = req.tenantId;

    const layout = await queryOne(
      `SELECT * FROM factory_layouts
       WHERE factory_id = $1 AND tenant_id = $2 AND status = 'confirmed'
       ORDER BY version DESC LIMIT 1`,
      [factoryId, tenantId]
    );

    if (!layout) {
      // Check for proposed layout
      const proposed = await queryOne(
        `SELECT * FROM factory_layouts
         WHERE factory_id = $1 AND tenant_id = $2 AND status = 'proposed'
         ORDER BY created_at DESC LIMIT 1`,
        [factoryId, tenantId]
      );
      if (proposed) {
        const placements = await query(
          "SELECT * FROM machine_placements WHERE layout_id = $1 AND tenant_id = $2",
          [proposed.id, tenantId]
        );
        return res.json({ ...proposed, placements, machines: [] });
      }
      return res.json({ status: "none", placements: [], machines: [] });
    }

    const placements = await query(
      `SELECT mp.*, m.name, m.type, m.footprint_length, m.footprint_width, m.footprint_height,
       m.power_draw_rating, m.glb_model_ref
       FROM machine_placements mp
       JOIN machines m ON mp.machine_id = m.id
       WHERE mp.layout_id = $1 AND mp.tenant_id = $2`,
      [layout.id, tenantId]
    );

    res.json({ ...layout, placements });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch layout", error: err.message });
  }
});

// POST /api/v1/factory/:factoryId/layout/propose — generate layout proposal
router.post("/propose", async (req, res) => {
  try {
    const factoryId = req.params.factoryId;
    const tenantId = req.tenantId;

    // Get all machines for this factory
    const machines = await query(
      "SELECT * FROM machines WHERE factory_id = $1 AND tenant_id = $2",
      [factoryId, tenantId]
    );

    if (machines.length === 0) {
      return res.status(400).json({ message: "No machines found for this factory" });
    }

    // Get floor boundary from request or use defaults
    const {
      boundary = { minX: -15, maxX: 15, minZ: -15, maxZ: 15 },
      obstructions = [],
      utilities = [],
      processSequence = [],
    } = req.body;

    // Run constraint solver
    const result = proposeLayout({
      machines: machines.map((m) => ({
        id: m.id,
        name: m.name,
        position: [0, 0, 0],
        footprint: {
          length: parseFloat(m.footprint_length) || 1,
          width: parseFloat(m.footprint_width) || 1,
          height: parseFloat(m.footprint_height) || 1,
        },
        clearance: { front: 0.5, back: 0.5, left: 0.5, right: 0.5 },
      })),
      boundary,
      obstructions,
      utilities,
      processSequence,
    });

    // Create new layout record
    const layout = await queryOne(
      `INSERT INTO factory_layouts (factory_id, tenant_id, version, status, created_by)
       VALUES ($1, $2, 1, 'proposed', $3) RETURNING *`,
      [factoryId, tenantId, req.user?.uid]
    );

    // Insert placements
    for (const placement of result.placements) {
      await queryOne(
        `INSERT INTO machine_placements (machine_id, layout_id, tenant_id, x, y, z, rotation, placement_confidence)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          placement.machineId, layout.id, tenantId,
          placement.x, placement.y, placement.z,
          placement.rotation, placement.confidence,
        ]
      );
    }

    res.json({
      layout,
      placements: result.placements,
      unplaced: result.unplaced,
      summary: result.summary,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to propose layout", error: err.message });
  }
});

// PUT /api/v1/factory/:factoryId/layout/confirm — confirm finalized layout
router.put("/confirm", async (req, res) => {
  try {
    const factoryId = req.params.factoryId;
    const tenantId = req.tenantId;

    const { layoutId, placements } = req.body;

    // Get the proposed layout
    const layout = await queryOne(
      `SELECT * FROM factory_layouts
       WHERE id = $1 AND factory_id = $2 AND tenant_id = $3 AND status = 'proposed'`,
      [layoutId, factoryId, tenantId]
    );

    if (!layout) {
      return res.status(404).json({ message: "No proposed layout found" });
    }

    // Update placement positions if provided
    if (placements && Array.isArray(placements)) {
      for (const p of placements) {
        await queryOne(
          `UPDATE machine_placements
           SET x = $1, y = $2, z = $3, rotation = $4, placement_confidence = 'manual'
           WHERE id = $5 AND tenant_id = $6`,
          [p.x, p.y || 0, p.z, p.rotation || 0, p.id, tenantId]
        );
      }
    }

    // Confirm layout
    const confirmed = await queryOne(
      `UPDATE factory_layouts SET status = 'confirmed', confirmed_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [layout.id, tenantId]
    );

    res.json({ layout: confirmed, message: "Layout confirmed" });
  } catch (err) {
    res.status(500).json({ message: "Failed to confirm layout", error: err.message });
  }
});

export default router;

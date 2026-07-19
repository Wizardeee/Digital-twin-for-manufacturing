import { Router } from "express";
import multer from "multer";
import { join, extname, dirname } from "path";
import { unlink, readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import { query, queryOne } from "../db.js";
import { extractFromFile } from "../services/extraction.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = join(__dirname, "..", process.env.UPLOAD_DIR_NAME || "uploads");
const ANALYZER_SCRIPT = join(__dirname, "..", "scripts", "analyze_floor_plan.py");

const router = Router({ mergeParams: true });
const WALL_HEIGHT = 3.0;

async function runFloorPlanAnalyzer(imagePath, factoryId, factoryWidth, factoryDepth) {
  const outputPath = join(UPLOAD_DIR, `floor_plan_${factoryId}.json`);
  try {
    await execFileAsync("python3", [
      ANALYZER_SCRIPT, imagePath,
      String(factoryWidth), String(factoryDepth), outputPath,
    ], { timeout: 30000 });
    const data = JSON.parse(await readFile(outputPath, "utf-8"));
    return data;
  } catch (err) {
    console.error("[FloorPlanAnalyzer] failed:", err.message);
    return null;
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".glb", ".pdf", ".csv", ".xlsx", ".dxf", ".png", ".jpg", ".jpeg", ".svg"];
    const ext = extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}`));
    }
  },
});

function detectFileType(file) {
  const ext = extname(file.originalname).toLowerCase();
  const name = file.originalname.toLowerCase();
  if (ext === ".glb") return "glb";
  if (ext === ".dxf" || (ext === ".pdf" && name.includes("floor"))) return "floor_plan";
  if (ext === ".csv" || ext === ".xlsx") {
    if (name.includes("product") || name.includes("process")) return "product_data";
    return "spec_sheet";
  }
  if ([".png", ".jpg", ".jpeg", ".svg"].includes(ext)) return "floor_plan";
  if (ext === ".pdf") {
    return "spec_sheet";
  }
  return "unknown";
}

// POST /api/v1/factory/:factoryId/upload
router.post("/", upload.fields([
  { name: "floorPlan", maxCount: 1 },
  { name: "machineSpecs", maxCount: 20 },
  { name: "glbModels", maxCount: 20 },
  { name: "productData", maxCount: 1 },
]), async (req, res) => {
  try {
    const factoryId = req.params.factoryId;
    const tenantId = req.tenantId;

    const factory = await queryOne(
      "SELECT id FROM factories WHERE id = $1 AND tenant_id = $2",
      [factoryId, tenantId]
    );
    if (!factory) {
      return res.status(404).json({ message: "Factory not found" });
    }

    const allFiles = [];
    for (const field of ["floorPlan", "machineSpecs", "glbModels", "productData"]) {
      if (req.files[field]) allFiles.push(...req.files[field]);
    }

    const results = [];
    const createdMachines = [];

    for (const file of allFiles) {
      const fileType = detectFileType(file);
      const filePath = join(UPLOAD_DIR, file.filename);

      const fileRecord = await queryOne(
        `INSERT INTO uploaded_files (factory_id, tenant_id, file_type, original_name, stored_path, mime_type, extraction_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'processing') RETURNING *`,
        [factoryId, tenantId, fileType, file.originalname, filePath, file.mimetype]
      );

      const extraction = await extractFromFile(filePath, fileType);

      await queryOne(
        `UPDATE uploaded_files SET extraction_result = $1, extraction_status = $2 WHERE id = $3`,
        [JSON.stringify(extraction), extraction.error ? "failed" : "completed", fileRecord.id]
      );

      const resultItem = {
        fileId: fileRecord.id,
        filename: file.originalname,
        type: fileType,
        status: extraction.error ? "failed" : "completed",
        message: extraction.error || null,
      };

      // If GLB, create a machine record
      if (fileType === "glb" && !extraction.error) {
        const boundingBox = extraction.fields.boundingBox?.value;
        const size = boundingBox?.size || [1, 1, 1];

        const machine = await queryOne(
          `INSERT INTO machines (factory_id, tenant_id, name, type, glb_model_ref, footprint_length, footprint_width, footprint_height, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Idle') RETURNING *`,
          [
            factoryId,
            tenantId,
            file.originalname.replace(".glb", ""),
            "unknown",
            file.filename,
            Math.abs(size[0]) || 1,
            Math.abs(size[2]) || 1,
            Math.abs(size[1]) || 1,
          ]
        );

        resultItem.machine = { id: machine.id, name: machine.name };
        createdMachines.push(machine);
      }

      // If spec sheet, create machines from extracted data
      if (fileType === "spec_sheet" && !extraction.error) {
        const extractedMachines = extraction.fields.machines?.value || [];
        const createdFromSpec = [];

        for (const spec of extractedMachines) {
          const machineName = spec.name?.value;
          if (!machineName || machineName.length < 2) continue;

          // Check if a machine with this name already exists
          const existingMachine = await queryOne(
            `SELECT id FROM machines WHERE factory_id = $1 AND tenant_id = $2 AND LOWER(name) = LOWER($3)`,
            [factoryId, tenantId, machineName]
          );

          if (existingMachine) continue;

          // Extract properties from PDF extraction
          let footprintLength = 2.0;
          let footprintWidth = 2.0;
          let footprintHeight = WALL_HEIGHT * 0.35;
          let machineType = spec.zone?.value || "manufacturing";
          let manufacturer = spec.manufacturer?.value || null;
          let powerRating = null;

          // Parse power from capacity string
          if (spec.capacity?.value) {
            const capStr = spec.capacity.value;
            const powerMatch = capStr.match(/(\d+\.?\d*)\s*(kW|MW|HP)/i);
            if (powerMatch) {
              let val = parseFloat(powerMatch[1]);
              if (powerMatch[2].toUpperCase() === "MW") val *= 1000;
              if (powerMatch[2].toUpperCase() === "HP") val *= 0.746;
              powerRating = val;
            }
            // Parse dimensions from capacity
            const dimMatch = capStr.match(/(\d+\.?\d*)\s*x\s*(\d+\.?\d*)/i);
            if (dimMatch) {
              footprintLength = parseFloat(dimMatch[1]);
              footprintWidth = parseFloat(dimMatch[2]);
            }
          }

          // Use installed year as proxy for age-based sizing
          const installedYear = spec.installedYear?.value;
          const status = spec.status?.value || "Operational";

          const machine = await queryOne(
            `INSERT INTO machines (factory_id, tenant_id, name, type, manufacturer,
             footprint_length, footprint_width, footprint_height, power_draw_rating,
             install_date, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [
              factoryId,
              tenantId,
              machineName,
              machineType,
              manufacturer,
              footprintLength,
              footprintWidth,
              footprintHeight,
              powerRating,
              installedYear ? `${installedYear}-01-01` : null,
              status,
            ]
          );

          // Create a default placement
          const placementIndex = createdFromSpec.length;
          const cols = Math.ceil(Math.sqrt(extractedMachines.length));
          const row = Math.floor(placementIndex / cols);
          const col = placementIndex % cols;
          const xPos = (col - (cols - 1) / 2) * 4;
          const zPos = (row - (cols - 1) / 2) * 4;

          // Ensure a factory layout exists
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

          await queryOne(
            `INSERT INTO machine_placements (machine_id, layout_id, tenant_id, x, z, placement_confidence)
             VALUES ($1, $2, $3, $4, $5, 'extracted') ON CONFLICT DO NOTHING`,
            [machine.id, layoutId, tenantId, xPos, zPos]
          );

          createdFromSpec.push(machine);
        }

        if (createdFromSpec.length > 0) {
          resultItem.machinesCreated = createdFromSpec.length;
          resultItem.note = `${createdFromSpec.length} machine(s) created from PDF spec sheet`;
          createdMachines.push(...createdFromSpec);
        } else if (extractedMachines.length > 0) {
          resultItem.note = "All machines from spec sheet already exist";
        } else {
          resultItem.note = "No machines could be extracted from spec sheet";
        }
      }

      // If floor plan, update the factory's floor_plan_ref and run analyzer
      if (fileType === "floor_plan" && !extraction.error) {
        const ext = extname(file.originalname).toLowerCase();
        const isImage = [".png", ".jpg", ".jpeg", ".svg"].includes(ext);
        await queryOne(
          "UPDATE factories SET floor_plan_ref = $1 WHERE id = $2",
          [file.filename, factoryId]
        );
        resultItem.floorPlanUrl = isImage ? `/uploads/${file.filename}` : null;

        // Auto-run floor plan analyzer for image files
        if (isImage) {
          const factoryDims = await queryOne(
            "SELECT width_meters, depth_meters FROM factories WHERE id = $1",
            [factoryId]
          );
          const fWidth = parseFloat(factoryDims?.width_meters) || 20;
          const fDepth = parseFloat(factoryDims?.depth_meters) || 15;
          const filePath = join(UPLOAD_DIR, file.filename);
          const analyzed = await runFloorPlanAnalyzer(filePath, factoryId, fWidth, fDepth);
          if (analyzed) {
            resultItem.floorPlanAnalyzed = true;
            resultItem.wallCount = analyzed.walls?.length || 0;
            resultItem.roomCount = analyzed.rooms?.length || 0;
          }
        }
      }

      // If product data CSV with machine references, create machine records
      if (fileType === "product_data" && !extraction.error) {
        const machineIds = extraction.fields.machineIds?.value || [];
        const products = extraction.fields.products?.value || [];

        // Get factory dimensions for layout
        const factoryDims = await queryOne(
          "SELECT width_meters, depth_meters FROM factories WHERE id = $1",
          [factoryId]
        );
        const fWidth = parseFloat(factoryDims?.width_meters) || 20;
        const fDepth = parseFloat(factoryDims?.depth_meters) || 15;

        // Get existing machines to avoid duplicates
        const existingMachines = await query(
          "SELECT name FROM machines WHERE factory_id = $1 AND tenant_id = $2",
          [factoryId, tenantId]
        );
        const existingNames = new Set(existingMachines.map((m) => m.name.toLowerCase()));

        // Count products per machine for sizing
        const machineProductCount = {};
        for (const p of products) {
          const ref = p.machinesUsed?.value || "";
          const ids = ref.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
          for (const id of ids) {
            machineProductCount[id] = (machineProductCount[id] || 0) + 1;
          }
        }

        // Create machines in a grid layout inside the factory
        const margin = 3;
        const innerW = fWidth - margin * 2;
        const innerD = fDepth - margin * 2;
        const cols = Math.ceil(Math.sqrt(machineIds.length * (innerW / innerD)));
        const rows = Math.ceil(machineIds.length / cols);
        const spacingX = cols > 1 ? innerW / (cols - 1) : 0;
        const spacingZ = rows > 1 ? innerD / (rows - 1) : 0;

        const createdProductMachines = [];
        for (let i = 0; i < machineIds.length; i++) {
          const machineId = machineIds[i];
          if (existingNames.has(machineId.toLowerCase())) continue;

          const col = i % cols;
          const row = Math.floor(i / cols);
          const posX = -innerW / 2 + col * spacingX;
          const posZ = -innerD / 2 + row * spacingZ;

          // Size based on how many products use this machine
          const prodCount = machineProductCount[machineId] || 1;
          const baseSize = Math.max(1.5, Math.min(4, 1 + prodCount * 0.4));

          const machine = await queryOne(
            `INSERT INTO machines (factory_id, tenant_id, name, type,
             footprint_length, footprint_width, footprint_height, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'Idle') RETURNING *`,
            [factoryId, tenantId, machineId, "unknown", baseSize, baseSize, baseSize]
          );

          // Save placement
          const layout = await queryOne(
            "SELECT id FROM factory_layouts WHERE factory_id = $1 AND tenant_id = $2",
            [factoryId, tenantId]
          );
          let layoutId = layout?.id;
          if (!layoutId) {
            const newLayout = await queryOne(
              "INSERT INTO factory_layouts (factory_id, tenant_id, status) VALUES ($1, $2, 'confirmed') RETURNING id",
              [factoryId, tenantId]
            );
            layoutId = newLayout.id;
          }
          await queryOne(
            `INSERT INTO machine_placements (machine_id, layout_id, tenant_id, x, z, rotation_y, placement_confidence)
             VALUES ($1, $2, $3, $4, $5, 0, 'extracted')`,
            [machine.id, layoutId, tenantId, posX, posZ]
          );

          createdProductMachines.push(machine);
          createdMachines.push(machine);
        }

        // Link CSV to created machines
        for (const m of createdProductMachines) {
          await queryOne(
            "UPDATE uploaded_files SET machine_id = $1 WHERE id = $2",
            [m.id, fileRecord.id]
          );
        }

        resultItem.note = `Extracted ${machineIds.length} machine IDs from ${products.length} products. Created ${createdProductMachines.length} new machine(s).`;
        resultItem.machineIds = machineIds;
        resultItem.machineCount = createdProductMachines.length;
      }

      results.push(resultItem);
    }

    // Auto-link non-GLB files to machines by name matching
    const existingMachines = await query(
      "SELECT id, name FROM machines WHERE factory_id = $1 AND tenant_id = $2",
      [factoryId, tenantId]
    );
    const allMachines = [...createdMachines, ...existingMachines];

    for (const resultItem of results) {
      if (resultItem.type === "glb") continue;
      const lowerName = resultItem.filename.toLowerCase();
      for (const machine of allMachines) {
        const machineNameLower = machine.name.toLowerCase();
        if (lowerName.includes(machineNameLower) || machineNameLower.includes(lowerName.replace(/\.[^.]+$/, ""))) {
          await queryOne(
            "UPDATE uploaded_files SET machine_id = $1 WHERE id = $2",
            [machine.id, resultItem.fileId]
          );
          resultItem.linkedMachine = { id: machine.id, name: machine.name };
          break;
        }
      }
    }

    res.json({
      uploaded: results.length,
      results,
      createdMachines,
      message: createdMachines.length > 0
        ? `Created ${createdMachines.length} machine(s). Go to 3D Viewer to see them.`
        : "Files uploaded and processed.",
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Upload failed", error: err.message });
  }
});

// GET /api/v1/factory/:factoryId/upload/files
router.get("/files", async (req, res) => {
  try {
    const rows = await query(
      `SELECT uf.*, m.name as machine_name, m.id as linked_machine_id
       FROM uploaded_files uf
       LEFT JOIN machines m ON uf.machine_id = m.id
       WHERE uf.factory_id = $1 AND uf.tenant_id = $2
       ORDER BY uf.created_at DESC`,
      [req.params.factoryId, req.tenantId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch files", error: err.message });
  }
});

// DELETE /api/v1/factory/:factoryId/upload/files/:fileId
router.delete("/files/:fileId", async (req, res) => {
  try {
    const { factoryId, tenantId } = { factoryId: req.params.factoryId, tenantId: req.tenantId };

    // Fetch file to get stored_path, file_type, and linked machine
    const file = await queryOne(
      "SELECT id, stored_path, file_type, machine_id FROM uploaded_files WHERE id = $1 AND factory_id = $2 AND tenant_id = $3",
      [req.params.fileId, factoryId, tenantId]
    );
    if (!file) return res.status(404).json({ message: "File not found" });

    // Collect machine IDs to delete (linked via machine_id)
    const machineIdsToDelete = new Set();
    if (file.machine_id) {
      machineIdsToDelete.add(file.machine_id);
    }

    // Also find machines where glb_model_ref matches this file's stored filename
    if (file.stored_path) {
      const filename = file.stored_path.split("/").pop();
      const glbMachine = await queryOne(
        "SELECT id FROM machines WHERE factory_id = $1 AND tenant_id = $2 AND glb_model_ref = $3",
        [factoryId, tenantId, filename]
      );
      if (glbMachine) machineIdsToDelete.add(glbMachine.id);
    }

    // Delete each linked machine and all its related data
    for (const machineId of machineIdsToDelete) {
      // Unlink any other uploaded_files referencing this machine
      await queryOne(
        "UPDATE uploaded_files SET machine_id = NULL WHERE machine_id = $1 AND id != $2",
        [machineId, file.id]
      );

      // Fetch GLB model ref for physical cleanup
      const machine = await queryOne(
        "SELECT glb_model_ref FROM machines WHERE id = $1",
        [machineId]
      );

      // Delete machine (cascades: sensor_readings, alerts, machine_placements, maintenance_events)
      await queryOne(
        "DELETE FROM machines WHERE id = $1 AND factory_id = $2 AND tenant_id = $3",
        [machineId, factoryId, tenantId]
      );

      // Clean up GLB file from disk
      if (machine?.glb_model_ref) {
        await unlink(join(UPLOAD_DIR, machine.glb_model_ref)).catch(() => {});
      }
    }

    // If this was a floor plan, clear the factory's floor_plan_ref
    if (file.file_type === "floor_plan") {
      const filename = file.stored_path?.split("/").pop();
      await queryOne(
        "UPDATE factories SET floor_plan_ref = NULL WHERE id = $1 AND floor_plan_ref = $2",
        [factoryId, filename]
      ).catch(() => {});
    }

    // Delete the uploaded_files record
    await queryOne(
      "DELETE FROM uploaded_files WHERE id = $1 AND factory_id = $2 AND tenant_id = $3 RETURNING id",
      [req.params.fileId, factoryId, tenantId]
    );

    // Clean up the physical upload file from disk
    if (file.stored_path) {
      const absPath = file.stored_path.startsWith("/")
        ? file.stored_path
        : join(UPLOAD_DIR, file.stored_path.replace(/^uploads\//, ""));
      await unlink(absPath).catch(() => {});
    }

    res.json({
      message: "File deleted",
      deletedMachines: machineIdsToDelete.size,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete file", error: err.message });
  }
});

// PUT /api/v1/factory/:factoryId/upload/files/:fileId/link — link file to a machine
router.put("/files/:fileId/link", async (req, res) => {
  try {
    const { machineId } = req.body;
    const row = await queryOne(
      `UPDATE uploaded_files SET machine_id = $4
       WHERE id = $1 AND factory_id = $2 AND tenant_id = $3 RETURNING *`,
      [req.params.fileId, req.params.factoryId, req.tenantId, machineId || null]
    );
    if (!row) return res.status(404).json({ message: "File not found" });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: "Failed to link file", error: err.message });
  }
});

export default router;

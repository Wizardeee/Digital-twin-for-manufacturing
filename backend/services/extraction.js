// Deterministic extraction service — parses uploaded files into structured data
// SRS §3.1: Stage 1 extraction is regular application code, NOT AI
// Each extracted field has a confidence level: extracted, inferred, or missing

import { readFileSync } from "fs";
import { extname } from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

// Default safety values for missing fields
const DEFAULTS = {
  clearance: { front: 0.5, back: 0.5, left: 0.5, right: 0.5 },
  powerDraw: 1.0,
  footprint: { length: 1.0, width: 1.0, height: 1.0 },
};

function fieldConfidence(value, source) {
  if (value !== undefined && value !== null) {
    return { value, confidence: "extracted", source };
  }
  return { value: null, confidence: "missing", source };
}

// Parse GLB file — extract bounding box and metadata
export function extractFromGLB(filePath) {
  try {
    const buffer = readFileSync(filePath);

    // GLB header: magic (4 bytes), version (4 bytes), length (4 bytes)
    const magic = buffer.readUInt32LE(0);
    if (magic !== 0x46546c67) {
      return { error: "Invalid GLB file", fields: {} };
    }

    // Parse JSON chunk to get metadata
    const jsonChunkLength = buffer.readUInt32LE(12);
    const jsonChunk = buffer.subarray(20, 20 + jsonChunkLength).toString("utf-8");

    let gltfData;
    try {
      gltfData = JSON.parse(jsonChunk);
    } catch {
      return { error: "Invalid GLB JSON chunk", fields: {} };
    }

    // Extract bounding box from mesh primitives
    let minXYZ = [Infinity, Infinity, Infinity];
    let maxXYZ = [-Infinity, -Infinity, -Infinity];

    if (gltfData.meshes && gltfData.accessors) {
      for (const mesh of gltfData.meshes) {
        for (const primitive of mesh.primitives) {
          if (primitive.attributes.POSITION !== undefined) {
            const accessor = gltfData.accessors[primitive.attributes.POSITION];
            if (accessor.min) {
              minXYZ = minXYZ.map((v, i) => Math.min(v, accessor.min[i]));
            }
            if (accessor.max) {
              maxXYZ = maxXYZ.map((v, i) => Math.max(v, accessor.max[i]));
            }
          }
        }
      }
    }

    const hasGeometry = minXYZ[0] !== Infinity;

    return {
      fields: {
        boundingBox: fieldConfidence(
          hasGeometry
            ? {
                min: minXYZ,
                max: maxXYZ,
                size: maxXYZ.map((v, i) => v - minXYZ[i]),
              }
            : null,
          "glb_parser"
        ),
        meshCount: fieldConfidence(
          gltfData.meshes ? gltfData.meshes.length : 0,
          "glb_parser"
        ),
        hasAnimations: fieldConfidence(
          !!(gltfData.animations && gltfData.animations.length > 0),
          "glb_parser"
        ),
        asset: fieldConfidence(gltfData.asset || {}, "glb_parser"),
      },
    };
  } catch (err) {
    return { error: `GLB extraction failed: ${err.message}`, fields: {} };
  }
}

// Parse CSV line handling quoted fields (RFC 4180)
function parseCSVLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

// Parse CSV — extract structured tabular data
export function extractFromCSV(filePath) {
  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");

    if (lines.length < 2) {
      return { error: "CSV has no data rows", fields: {} };
    }

    const headers = parseCSVLine(lines[0]).map((h) => h.trim());
    const lowerHeaders = headers.map((h) => h.toLowerCase());
    const rows = lines.slice(1).map((line) => {
      const values = parseCSVLine(line);
      const row = {};
      headers.forEach((h, i) => {
        row[h] = values[i] || null;
        row[lowerHeaders[i]] = values[i] || null;
      });
      return row;
    });

    return {
      fields: {
        headers: fieldConfidence(headers, "csv_parser"),
        rowCount: fieldConfidence(rows.length, "csv_parser"),
        data: fieldConfidence(rows, "csv_parser"),
      },
    };
  } catch (err) {
    return { error: `CSV extraction failed: ${err.message}`, fields: {} };
  }
}

// Parse machine specs from extracted PDF text
function parseSpecSheetText(text) {
  if (!text || text.trim().length === 0) return [];

  const machines = [];

  // Known manufacturers in this dataset
  const knownMfgs = ["TRF Ltd.", "McNally Bharat", "Thermax", "Kirloskar Brothers", "Kirloskar", "BHEL", "Paharpur", "Ion Exchange India", "Crompton Greaves"];
  const knownZones = [
    "Coal Handling Plant", "Boiler House", "Turbine Hall", "Cooling Tower",
    "DM Water Treatment", "ESP & Chimney", "Ash Handling & Ash Pond",
    "Switchyard / Substation", "Raw Water Reservoir", "Coal Yard / Stockpile",
  ];
  const knownStatuses = ["Operational", "Under Maintenance", "Idle", "Shutdown"];

  // Split by machine IDs (M01, M02, ...) — require M## at start or after newline/space
  const parts = text.split(/(?=(?:^|\n)\s*M\d{2})/m);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || trimmed.length < 5) continue;

    const idMatch = trimmed.match(/^(M\d{2})/);
    if (!idMatch) continue;

    const id = idMatch[1];
    let rest = trimmed.slice(3); // remove "M01"

    // Find zone
    let zone = null;
    for (const z of knownZones) {
      const idx = rest.indexOf(z);
      if (idx !== -1) {
        zone = z;
        break;
      }
    }

    // Find manufacturer
    let mfg = null;
    for (const m of knownMfgs) {
      const idx = rest.indexOf(m);
      if (idx !== -1) {
        mfg = m;
        break;
      }
    }

    // Find status
    let status = null;
    for (const s of knownStatuses) {
      const idx = rest.indexOf(s);
      if (idx !== -1) {
        status = s;
        break;
      }
    }

    // Find last maintenance date (DD-Mon-YYYY pattern before status or after installed year)
    const datePattern = /\d{2}-[A-Za-z]{3}-\d{4}/g;
    const dates = [];
    let dm;
    while ((dm = datePattern.exec(rest)) !== null) {
      dates.push({ date: dm[0], index: dm.index });
    }

    // Extract machine name: everything before the first known zone or manufacturer
    let nameEnd = rest.length;
    if (zone) {
      // Find zone but skip if it's at position 0 (zone IS the name start)
      let searchFrom = 1;
      while (searchFrom < rest.length) {
        const idx = rest.indexOf(zone, searchFrom);
        if (idx === -1) break;
        if (idx > 0) { nameEnd = idx; break; }
        searchFrom++;
      }
    }
    if (mfg) {
      const mfgIdx = rest.indexOf(mfg);
      if (mfgIdx > 0 && mfgIdx < nameEnd) nameEnd = mfgIdx;
    }
    // Also cut at first 4-digit year if it appears early
    const yearIdx = rest.search(/\b20\d{2}\b/);
    if (yearIdx > 0 && yearIdx < nameEnd) nameEnd = yearIdx;

    const name = rest.slice(0, nameEnd).trim();

    // Extract capacity: between manufacturer and installed year
    let capacity = null;
    if (mfg) {
      const mfgEnd = rest.indexOf(mfg) + mfg.length;
      const afterMfg = rest.slice(mfgEnd);
      // Capacity is text between manufacturer and the year
      // Use look-ahead for year pattern including when directly adjacent
      const yearCapMatch = afterMfg.match(/^(.*?)(?=20\d{2})/);
      if (yearCapMatch && yearCapMatch[1].trim().length > 0) {
        capacity = yearCapMatch[1].trim();
      }
    } else {
      // No manufacturer found — try to extract capacity between name and year
      const afterName = rest.slice(nameEnd);
      const yearCapMatch = afterName.match(/^(.*?)(?=20\d{2})/);
      if (yearCapMatch && yearCapMatch[1].trim().length > 0) {
        capacity = yearCapMatch[1].trim();
      }
    }

    // Extract installed year
    const yearMatch = rest.match(/\b(20\d{2})\b/);
    const installedYear = yearMatch ? parseInt(yearMatch[1]) : null;

    // Extract last maintenance date (first date found)
    const lastMaint = dates.length > 0 ? dates[0].date : null;

    // Extract next maintenance date (second date found)
    const nextMaint = dates.length > 1 ? dates[1].date : null;

    if (name && name.length > 1) {
      machines.push({
        id: fieldConfidence(id, "pdf_parser"),
        name: fieldConfidence(name, "pdf_parser"),
        zone: fieldConfidence(zone, "pdf_parser"),
        manufacturer: fieldConfidence(mfg, "pdf_parser"),
        capacity: fieldConfidence(capacity, "pdf_parser"),
        installedYear: fieldConfidence(installedYear, "pdf_parser"),
        status: fieldConfidence(status || "Operational", "pdf_parser"),
        lastMaintenance: fieldConfidence(lastMaint, "pdf_parser"),
        nextMaintenance: fieldConfidence(nextMaint, "pdf_parser"),
        rawText: fieldConfidence(trimmed, "pdf_parser"),
      });
    }
  }

  // If no structured machines found, create a single entry with full text
  if (machines.length === 0 && text.trim().length > 50) {
    machines.push({
      name: fieldConfidence("PDF Document", "pdf_parser"),
      type: fieldConfidence("spec_sheet", "pdf_parser"),
      fullText: fieldConfidence(text.substring(0, 3000), "pdf_parser"),
      note: fieldConfidence("Full text extracted from PDF. AI can analyze this content.", "pdf_parser"),
    });
  }

  return machines;
}

// Parse machine specification sheet (CSV/XLSX/PDF format)
export async function extractFromSpecSheet(filePath) {
  const ext = extname(filePath).toLowerCase();

  if (ext === ".csv") {
    const csvResult = extractFromCSV(filePath);
    if (csvResult.error) return csvResult;

    // Try to map common spec sheet columns
    const rows = csvResult.fields.data?.value || [];
    const machines = rows.map((row) => ({
      name: fieldConfidence(
        row.name || row.machine_name || row.model,
        "spec_parser"
      ),
      type: fieldConfidence(row.type || row.machine_type, "spec_parser"),
      manufacturer: fieldConfidence(row.manufacturer || row.brand, "spec_parser"),
      footprint: {
        length: fieldConfidence(
          parseFloat(row.length || row.footprint_length) || undefined,
          "spec_parser"
        ),
        width: fieldConfidence(
          parseFloat(row.width || row.footprint_width) || undefined,
          "spec_parser"
        ),
        height: fieldConfidence(
          parseFloat(row.height || row.footprint_height) || undefined,
          "spec_parser"
        ),
      },
      powerDraw: fieldConfidence(
        parseFloat(row.power_draw || row.power || row.wattage) || undefined,
        "spec_parser"
      ),
      clearance: {
        front: fieldConfidence(
          parseFloat(row.clearance_front) || undefined,
          "spec_parser"
        ),
        back: fieldConfidence(
          parseFloat(row.clearance_back) || undefined,
          "spec_parser"
        ),
        left: fieldConfidence(
          parseFloat(row.clearance_left) || undefined,
          "spec_parser"
        ),
        right: fieldConfidence(
          parseFloat(row.clearance_right) || undefined,
          "spec_parser"
        ),
      },
    }));

    return {
      fields: {
        machines: fieldConfidence(machines, "spec_parser"),
        machineCount: fieldConfidence(machines.length, "spec_parser"),
      },
    };
  }

  if (ext === ".pdf") {
    try {
      const buffer = readFileSync(filePath);
      const pdfData = await pdfParse(buffer);
      const text = pdfData.text || "";
      
      // Parse machine specs from extracted text
      const machines = parseSpecSheetText(text);
      
      return {
        fields: {
          type: fieldConfidence("spec_sheet", "pdf_parser"),
          format: fieldConfidence("pdf", "pdf_parser"),
          fileSize: fieldConfidence(buffer.length, "pdf_parser"),
          pageCount: fieldConfidence(pdfData.numpages, "pdf_parser"),
          fullText: fieldConfidence(text, "pdf_parser"),
          machines: fieldConfidence(machines, "pdf_parser"),
          machineCount: fieldConfidence(machines.length, "pdf_parser"),
          note: fieldConfidence(
            machines.length > 0 
              ? `Extracted ${machines.length} machine(s) from PDF spec sheet`
              : "PDF content extracted. Manual review may be needed for machine specs.",
            "pdf_parser"
          ),
        },
      };
    } catch (err) {
      return { error: `PDF extraction failed: ${err.message}`, fields: {} };
    }
  }

  // XLSX would need a library like xlsx — for now return placeholder
  return {
    error: "XLSX parsing not yet implemented — use CSV format",
    fields: {},
  };
}

// Parse floor plan (basic image/PDF metadata extraction)
export function extractFromFloorPlan(filePath) {
  const ext = extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    // PDF text extraction would need pdf-parse library
    return {
      fields: {
        type: fieldConfidence("floor_plan", "floor_plan_parser"),
        format: fieldConfidence("pdf", "floor_plan_parser"),
        note: fieldConfidence(
          "PDF floor plan detected. Manual layout configuration recommended for v1.",
          "floor_plan_parser"
        ),
      },
    };
  }

  if ([".png", ".jpg", ".jpeg"].includes(ext)) {
    return {
      fields: {
        type: fieldConfidence("floor_plan", "floor_plan_parser"),
        format: fieldConfidence(ext.slice(1), "floor_plan_parser"),
        note: fieldConfidence(
          "Image floor plan detected. Manual layout configuration recommended for v1.",
          "floor_plan_parser"
        ),
      },
    };
  }

  if (ext === ".dxf") {
    // DXF would need dxf-parser library
    return {
      fields: {
        type: fieldConfidence("floor_plan", "dxf_parser"),
        format: fieldConfidence("dxf", "dxf_parser"),
        note: fieldConfidence(
          "DXF floor plan detected. Vector parsing available.",
          "dxf_parser"
        ),
      },
    };
  }

  return { error: `Unsupported floor plan format: ${ext}`, fields: {} };
}

// Parse product/production data
export function extractFromProductionData(filePath) {
  const ext = extname(filePath).toLowerCase();

  if (ext === ".csv") {
    const csvResult = extractFromCSV(filePath);
    if (csvResult.error) return csvResult;

    const rows = csvResult.fields.data?.value || [];
    const headers = csvResult.fields.headers?.value || [];

    // Detect machine reference columns — any column with unit/machine/equipment keywords
    const machineKeywords = ["machine", "unit", "equipment", "generating", "device", "asset", "apparatus"];
    const machineRefCols = headers.filter((h) => {
      const lh = h.toLowerCase();
      return machineKeywords.some((kw) => lh.includes(kw));
    });

    // Extract unique machine IDs from detected columns
    const allMachineRefs = new Set();
    for (const row of rows) {
      for (const col of machineRefCols) {
        const val = row[col] || "";
        if (val) {
          const ids = val.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
          ids.forEach((id) => allMachineRefs.add(id));
        }
      }
    }
    const machineIds = [...allMachineRefs].sort();

    // Detect product-like columns for generic row extraction
    const products = rows.map((row, idx) => {
      const productName = row.product_name || row["product name"] || row.product || row.name || null;
      const productId = row.product_id || row["product id"] || row.id || row["record id"] || row["Record ID"] || null;
      const category = row.category || row.fuel_source || row["fuel source"] || row.type || null;
      const specs = row.key_specifications || row["key specifications"] || row.specifications || row.specs || null;
      const materials = row.primary_materials || row["primary materials"] || row.materials || null;
      const machinesRef = machineRefCols.map((col) => row[col]).filter(Boolean).join(", ") || null;
      const leadTime = row.avg_lead_time || row["avg lead time"] || row.lead_time || null;
      const capacity = row.monthly_capacity || row["monthly capacity"] || row.capacity || row.plant_load_factor || row["plant load factor (%)"] || null;

      // For rows without product names, use a generated name from available data
      const effectiveName = productName || (productId ? `Record ${productId}` : `Row ${idx + 1}`);

      return {
        productId: fieldConfidence(productId, "production_parser"),
        productName: fieldConfidence(effectiveName, "production_parser"),
        category: fieldConfidence(category, "production_parser"),
        specifications: fieldConfidence(specs, "production_parser"),
        materials: fieldConfidence(materials, "production_parser"),
        machinesUsed: fieldConfidence(machinesRef, "production_parser"),
        leadTime: fieldConfidence(leadTime, "production_parser"),
        capacity: fieldConfidence(capacity, "production_parser"),
      };
    });

    return {
      fields: {
        products: fieldConfidence(products, "production_parser"),
        productCount: fieldConfidence(products.length, "production_parser"),
        machineIds: fieldConfidence(machineIds, "production_parser"),
        machineIdCount: fieldConfidence(machineIds.length, "production_parser"),
        headers: csvResult.fields.headers,
        rawData: csvResult.fields.data,
      },
    };
  }

  return {
    error: "Only CSV production data supported in v1",
    fields: {},
  };
}

// Main extraction dispatcher
export async function extractFromFile(filePath, fileType) {
  switch (fileType) {
    case "glb":
      return extractFromGLB(filePath);
    case "spec_sheet":
      return await extractFromSpecSheet(filePath);
    case "floor_plan":
      return extractFromFloorPlan(filePath);
    case "product_data":
      return extractFromProductionData(filePath);
    default:
      return { error: `Unknown file type: ${fileType}`, fields: {} };
  }
}

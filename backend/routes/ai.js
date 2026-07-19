import { Router } from "express";
import { query, queryOne } from "../db.js";
import { calculateHealthScore, calculateOEE } from "../services/simulation.js";

const router = Router({ mergeParams: true });

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

// POST /api/v1/factory/:factoryId/ai/ask — ask AI a question
router.post("/ask", async (req, res) => {
  try {
    const factoryId = req.params.factoryId;
    const tenantId = req.tenantId;
    const { question } = req.body;

    console.log("[AI] factoryId:", factoryId, "tenantId:", tenantId, "question:", question);

    if (!question) {
      return res.status(400).json({ message: "Question is required" });
    }

    // Gather ALL data for deep AI analysis
    const machines = await query(
      "SELECT * FROM machines WHERE factory_id = $1 AND tenant_id = $2",
      [factoryId, tenantId]
    );

    const recentReadings = await query(
      `SELECT machine_id, metric_type, value, source, timestamp
       FROM sensor_readings
       WHERE tenant_id = $1 AND timestamp > NOW() - INTERVAL '24 hours'
       ORDER BY timestamp DESC`,
      [tenantId]
    );

    const activeAlerts = await query(
      `SELECT a.*, m.name as machine_name
       FROM alerts a JOIN machines m ON a.machine_id = m.id
       WHERE a.tenant_id = $1 AND a.resolved_at IS NULL`,
      [tenantId]
    );

    // Fetch ALL uploaded files with full extraction data
    const uploadedFiles = await query(
      `SELECT original_name, file_type, extraction_result, machine_id, created_at
       FROM uploaded_files
       WHERE factory_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC`,
      [factoryId, tenantId]
    );

    // Get factory info
    const factory = await queryOne(
      "SELECT * FROM factories WHERE id = $1",
      [factoryId]
    );

    // Build rich context with full machine details and analysis
    const enrichedMachines = machines.map((m) => {
      const machineReadings = recentReadings.filter((r) => r.machine_id === m.id);
      const efficiency = machineReadings.find((r) => r.metric_type === "efficiency");
      const temperature = machineReadings.find((r) => r.metric_type === "temperature");
      const power = machineReadings.find((r) => r.metric_type === "power");
      const utilization = machineReadings.find((r) => r.metric_type === "utilization");
      const machineFiles = uploadedFiles.filter((f) => f.machine_id === m.id);

      // Calculate derived metrics
      const powerRating = parseFloat(m.power_draw_rating) || 0;
      const currentPower = power ? parseFloat(power.value) : 0;
      const loadPercentage = powerRating > 0 ? Math.round((currentPower / powerRating) * 100) : null;

      // Age calculation
      let ageYears = null;
      if (m.install_date) {
        const installed = new Date(m.install_date);
        const now = new Date();
        ageYears = Math.round((now - installed) / (365.25 * 24 * 3600 * 1000) * 10) / 10;
      }

      // Health and OEE from simulation
      const machineReadingsForSim = machineReadings.map(r => ({
        metric_type: r.metric_type,
        value: parseFloat(r.value),
      }));
      const healthScore = calculateHealthScore(m, machineReadingsForSim);
      const oee = calculateOEE(m, machineReadingsForSim);

      // Risk assessment
      const risks = [];
      if (loadPercentage !== null && loadPercentage > 90) {
        risks.push(`OVERLOAD RISK: Operating at ${loadPercentage}% of rated capacity (${currentPower}kW / ${powerRating}kW)`);
      }
      if (temperature && parseFloat(temperature.value) > 70) {
        risks.push(`THERMAL RISK: Temperature at ${temperature.value}°C — approaching critical threshold`);
      }
      if (ageYears && ageYears > 8) {
        risks.push(`AGE DEGRADATION: Machine is ${ageYears} years old — expect efficiency degradation and increased maintenance needs`);
      }
      if (healthScore < 50) {
        risks.push(`HEALTH CRITICAL: Health score at ${healthScore}/100 — immediate attention required`);
      }

      return {
        name: m.name,
        id: m.id,
        type: m.type,
        manufacturer: m.manufacturer,
        status: m.status || "unknown",
        installDate: m.install_date,
        ageYears,
        footprint: {
          length: parseFloat(m.footprint_length) || 1,
          width: parseFloat(m.footprint_width) || 1,
          height: parseFloat(m.footprint_height) || 1,
        },
        powerRating: powerRating > 0 ? `${powerRating} kW` : "not specified",
        loadPercentage,
        currentReadings: {
          temperature: temperature ? `${temperature.value}°C` : "no data",
          efficiency: efficiency ? `${efficiency.value}%` : "no data",
          power: power ? `${power.value} kW` : "no data",
          utilization: utilization ? `${utilization.value}%` : "no data",
        },
        healthScore,
        oee,
        risks,
        uploadedFiles: machineFiles.map((f) => {
          const extraction = f.extraction_result;
          // Extract full text and machine data from extraction
          const fullText = extraction?.fields?.fullText?.value || extraction?.fullText || null;
          const extractedMachines = extraction?.fields?.machines?.value || [];
          const extractedData = extraction?.fields?.data?.value || extraction?.fields?.rawData?.value || null;

          return {
            name: f.original_name,
            type: f.file_type,
            fullTextContent: fullText,
            extractedMachines: extractedMachines.map(em => ({
              id: em.id?.value,
              name: em.name?.value,
              zone: em.zone?.value,
              manufacturer: em.manufacturer?.value,
              capacity: em.capacity?.value,
              status: em.status?.value,
              installedYear: em.installedYear?.value,
              lastMaintenance: em.lastMaintenance?.value,
              nextMaintenance: em.nextMaintenance?.value,
            })),
            extractedTableData: extractedData,
          };
        }),
      };
    });

    // Unlinked files (not associated with any machine)
    const unlinkedFiles = uploadedFiles
      .filter((f) => !f.machine_id)
      .map((f) => {
        const extraction = f.extraction_result;
        const fullText = extraction?.fields?.fullText?.value || extraction?.fullText || null;
        const extractedMachines = extraction?.fields?.machines?.value || [];
        const extractedData = extraction?.fields?.data?.value || extraction?.fields?.rawData?.value || null;

        return {
          name: f.original_name,
          type: f.file_type,
          fullTextContent: fullText,
          extractedMachines: extractedMachines.map(em => ({
            id: em.id?.value,
            name: em.name?.value,
            zone: em.zone?.value,
            manufacturer: em.manufacturer?.value,
            capacity: em.capacity?.value,
            status: em.status?.value,
          })),
          extractedTableData: extractedData,
        };
      });

    // Factory-wide analysis
    const runningMachines = machines.filter((m) => m.status === "Running");
    const idleMachines = machines.filter((m) => m.status === "Idle");
    const maintenanceMachines = machines.filter((m) => m.status === "Under Maintenance");

    const totalPower = enrichedMachines.reduce((sum, m) => {
      const p = m.currentReadings.power;
      return sum + (p !== "no data" ? parseFloat(p) : 0);
    }, 0);

    const avgEfficiency = enrichedMachines.reduce((sum, m) => {
      const e = m.currentReadings.efficiency;
      return sum + (e !== "no data" ? parseFloat(e) : 0);
    }, 0) / (enrichedMachines.length || 1);

    const avgTemperature = enrichedMachines.reduce((sum, m) => {
      const t = m.currentReadings.temperature;
      return sum + (t !== "no data" ? parseFloat(t) : 0);
    }, 0) / (enrichedMachines.length || 1);

    const criticalAlerts = activeAlerts.filter((a) => a.severity === "critical");
    const warningAlerts = activeAlerts.filter((a) => a.severity === "warning");

    // Build comprehensive context
    const context = {
      factory: {
        name: factory?.name || "Unknown Factory",
        width: factory?.width_meters,
        depth: factory?.depth_meters,
        floorPlan: factory?.floor_plan_ref ? "uploaded" : "none",
      },
      machines: enrichedMachines,
      unlinkedFiles,
      alerts: activeAlerts.map((a) => ({
        machine: a.machine_name,
        severity: a.severity,
        type: a.type,
        message: a.message,
        calculatedValue: a.calculated_value,
        threshold: a.threshold,
        triggeredAt: a.triggered_at,
      })),
      factoryAnalysis: {
        totalMachines: machines.length,
        runningMachines: runningMachines.length,
        idleMachines: idleMachines.length,
        maintenanceMachines: maintenanceMachines.length,
        totalPowerDraw: `${Math.round(totalPower * 100) / 100} kW`,
        averageEfficiency: `${Math.round(avgEfficiency * 10) / 10}%`,
        averageTemperature: `${Math.round(avgTemperature * 10) / 10}°C`,
        criticalAlerts: criticalAlerts.length,
        warningAlerts: warningAlerts.length,
        machinesWithRisks: enrichedMachines.filter((m) => m.risks.length > 0).map((m) => ({
          name: m.name,
          risks: m.risks,
        })),
      },
      uploadedDocumentsSummary: {
        totalFiles: uploadedFiles.length,
        specSheets: uploadedFiles.filter((f) => f.file_type === "spec_sheet").length,
        productData: uploadedFiles.filter((f) => f.file_type === "product_data").length,
        floorPlans: uploadedFiles.filter((f) => f.file_type === "floor_plan").length,
        glbModels: uploadedFiles.filter((f) => f.file_type === "glb").length,
      },
    };

    // Try FastAI service first, fall back to mock if unavailable
    let responseText;
    let provider;

    try {
      const aiResponse = await fetch(`${AI_SERVICE_URL}/interpret`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structured_data: context, question }),
      });

      if (!aiResponse.ok) throw new Error(`AI service returned ${aiResponse.status}`);
      const aiResult = await aiResponse.json();
      responseText = aiResult.text;
      provider = aiResult.provider;
    } catch (aiErr) {
      console.warn("AI service unavailable, using mock response:", aiErr.message);
      responseText = generateMockResponse(question, context);
      provider = "mock";
    }

    // Log interaction
    await queryOne(
      `INSERT INTO ai_interactions (user_id, factory_id, tenant_id, question, structured_data_sent, response_text, provider_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        req.user?.uid, factoryId, tenantId,
        question, JSON.stringify(context),
        responseText, provider,
      ]
    );

    res.json({
      text: responseText,
      data: context,
      provider,
    });
  } catch (err) {
    console.error("[AI] Error:", err);
    res.status(500).json({ message: "AI request failed", error: err.message });
  }
});

// GET /api/v1/factory/:factoryId/ai/interactions — get AI interaction history
router.get("/interactions", async (req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM ai_interactions
       WHERE factory_id = $1 AND tenant_id = $2
       ORDER BY timestamp DESC LIMIT 50`,
      [req.params.factoryId, req.tenantId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch interactions", error: err.message });
  }
});

function generateMockResponse(question, context) {
  const q = question.toLowerCase();
  const analysis = context.factoryAnalysis;

  if (q.includes("risk") || q.includes("fail") || q.includes("danger")) {
    const risky = analysis.machinesWithRisks;
    if (risky.length > 0) {
      return `CRITICAL RISKS IDENTIFIED:\n\n${risky.map(m => `${m.name}:\n${m.risks.map(r => `  - ${r}`).join('\n')}`).join('\n\n')}\n\nImmediate action recommended for machines with critical risks.`;
    }
    return "No critical risks identified at this time. All machines are operating within safe parameters.";
  }

  if (q.includes("load") || q.includes("overload") || q.includes("power")) {
    const overloaded = context.machines.filter(m => m.loadPercentage && m.loadPercentage > 80);
    if (overloaded.length > 0) {
      return `MACHINES UNDER HIGH LOAD:\n${overloaded.map(m => `- ${m.name}: ${m.loadPercentage}% load (${m.currentReadings.power} / ${m.powerRating})`).join('\n')}\n\nTotal factory power draw: ${analysis.totalPowerDraw}`;
    }
    return `All machines are operating within normal load parameters. Total power draw: ${analysis.totalPowerDraw}`;
  }

  if (q.includes("maintenance") || q.includes("service")) {
    const needsMaint = context.machines.filter(m => m.healthScore < 60 || m.risks.length > 0);
    if (needsMaint.length > 0) {
      return `MAINTENANCE PRIORITY:\n${needsMaint.map(m => `- ${m.name}: Health ${m.healthScore}/100, Age ${m.ageYears || '?'} years${m.risks.length > 0 ? ', RISKS: ' + m.risks.join('; ') : ''}`).join('\n')}`;
    }
    return "All machines are in good health. No immediate maintenance required.";
  }

  if (q.includes("summary") || q.includes("overview") || q.includes("status")) {
    return `FACTORY STATUS:
- Total machines: ${analysis.totalMachines}
- Running: ${analysis.runningMachines}, Idle: ${analysis.idleMachines}, Maintenance: ${analysis.maintenanceMachines}
- Average efficiency: ${analysis.averageEfficiency}
- Average temperature: ${analysis.averageTemperature}
- Total power draw: ${analysis.totalPowerDraw}
- Active alerts: ${analysis.criticalAlerts} critical, ${analysis.warningAlerts} warning
${analysis.machinesWithRisks.length > 0 ? `\nMachines with risks: ${analysis.machinesWithRisks.map(m => m.name).join(', ')}` : ''}`;
  }

  return `I can analyze your factory data. Currently monitoring ${analysis.totalMachines} machines (${analysis.runningMachines} running). Ask me about risks, load analysis, maintenance needs, or specific machine performance.`;
}

export default router;

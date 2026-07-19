import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, ".env") });

const { query: dbQuery, queryOne: dbQueryOne } = await import("./db.js");

const {
  generateMachineReadings,
  calculateHealthScore,
  checkAlertThresholds,
} = await import("./services/simulation.js");

let simulationRunning = false;

async function startContinuousSimulation() {
  const SIM_INTERVAL = 10000;

  setInterval(async () => {
    if (simulationRunning) return;
    simulationRunning = true;

    try {
      const factories = await dbQuery(
        "SELECT id, tenant_id FROM factories"
      );

      for (const factory of factories) {
        const machines = await dbQuery(
          "SELECT * FROM machines WHERE factory_id = $1 AND tenant_id = $2",
          [factory.id, factory.tenant_id]
        );

        for (const machine of machines) {
          const readings = generateMachineReadings(machine);

          for (const reading of readings) {
            await dbQuery(
              `INSERT INTO sensor_readings (machine_id, tenant_id, metric_type, value, source, timestamp)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                machine.id,
                factory.tenant_id,
                reading.metric_type,
                reading.value,
                reading.source || "simulated",
                reading.timestamp,
              ]
            );

            if (reading.newStatus && reading.newStatus !== machine.status) {
              await dbQuery(
                "UPDATE machines SET status = $1 WHERE id = $2",
                [reading.newStatus, machine.id]
              );
              machine.status = reading.newStatus;
            }
          }

          const recentReadings = await dbQuery(
            `SELECT * FROM sensor_readings
             WHERE machine_id = $1 AND tenant_id = $2
             ORDER BY timestamp DESC LIMIT 100`,
            [machine.id, factory.tenant_id]
          );

          const healthScore = calculateHealthScore(machine, recentReadings);
          await dbQuery(
            "UPDATE machines SET health_score = $1 WHERE id = $2",
            [healthScore, machine.id]
          );

          const alerts = checkAlertThresholds(
            { ...machine, status: machine.status },
            readings
          );

          for (const alert of alerts) {
            await dbQuery(
              `INSERT INTO alerts (machine_id, tenant_id, type, severity, calculated_value, threshold, message)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                machine.id,
                factory.tenant_id,
                alert.type,
                alert.severity,
                alert.calculatedValue,
                alert.threshold,
                alert.message,
              ]
            );
          }
        }
      }
    } catch (err) {
      console.error("[Simulation] Error:", err.message);
    } finally {
      simulationRunning = false;
    }
  }, SIM_INTERVAL);

  console.log(`[Simulation] Continuous simulation started (every ${SIM_INTERVAL / 1000}s)`);
}

const express = (await import("express")).default;
const cors = (await import("cors")).default;
const { default: factoryRoutes } = await import("./routes/factory.js");
const { default: uploadRoutes } = await import("./routes/upload.js");
const { default: machineRoutes } = await import("./routes/machine.js");
const { default: machineHistoryRoutes } = await import("./routes/machineHistory.js");
const { default: layoutRoutes } = await import("./routes/layout.js");
const { default: aiRoutes } = await import("./routes/ai.js");
const { default: simulationRoutes } = await import("./routes/simulation.js");
const { default: floorsRoutes } = await import("./routes/floors.js");
const { authMiddleware } = await import("./middleware/auth.js");
const { tenantMiddleware } = await import("./middleware/tenant.js");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Serve uploaded files (GLBs, floor plans, etc.)
app.use("/uploads", express.static(join(__dirname, "uploads")));

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API routes
app.use("/api/v1/factory/:factoryId/machines", authMiddleware, tenantMiddleware, machineRoutes);
app.use("/api/v1/factory/:factoryId/machines", authMiddleware, tenantMiddleware, machineHistoryRoutes);
app.use("/api/v1/factory/:factoryId/layout", authMiddleware, tenantMiddleware, layoutRoutes);
app.use("/api/v1/factory/:factoryId/upload", authMiddleware, tenantMiddleware, uploadRoutes);
app.use("/api/v1/factory/:factoryId/ai", authMiddleware, tenantMiddleware, aiRoutes);
app.use("/api/v1/factory/:factoryId/simulate", authMiddleware, tenantMiddleware, simulationRoutes);
app.use("/api/v1/factory/:factoryId/floors", authMiddleware, tenantMiddleware, floorsRoutes);
app.use("/api/v1/factories", authMiddleware, tenantMiddleware, factoryRoutes);

// Error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
  startContinuousSimulation();
});

export default app;

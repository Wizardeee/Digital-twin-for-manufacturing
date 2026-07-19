// Simulation engine — physics-based calculations using machine's actual properties
// SRS §5.4: Built behind the same data interface as real IoT data
// SRS §6: Application calculates all values; AI only interprets

const AMBIENT_TEMP = 22; // °C — factory floor ambient
const AMBIENT_HUMIDITY = 45; // % relative humidity

// Machine type power profiles (kW base when power_draw_rating not provided)
const TYPE_POWER_PROFILES = {
  robot: { base: 3.5, idleRatio: 0.08, heatCoeff: 0.12, baseEfficiency: 0.88 },
  cnc: { base: 7.5, idleRatio: 0.05, heatCoeff: 0.15, baseEfficiency: 0.85 },
  conveyor: { base: 1.2, idleRatio: 0.10, heatCoeff: 0.06, baseEfficiency: 0.92 },
  press: { base: 5.0, idleRatio: 0.03, heatCoeff: 0.10, baseEfficiency: 0.82 },
  welder: { base: 4.5, idleRatio: 0.04, heatCoeff: 0.18, baseEfficiency: 0.80 },
  printer: { base: 2.0, idleRatio: 0.15, heatCoeff: 0.08, baseEfficiency: 0.90 },
  unknown: { base: 3.0, idleRatio: 0.08, heatCoeff: 0.10, baseEfficiency: 0.85 },
};

// Deterministic pseudo-random based on machine ID + timestamp (reproducible per cycle)
function seededValue(machineId, metric, cycleIndex) {
  let hash = 0;
  const seed = `${machineId}-${metric}-${cycleIndex}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 1000) / 1000; // 0.0 – 0.999
}

function getProfile(machine) {
  const type = (machine.type || "unknown").toLowerCase();
  const profile = TYPE_POWER_PROFILES[type] || TYPE_POWER_PROFILES.unknown;

  // If user provided power rating, derive other values from it
  const powerRating = parseFloat(machine.power_draw_rating) || 0;
  if (powerRating > 0) {
    return {
      base: powerRating,
      idleRatio: profile.idleRatio,
      heatCoeff: profile.heatCoeff,
      baseEfficiency: profile.baseEfficiency,
    };
  }
  return profile;
}

function getAgeFactor(machine) {
  if (!machine.install_date) return 0;
  const installed = new Date(machine.install_date);
  const now = new Date();
  const years = (now - installed) / (365.25 * 24 * 3600 * 1000);
  // Efficiency degrades ~0.5% per year, temperature increases ~0.3°C per year
  return Math.min(years, 20); // cap at 20 years
}

// Calculate real power consumption based on machine specs
function calculatePower(machine, cycleIndex) {
  const profile = getProfile(machine);
  const status = machine.status || "Idle";
  const isRunning = status === "Running";

  const noise = seededValue(machine.id, "power", cycleIndex) * 0.1 - 0.05; // ±5%

  if (isRunning) {
    return Math.round((profile.base * (0.85 + noise)) * 100) / 100;
  } else if (status === "Idle") {
    return Math.round((profile.base * profile.idleRatio * (0.9 + noise * 0.5)) * 100) / 100;
  }
  return 0;
}

// Calculate temperature from power dissipation and ambient conditions
function calculateTemperature(machine, power, cycleIndex) {
  const profile = getProfile(machine);
  const age = getAgeFactor(machine);

  // Base temperature = ambient + power dissipation
  const heatFromPower = power * profile.heatCoeff * 10; // power in kW → temperature contribution
  const ageDegradation = age * 0.3; // older machines run hotter

  // Footprint affects cooling (larger machines dissipate heat differently)
  const fp = machine.footprint || {};
  const volume = (parseFloat(fp.length) || 1) * (parseFloat(fp.width) || 1) * (parseFloat(fp.height) || 1);
  const coolingFactor = Math.max(0.8, 1 - (volume - 1) * 0.02); // larger = slightly better cooling

  const noise = seededValue(machine.id, "temp", cycleIndex) * 2 - 1; // ±1°C

  const temp = AMBIENT_TEMP + (heatFromPower * coolingFactor) + ageDegradation + noise;
  return Math.round(Math.max(AMBIENT_TEMP, Math.min(95, temp)) * 100) / 100;
}

// Calculate efficiency based on age, temperature, and operating conditions
function calculateEfficiency(machine, temperature, power, cycleIndex) {
  const profile = getProfile(machine);
  const age = getAgeFactor(machine);
  const status = machine.status || "Idle";

  if (status === "Idle") return Math.round((seededValue(machine.id, "eff", cycleIndex) * 5 + 2) * 100) / 100;
  if (status === "Offline") return 0;

  // Base efficiency from machine type
  let efficiency = profile.baseEfficiency * 100;

  // Age penalty: -0.5% per year
  efficiency -= age * 0.5;

  // Temperature penalty: loses ~0.3% per degree above 40°C
  if (temperature > 40) {
    efficiency -= (temperature - 40) * 0.3;
  }

  // Power load factor: efficiency drops slightly at very high loads
  const loadRatio = power / profile.base;
  if (loadRatio > 0.9) {
    efficiency -= (loadRatio - 0.9) * 20;
  }

  const noise = seededValue(machine.id, "eff_noise", cycleIndex) * 2 - 1;
  efficiency += noise;

  return Math.round(Math.max(20, Math.min(99, efficiency)) * 100) / 100;
}

// Calculate utilization based on status
function calculateUtilization(machine, cycleIndex) {
  const status = machine.status || "Idle";
  const noise = seededValue(machine.id, "util", cycleIndex) * 8 - 4;

  if (status === "Running") {
    return Math.round(Math.max(40, Math.min(98, 78 + noise)) * 100) / 100;
  } else if (status === "Idle") {
    return Math.round(Math.max(0, Math.min(10, 3 + noise * 0.3)) * 100) / 100;
  }
  return 0;
}

// Status transition based on operating conditions (not random)
function calculateNewStatus(machine, temperature, efficiency) {
  const current = machine.status || "Idle";

  // Overheating → force idle or offline
  if (temperature > 85 && current === "Running") return "Idle";
  if (temperature > 92) return "Offline";

  // Very low efficiency → may need to stop
  if (efficiency < 30 && current === "Running") return "Idle";

  // Power off
  if (current === "Offline") {
    if (temperature < AMBIENT_TEMP + 5) return "Idle";
    return "Offline";
  }

  // Normal transitions (deterministic based on cycle)
  const cycle = seededValue(machine.id, "status", Math.floor(Date.now() / 60000));
  if (current === "Idle" && cycle > 0.7) return "Running";
  if (current === "Running" && cycle > 0.92) return "Idle";

  return current;
}

// Generate a single reading for a machine using physics-based calculations
export function generateReading(machine, metricType, cycleIndex) {
  const profile = getProfile(machine);
  const power = calculatePower(machine, cycleIndex);
  const temperature = calculateTemperature(machine, power, cycleIndex);
  const efficiency = calculateEfficiency(machine, temperature, power, cycleIndex);
  const utilization = calculateUtilization(machine, cycleIndex);

  let value;
  switch (metricType) {
    case "temperature": value = temperature; break;
    case "efficiency": value = efficiency; break;
    case "power": value = power; break;
    case "utilization": value = utilization; break;
    default: return null;
  }

  const newStatus = calculateNewStatus(machine, temperature, efficiency);

  return {
    metric_type: metricType,
    value,
    source: machine.power_draw_rating ? "calculated" : "estimated",
    timestamp: new Date().toISOString(),
    newStatus,
  };
}

// Generate a full set of readings for a machine
export function generateMachineReadings(machine) {
  const metrics = ["temperature", "efficiency", "power", "utilization"];
  const cycleIndex = Math.floor(Date.now() / 10000); // changes every 10 seconds
  const readings = [];

  for (const metric of metrics) {
    const reading = generateReading(machine, metric, cycleIndex);
    if (reading) readings.push(reading);
  }

  return readings;
}

// Calculate machine health score (SRS §6 — deterministic, testable)
export function calculateHealthScore(machine, readings) {
  const profile = getProfile(machine);
  const age = getAgeFactor(machine);

  const tempReadings = readings.filter((r) => r.metric_type === "temperature");
  const effReadings = readings.filter((r) => r.metric_type === "efficiency");

  const avgTemp =
    tempReadings.length > 0
      ? tempReadings.reduce((sum, r) => sum + parseFloat(r.value), 0) / tempReadings.length
      : AMBIENT_TEMP + 5;

  const avgEff =
    effReadings.length > 0
      ? effReadings.reduce((sum, r) => sum + parseFloat(r.value), 0) / effReadings.length
      : profile.baseEfficiency * 100;

  // Health = weighted average of normalized metrics
  // Temperature: 0°C = 100, 80°C = 0 (linear)
  const tempScore = Math.max(0, Math.min(100, 100 - (avgTemp - AMBIENT_TEMP) * (100 / 60)));
  // Efficiency: direct percentage
  const effScore = Math.max(0, Math.min(100, avgEff));
  // Age penalty: -1% per year
  const ageScore = Math.max(0, 100 - age);

  const healthScore = Math.round(tempScore * 0.3 + effScore * 0.5 + ageScore * 0.2);
  return Math.max(0, Math.min(100, healthScore));
}

// Calculate OEE (Overall Equipment Effectiveness)
export function calculateOEE(machine, readings) {
  const effReadings = readings.filter((r) => r.metric_type === "efficiency");
  const utilReadings = readings.filter((r) => r.metric_type === "utilization");

  const avgEff =
    effReadings.length > 0
      ? effReadings.reduce((sum, r) => sum + parseFloat(r.value), 0) / effReadings.length
      : 85;

  const avgUtil =
    utilReadings.length > 0
      ? utilReadings.reduce((sum, r) => sum + parseFloat(r.value), 0) / utilReadings.length
      : 75;

  const availability = avgUtil / 100;
  const performance = avgEff / 100;
  const quality = 0.95;

  return Math.round(availability * performance * quality * 100);
}

// Check alert thresholds
export function checkAlertThresholds(machine, readings) {
  const alerts = [];

  for (const reading of readings) {
    let severity = null;
    let threshold = null;

    if (reading.metric_type === "temperature") {
      if (reading.value >= 85) { severity = "critical"; threshold = 85; }
      else if (reading.value >= 65) { severity = "warning"; threshold = 65; }
    } else if (reading.metric_type === "efficiency") {
      if (reading.value <= 30) { severity = "critical"; threshold = 30; }
      else if (reading.value <= 50) { severity = "warning"; threshold = 50; }
    }

    if (severity) {
      alerts.push({
        machineId: machine.id,
        type: `${reading.metric_type}_${severity}`,
        severity,
        calculatedValue: reading.value,
        threshold,
        message: `${machine.name}: ${reading.metric_type} ${severity} at ${reading.value}${reading.metric_type === "temperature" ? "°C" : reading.metric_type === "efficiency" ? "%" : ""}`,
      });
    }
  }

  return alerts;
}

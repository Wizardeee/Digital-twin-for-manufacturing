import { auth } from "../config/firebase";

const API_BASE = "/api/v1";

const FACTORY_ID_MAP = {
  demo: "550e8400-e29b-41d4-a716-446655440001",
};

function resolveFactoryId(id) {
  return FACTORY_ID_MAP[id] || id;
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  let token = null;
  if (auth.currentUser) {
    try {
      token = await auth.currentUser.getIdToken();
    } catch {
      // proceed without token (dev mode)
    }
  }

  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    headers["Authorization"] = "Bearer dev-token";
  }

  const config = { ...options, headers };
  if (config.body && typeof config.body === "object") {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
    throw new Error(error.message || error.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export const machinesAPI = {
  getAll: (factoryId) => request(`/factory/${resolveFactoryId(factoryId)}/machines`),
  getById: (factoryId, machineId) => request(`/factory/${resolveFactoryId(factoryId)}/machines/${machineId}`),
  delete: (factoryId, machineId) => request(`/factory/${resolveFactoryId(factoryId)}/machines/${machineId}`, { method: "DELETE" }),
  getReadings: (factoryId, machineId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/factory/${resolveFactoryId(factoryId)}/machines/${machineId}/readings?${query}`);
  },
  getHistory: (factoryId, machineId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/factory/${resolveFactoryId(factoryId)}/machines/${machineId}/history?${query}`);
  },
  updateStatus: (factoryId, machineId, status) =>
    request(`/factory/${resolveFactoryId(factoryId)}/machines/${machineId}`, { method: "PUT", body: { status } }),
  updateFootprint: (factoryId, machineId, footprint) =>
    request(`/factory/${resolveFactoryId(factoryId)}/machines/${machineId}`, {
      method: "PUT",
      body: {
        footprintLength: footprint.length,
        footprintWidth: footprint.width,
        footprintHeight: footprint.height,
      },
    }),
  updateSpecs: (factoryId, machineId, specs) =>
    request(`/factory/${resolveFactoryId(factoryId)}/machines/${machineId}`, {
      method: "PUT",
      body: specs,
    }),
};

export const factoryAPI = {
  getAll: () => request("/factories"),
  getById: (id) => request(`/factories/${resolveFactoryId(id)}`),
  update: (id, data) => request(`/factories/${resolveFactoryId(id)}`, { method: "PUT", body: data }),
  getDashboard: (id) => request(`/factories/${resolveFactoryId(id)}/dashboard`),
  getFloorPlanData: (id) => request(`/factories/${resolveFactoryId(id)}/floor-plan-data`),
  getLayout: (id) => request(`/factory/${resolveFactoryId(id)}/layout`),
  proposeLayout: (id, data) => request(`/factory/${resolveFactoryId(id)}/layout/propose`, { method: "POST", body: data }),
  confirmLayout: (id, data) => request(`/factory/${resolveFactoryId(id)}/layout/confirm`, { method: "PUT", body: data }),
};

export const simulationAPI = {
  run: (factoryId) => request(`/factory/${resolveFactoryId(factoryId)}/simulate`, { method: "POST" }),
  getStatus: (factoryId) => request(`/factory/${resolveFactoryId(factoryId)}/simulate/status`),
};

export const uploadAPI = {
  uploadFiles: (factoryId, formData) =>
    fetch(`${API_BASE}/factory/${resolveFactoryId(factoryId)}/upload`, { method: "POST", body: formData }).then((r) => {
      if (!r.ok) throw new Error(`Upload failed: ${r.status}`);
      return r.json();
    }),
  getFiles: (factoryId) =>
    request(`/factory/${resolveFactoryId(factoryId)}/upload/files`),
  deleteFile: (factoryId, fileId) =>
    request(`/factory/${resolveFactoryId(factoryId)}/upload/files/${fileId}`, { method: "DELETE" }),
};

export const aiAPI = {
  ask: (factoryId, question) =>
    request(`/factory/${resolveFactoryId(factoryId)}/ai/ask`, { method: "POST", body: { question } }),
  getInteractions: (factoryId) => request(`/factory/${resolveFactoryId(factoryId)}/ai/interactions`),
};

export const floorsAPI = {
  getAll: (factoryId) => request(`/factory/${resolveFactoryId(factoryId)}/floors`),
  create: (factoryId, data) =>
    request(`/factory/${resolveFactoryId(factoryId)}/floors`, { method: "POST", body: data }),
  update: (factoryId, floorId, data) =>
    request(`/factory/${resolveFactoryId(factoryId)}/floors/${floorId}`, { method: "PUT", body: data }),
  delete: (factoryId, floorId) =>
    request(`/factory/${resolveFactoryId(factoryId)}/floors/${floorId}`, { method: "DELETE" }),
};

export default { machinesAPI, factoryAPI, simulationAPI, uploadAPI, aiAPI, floorsAPI };

import { useState, useCallback } from "react";
import { machinesAPI } from "../services/api";

export function useMachineData(factoryId, machineId) {
  const [machine, setMachine] = useState(null);
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMachine = useCallback(async () => {
    if (!factoryId || !machineId) return;
    try {
      setLoading(true);
      const data = await machinesAPI.getById(factoryId, machineId);
      setMachine(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [factoryId, machineId]);

  const fetchReadings = useCallback(
    async (params = {}) => {
      if (!factoryId || !machineId) return;
      try {
        const data = await machinesAPI.getReadings(factoryId, machineId, params);
        setReadings(data);
      } catch (err) {
        setError(err.message);
      }
    },
    [factoryId, machineId]
  );

  return { machine, readings, loading, error, fetchMachine, fetchReadings };
}

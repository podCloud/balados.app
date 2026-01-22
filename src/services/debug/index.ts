import type { DebugLog } from "../../types";

const debugLogs: DebugLog[] = [];
const debugListeners = new Set<(logs: DebugLog[]) => void>();

export const addDebugLog = (
  type: "log" | "error" | "warn",
  ...args: Array<unknown>
) => {
  const timestamp = new Date().toLocaleTimeString("fr-FR");
  const message = args
    .map((arg) =>
      typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
    )
    .join(" ");

  debugLogs.push({ type, message, timestamp });
  if (debugLogs.length > 100) debugLogs.shift();

  debugListeners.forEach((listener) => listener([...debugLogs]));
};

export const getDebugLogs = (): DebugLog[] => [...debugLogs];

export const clearDebugLogs = () => {
  debugLogs.length = 0;
  debugListeners.forEach((listener) => listener([]));
};

export const subscribeToDebugLogs = (
  listener: (logs: DebugLog[]) => void
): (() => void) => {
  debugListeners.add(listener);
  return () => debugListeners.delete(listener);
};

// Override console methods
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

export const initDebugConsole = () => {
  console.log = (...args: unknown[]) => {
    originalLog(...args);
    addDebugLog("log", ...args);
  };

  console.error = (...args: unknown[]) => {
    originalError(...args);
    addDebugLog("error", ...args);
  };

  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    addDebugLog("warn", ...args);
  };
};

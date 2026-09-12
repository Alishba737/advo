/** Map chat sessions to the project they belong to (frontend-only bookkeeping). */

const STORAGE_KEY = "advo-session-projects";

export type SessionProjectMap = Record<string, string>;

function loadMap(): SessionProjectMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as SessionProjectMap;
  } catch {
    return {};
  }
}

function saveMap(map: SessionProjectMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function rememberSessionProject(sessionId: string, projectId: string) {
  const map = loadMap();
  map[sessionId] = projectId;
  saveMap(map);
}

export function getSessionProject(sessionId: string): string | null {
  return loadMap()[sessionId] ?? null;
}

export function getProjectSessions(projectId: string): string[] {
  const map = loadMap();
  return Object.entries(map)
    .filter(([, pid]) => pid === projectId)
    .map(([sid]) => sid);
}

export function removeSessionProject(sessionId: string) {
  const map = loadMap();
  delete map[sessionId];
  saveMap(map);
}

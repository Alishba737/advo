"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type UserMode = "citizen" | "student" | "lawyer";

interface RoleContextValue {
  mode: UserMode;
  setMode: (mode: UserMode) => void;
}

const RoleContext = createContext<RoleContextValue>({
  mode: "citizen",
  setMode: () => {},
});

const STORAGE_KEY = "advo-mode";

export function RoleProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<UserMode>("citizen");

  useEffect(() => {
    const stored =
      typeof window !== "undefined"
        ? (window.localStorage.getItem(STORAGE_KEY) as UserMode | null)
        : null;
    if (stored === "citizen" || stored === "student" || stored === "lawyer") {
      setModeState(stored);
    }
  }, []);

  const setMode = (next: UserMode) => {
    setModeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  };

  return (
    <RoleContext.Provider value={{ mode, setMode }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}

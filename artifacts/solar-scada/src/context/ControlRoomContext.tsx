import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface ControlRoomContextValue {
  isActive: boolean;
  toggle: () => void;
  activePlantIdx: number;
  setActivePlantIdx: (idx: number) => void;
}

const ControlRoomContext = createContext<ControlRoomContextValue>({
  isActive: false,
  toggle: () => {},
  activePlantIdx: 0,
  setActivePlantIdx: () => {},
});

export function ControlRoomProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [activePlantIdx, setActivePlantIdx] = useState(0);

  const toggle = () => setIsActive((p) => !p);

  // Exit on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isActive) setIsActive(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isActive]);

  return (
    <ControlRoomContext.Provider value={{ isActive, toggle, activePlantIdx, setActivePlantIdx }}>
      {children}
    </ControlRoomContext.Provider>
  );
}

export const useControlRoom = () => useContext(ControlRoomContext);

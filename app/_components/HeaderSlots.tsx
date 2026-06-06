"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type HeaderSlotState = {
  leftContent: ReactNode;
  rightContent: ReactNode;
  setLeftContent: (node: ReactNode) => void;
  setRightContent: (node: ReactNode) => void;
};

const HeaderSlotsContext = createContext<HeaderSlotState | null>(null);

export function HeaderSlotsProvider({ children }: { children: ReactNode }) {
  const [leftContent, setLeftContent] = useState<ReactNode>(null);
  const [rightContent, setRightContent] = useState<ReactNode>(null);

  const value = useMemo(
    () => ({ leftContent, rightContent, setLeftContent, setRightContent }),
    [leftContent, rightContent],
  );

  return (
    <HeaderSlotsContext.Provider value={value}>
      {children}
    </HeaderSlotsContext.Provider>
  );
}

export function useHeaderSlots() {
  const context = useContext(HeaderSlotsContext);
  if (!context) {
    throw new Error("useHeaderSlots must be used inside HeaderSlotsProvider");
  }
  return context;
}

export function HeaderContent({
  left,
  right,
}: {
  left?: ReactNode;
  right?: ReactNode;
}) {
  const { setLeftContent, setRightContent } = useHeaderSlots();

  useEffect(() => {
    if (left !== undefined) setLeftContent(left);
    if (right !== undefined) setRightContent(right);

    return () => {
      if (left !== undefined) setLeftContent(null);
      if (right !== undefined) setRightContent(null);
    };
  }, [left, right, setLeftContent, setRightContent]);

  return null;
}

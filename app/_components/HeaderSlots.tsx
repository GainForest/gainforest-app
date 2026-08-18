"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type HeaderSlotsState = {
  leftContent: ReactNode;
  rightContent: ReactNode;
  subHeaderContent: ReactNode;
  setLeftContent: (node: ReactNode) => void;
  setRightContent: (node: ReactNode) => void;
  setSubHeaderContent: (node: ReactNode) => void;
};

const HeaderSlotsContext = createContext<HeaderSlotsState | null>(null);

export function HeaderSlotsProvider({ children }: { children: ReactNode }) {
  const [leftContent, setLeftContent] = useState<ReactNode>(null);
  const [rightContent, setRightContent] = useState<ReactNode>(null);
  const [subHeaderContent, setSubHeaderContent] = useState<ReactNode>(null);

  return (
    <HeaderSlotsContext.Provider
      value={{
        leftContent,
        rightContent,
        subHeaderContent,
        setLeftContent,
        setRightContent,
        setSubHeaderContent,
      }}
    >
      {children}
    </HeaderSlotsContext.Provider>
  );
}

export function useHeaderSlots() {
  const context = useContext(HeaderSlotsContext);
  if (!context) throw new Error("useHeaderSlots must be used within HeaderSlotsProvider");
  return context;
}

export function HeaderContent({ left, right, sub }: { left?: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  const { setLeftContent, setRightContent, setSubHeaderContent } = useHeaderSlots();
  const claimedRef = useRef({ left: false, right: false, sub: false });

  useEffect(() => {
    if (left !== undefined) {
      setLeftContent(left);
      claimedRef.current.left = true;
    }
    if (right !== undefined) {
      setRightContent(right);
      claimedRef.current.right = true;
    }
    if (sub !== undefined) {
      setSubHeaderContent(sub);
      claimedRef.current.sub = true;
    }
  }, [left, right, sub, setLeftContent, setRightContent, setSubHeaderContent]);

  useEffect(() => {
    return () => {
      if (claimedRef.current.left) setLeftContent(null);
      if (claimedRef.current.right) setRightContent(null);
      if (claimedRef.current.sub) setSubHeaderContent(null);
    };
  }, [setLeftContent, setRightContent, setSubHeaderContent]);

  return null;
}

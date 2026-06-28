"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type MiniAppState = {
  inMiniApp: boolean;
  added: boolean;
};

const MiniAppContext = createContext<MiniAppState>({
  inMiniApp: false,
  added: false,
});

export const useMiniApp = () => useContext(MiniAppContext);

export default function MiniAppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MiniAppState>({
    inMiniApp: false,
    added: false,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");

        const inMiniApp = await sdk.isInMiniApp();
        if (!inMiniApp) return;

        const context = await sdk.context;
        const insets = context.client?.safeAreaInsets;
        if (insets) {
          const root = document.documentElement;
          root.style.setProperty("--fc-safe-top", `${insets.top}px`);
          root.style.setProperty("--fc-safe-bottom", `${insets.bottom}px`);
          root.style.setProperty("--fc-safe-left", `${insets.left}px`);
          root.style.setProperty("--fc-safe-right", `${insets.right}px`);
        }

        if (!cancelled) {
          setState({ inMiniApp: true, added: !!context.client?.added });
        }

        await sdk.actions.ready();
      } catch {
        // Not running inside a Farcaster client; render as a normal website.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MiniAppContext.Provider value={state}>{children}</MiniAppContext.Provider>
  );
}

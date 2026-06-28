"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useMiniApp } from "./miniapp-provider";

export default function SaveAppButton() {
  const { inMiniApp, added } = useMiniApp();
  const [done, setDone] = useState(false);

  if (!inMiniApp || added || done) return null;

  const handleAdd = async () => {
    try {
      const { sdk } = await import("@farcaster/miniapp-sdk");
      await sdk.actions.addMiniApp();
      setDone(true);
    } catch {
      // User rejected, or the client does not support adding mini apps.
    }
  };

  return (
    <li>
      <button
        type="button"
        onClick={handleAdd}
        className="group flex flex-row items-center gap-2"
      >
        <span className="duration-250 hidden opacity-0 transition-all ease-linear group-hover:opacity-100 sm:block">
          save app
        </span>
        <Plus className="h-8 w-8 group-hover:stroke-prim" />
      </button>
    </li>
  );
}

"use client";
import { useState } from "react";
import { useToast } from "./motion";

export default function CopyButton({ text, label = "Copy" }) {
  const [state, setState] = useState("idle");
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("done");
      toast("Copied to clipboard");
    } catch {
      setState("failed");
      toast("Copy failed — select and copy manually", "error");
    }
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <button type="button" className="btn ghost sm" onClick={copy}>
      {state === "done" ? (
        <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Copied</>
      ) : state === "failed" ? "Copy failed" : (
        <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg> {label}</>
      )}
    </button>
  );
}

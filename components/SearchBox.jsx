"use client";
import { useEffect, useState } from "react";

const LONG = "Search courses, students, work\u2026";
const SHORT = "Search\u2026";

export default function SearchBox() {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <input
      type="search"
      name="q"
      placeholder={narrow ? SHORT : LONG}
      aria-label="Search"
      autoComplete="off"
    />
  );
}

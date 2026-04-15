"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  totalFloors: number;
  createdAt: string;
  lastPostAt: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export function TopicTimeline({ totalFloors, createdAt, lastPostAt }: Props) {
  const [currentFloor, setCurrentFloor] = useState(1);
  const [progress, setProgress] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function updatePosition() {
      const floors = Array.from(
        document.querySelectorAll<HTMLElement>("[id^='floor-']"),
      );
      if (floors.length === 0) return;

      const viewportTop = window.scrollY + 120;
      let current = 1;
      for (const el of floors) {
        if (el.offsetTop <= viewportTop) {
          current = Number(el.id.replace("floor-", ""));
        } else {
          break;
        }
      }
      setCurrentFloor(current);

      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const p = scrollHeight > 0 ? Math.min(1, window.scrollY / scrollHeight) : 0;
      setProgress(p);
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, []);

  function jumpToFloor(n: number) {
    const el = document.getElementById(`floor-${n}`);
    if (el) {
      window.scrollTo({ top: el.offsetTop - 80, behavior: "smooth" });
    }
  }

  return (
    <div className="sticky top-24">
      <div className="flex items-start gap-3">
        <div
          ref={trackRef}
          className="relative h-80 w-px shrink-0 bg-border"
        >
          <div
            className="absolute left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-background bg-primary shadow-sm transition-all duration-150"
            style={{ top: `calc(${progress * 100}% - 6px)` }}
          />
        </div>

        <div className="flex h-80 flex-col justify-between py-1">
          <div>
            <button
              onClick={() => jumpToFloor(1)}
              className="block text-left text-xs text-muted-foreground hover:text-foreground"
            >
              <div className="font-medium">{formatDate(createdAt)}</div>
              <div className="text-[10px]">创建</div>
            </button>
          </div>

          <div className="text-xs">
            <div className="font-mono text-foreground">
              {currentFloor} <span className="text-muted-foreground">/ {totalFloors}</span>
            </div>
          </div>

          <div>
            <button
              onClick={() => jumpToFloor(totalFloors)}
              className="block text-left text-xs text-muted-foreground hover:text-foreground"
            >
              <div className="font-medium">{formatDate(lastPostAt)}</div>
              <div className="text-[10px]">最新</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import type { Park } from "../../types/park";
import { mergeParks } from "./mergeParks";

function postProgress(current: number, total: number) {
  const percent = Math.round((current / total) * 100);
  const barLength = 30;
  const filledLength = Math.round(barLength * (current / total));
  const bar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);
  (self as any).postMessage({
    type: "progress",
    progress: percent,
    text: `[${bar}] ${percent}% (${current}/${total})`,
  });
}

self.onmessage = async (event) => {
  const merged = mergeParks(event.data as Park[], postProgress);
  (self as any).postMessage({ type: "result", data: merged });
};
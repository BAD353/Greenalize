export const TOTAL_STEPS = 3;

export type LoadProgress = {
  active: boolean;
  completedSteps: number;
  description: string;
  // Progress (0–100) of the current sub-task (park processing), null when not shown
  subProgress: number | null;
  // Bytes of the current download received so far, null when nothing is downloading
  downloadedBytes: number | null;
  totalBytes: number | null;
};

const IDLE: LoadProgress = {
  active: false,
  completedSteps: 0,
  description: "",
  subProgress: null,
  downloadedBytes: null,
  totalBytes: null,
};
const HIDE_DELAY_MS = 2000;

let state: LoadProgress = IDLE;
let activeLoads = 0;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function setState(next: Partial<LoadProgress>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function subscribeLoadProgress(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLoadProgress() {
  return state;
}

export function startLoadProgress() {
  if (hideTimeout) clearTimeout(hideTimeout);
  hideTimeout = null;
  activeLoads++;
  setState({
    active: true,
    completedSteps: 0,
    description: "Fetching parks... this might take a minute",
    subProgress: null,
    downloadedBytes: null,
    totalBytes: null,
  });
}

export function setLoadStep(completedSteps: number, description: string, subProgress: number | null = null) {
  setState({ completedSteps, description, subProgress, downloadedBytes: null, totalBytes: null });
}

export function setLoadDownload(downloadedBytes: number | null, totalBytes: number | null = null) {
  setState({ downloadedBytes, totalBytes });
}

const formatMegabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function describeDownload({ downloadedBytes, totalBytes }: LoadProgress): string | null {
  if (downloadedBytes === null) return null;
  return totalBytes
    ? `${formatMegabytes(downloadedBytes)} of ${formatMegabytes(totalBytes)} received`
    : `${formatMegabytes(downloadedBytes)} received`;
}

export function setLoadSubProgress(subProgress: number) {
  setState({ subProgress });
}

export function setLoadDescription(description: string) {
  setState({ description });
}

export function finishLoadProgress(description: string) {
  activeLoads = Math.max(0, activeLoads - 1);
  if (activeLoads > 0) return;
  setState({ completedSteps: TOTAL_STEPS, description, subProgress: null });
  hideTimeout = setTimeout(() => setState(IDLE), HIDE_DELAY_MS);
}

export function failLoadProgress() {
  activeLoads = Math.max(0, activeLoads - 1);
  if (activeLoads > 0) return;
  setState(IDLE);
}

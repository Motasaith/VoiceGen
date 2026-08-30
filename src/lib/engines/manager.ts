/**
 * Engine lifecycle and the memory budget.
 *
 * On a laptop with a few gigabytes free, holding Kokoro and the cloning model
 * in memory at once is what turns a working app into a swapping one. So:
 *
 *   - engines load on first use, never at startup;
 *   - in single-engine mode, activating one unloads the other;
 *   - an idle engine is dropped after a timeout.
 *
 * Every synthesis call goes through `withEngine`, which is also a global
 * mutex: two concurrent generations on four cores just thrash.
 *
 * Next.js recreates modules on hot reload, so state hangs off globalThis to
 * survive that in development.
 */
import * as kokoro from "./kokoro";
import * as clone from "./clone";

export type EngineName = "kokoro" | "clone";

interface ManagerState {
  queue: Promise<unknown>;
  lastUsed: Partial<Record<EngineName, number>>;
  reaper: NodeJS.Timeout | null;
  settings: {
    singleEngine: boolean;
    idleTimeoutMs: number;
    kokoroDtype: kokoro.Dtype;
    clonePrecision: clone.ClonePrecision;
  };
}

const globalRef = globalThis as unknown as { __voicegen?: ManagerState };

const state: ManagerState = (globalRef.__voicegen ??= {
  queue: Promise.resolve(),
  lastUsed: {},
  reaper: null,
  settings: {
    singleEngine: true,
    idleTimeoutMs: 240_000,
    kokoroDtype: "q8",
    clonePrecision: "q8",
  },
});

export function getSettings() {
  return { ...state.settings };
}

export function updateSettings(patch: Partial<ManagerState["settings"]>) {
  const previous = { ...state.settings };
  Object.assign(state.settings, patch);
  // A precision change means the resident session is the wrong one.
  if (patch.kokoroDtype && patch.kokoroDtype !== previous.kokoroDtype) kokoro.unload();
  if (patch.clonePrecision && patch.clonePrecision !== previous.clonePrecision) clone.unload();
  return getSettings();
}

export function isLoaded(engine: EngineName) {
  return engine === "kokoro" ? kokoro.isLoaded() : clone.isLoaded();
}

function unloadEngine(engine: EngineName) {
  if (engine === "kokoro") kokoro.unload();
  else clone.unload();
}

export function unloadAll() {
  kokoro.unload();
  clone.unload();
  if (state.reaper) { clearInterval(state.reaper); state.reaper = null; }
  if (global.gc) global.gc();
}

function ensureReaper() {
  if (state.reaper || state.settings.idleTimeoutMs <= 0) return;

  state.reaper = setInterval(() => {
    const now = Date.now();
    let anyLoaded = false;

    for (const engine of ["kokoro", "clone"] as EngineName[]) {
      if (!isLoaded(engine)) continue;
      const idle = now - (state.lastUsed[engine] ?? 0);
      if (idle >= state.settings.idleTimeoutMs) {
        console.log(`[manager] unloading idle engine: ${engine}`);
        unloadEngine(engine);
        if (global.gc) global.gc();
      } else {
        anyLoaded = true;
      }
    }

    if (!anyLoaded && state.reaper) {
      clearInterval(state.reaper);
      state.reaper = null;
    }
  }, 15_000);

  // Do not hold the process open just to reclaim memory.
  state.reaper.unref?.();
}

/**
 * Run `fn` with `engine` loaded, serialised against every other engine call.
 */
export function withEngine<T>(engine: EngineName, fn: () => Promise<T>): Promise<T> {
  const run = state.queue.then(async () => {
    if (state.settings.singleEngine) {
      const other: EngineName = engine === "kokoro" ? "clone" : "kokoro";
      if (isLoaded(other)) {
        console.log(`[manager] single-engine mode: unloading ${other} for ${engine}`);
        unloadEngine(other);
        if (global.gc) global.gc();
      }
    }

    if (engine === "kokoro") await kokoro.load(state.settings.kokoroDtype);

    state.lastUsed[engine] = Date.now();
    ensureReaper();
    try {
      return await fn();
    } finally {
      state.lastUsed[engine] = Date.now();
    }
  });

  // Keep the chain alive even when a caller rejects.
  state.queue = run.catch(() => undefined);
  return run;
}

export function memoryReport() {
  const mem = process.memoryUsage();
  const totalMb = Math.round(require("node:os").totalmem() / 1e6);
  const freeMb = Math.round(require("node:os").freemem() / 1e6);
  return {
    processMb: Math.round(mem.rss / 1e6),
    heapMb: Math.round(mem.heapUsed / 1e6),
    systemTotalMb: totalMb,
    systemAvailableMb: freeMb,
    systemPercent: Math.round(((totalMb - freeMb) / totalMb) * 100),
  };
}

export function status() {
  return {
    engines: {
      kokoro: {
        loaded: kokoro.isLoaded(),
        precision: kokoro.loadedDtype() ?? state.settings.kokoroDtype,
        idleSeconds: state.lastUsed.kokoro
          ? Math.round((Date.now() - state.lastUsed.kokoro) / 1000)
          : null,
      },
      clone: {
        loaded: clone.isLoaded(),
        precision: state.settings.clonePrecision,
        idleSeconds: state.lastUsed.clone
          ? Math.round((Date.now() - state.lastUsed.clone) / 1000)
          : null,
      },
    },
    settings: getSettings(),
    memory: memoryReport(),
  };
}

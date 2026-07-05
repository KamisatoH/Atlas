/**
 * 高德 Web 服务 QPS 限制：每个单一服务默认 3 次/秒（见控制台用量管理）。
 * https://console.amap.com/dev/flow/manage
 */
export type AmapService =
  | 'placeSearch'
  | 'geocoder'
  | 'driving'
  | 'walking'
  | 'riding'
  | 'transfer';

const WINDOW_MS = 1000;
const DEFAULT_MAX_QPS = 3;

function maxQpsFor(_service: AmapService): number {
  const raw = import.meta.env.VITE_AMAP_QPS as string | undefined;
  const n = raw ? Number(raw) : DEFAULT_MAX_QPS;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_QPS;
  return Math.floor(n);
}

/** 滑动窗口：每服务独立计数 */
class AmapServiceLimiter {
  private chains = new Map<AmapService, Promise<unknown>>();
  private timestamps = new Map<AmapService, number[]>();

  async run<T>(service: AmapService, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(service) ?? Promise.resolve();
    const task = prev
      .catch(() => undefined)
      .then(async () => {
        await this.waitForSlot(service);
        return fn();
      });
    this.chains.set(
      service,
      task.then(() => undefined).catch(() => undefined)
    );
    return task;
  }

  private async waitForSlot(service: AmapService): Promise<void> {
    const maxQps = maxQpsFor(service);
    for (;;) {
      const now = Date.now();
      const recent = (this.timestamps.get(service) ?? []).filter((t) => now - t < WINDOW_MS);
      if (recent.length < maxQps) {
        recent.push(now);
        this.timestamps.set(service, recent);
        return;
      }
      const oldest = recent[0]!;
      const waitMs = WINDOW_MS - (now - oldest) + 15;
      await new Promise((r) => setTimeout(r, Math.max(waitMs, 40)));
    }
  }
}

const limiter = new AmapServiceLimiter();

/** 在高德单一服务 QPS 配额内执行一次 API 调用 */
export function withAmapRateLimit<T>(service: AmapService, fn: () => Promise<T>): Promise<T> {
  return limiter.run(service, fn);
}

export function amapServiceForRouteMode(
  mode: 'driving' | 'walking' | 'riding' | 'transit'
): AmapService {
  if (mode === 'transit') return 'transfer';
  return mode;
}

export function amapServiceForCtor(ctor: string): AmapService {
  switch (ctor) {
    case 'Walking':
      return 'walking';
    case 'Riding':
      return 'riding';
    case 'Driving':
      return 'driving';
    default:
      return 'driving';
  }
}

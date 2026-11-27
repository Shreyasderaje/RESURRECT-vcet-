// Rate limiter for optional live spot-check endpoint.
// Note: In serverless deployments (e.g., Vercel multi-instance), configure
// UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN or disable public spot-check
// because process-local counters reset across cold starts.

interface IpBucket {
  timestamps: number[];
}

const ipBuckets = new Map<string, IpBucket>();
const dailyCounts = new Map<string, number>();

export interface SpotCheckLimitConfig {
  maxCasesPerRequest: number;
  dailyGlobalLimit: number;
  perIpWindowMs: number;
  perIpMaxRequests: number;
}

export function getSpotCheckConfig(): SpotCheckLimitConfig {
  const maxCases = Number(process.env.SPOT_CHECK_MAX_CASES ?? "5");
  const dailyLimit = Number(process.env.SPOT_CHECK_DAILY_LIMIT ?? "20");

  return {
    maxCasesPerRequest:
      Number.isFinite(maxCases) && maxCases > 0 ? Math.min(maxCases, 5) : 5,
    dailyGlobalLimit:
      Number.isFinite(dailyLimit) && dailyLimit > 0 ? dailyLimit : 20,
    perIpWindowMs: 60_000,
    perIpMaxRequests: 5,
  };
}

export function isDurableRateLimitRequiredAndMissing(): boolean {
  const isVercel = Boolean(process.env.VERCEL);
  const hasDurableStore = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
  return isVercel && !hasDurableStore;
}

export function checkSpotCheckRateLimit(params: {
  ip: string;
  requestedCases: number;
}): {
  allowed: boolean;
  statusCode: number;
  message: string;
  remainingDaily: number;
} {
  const cfg = getSpotCheckConfig();
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);

  if (isDurableRateLimitRequiredAndMissing()) {
    return {
      allowed: false,
      statusCode: 503,
      message:
        "Public live spot-check is disabled on serverless Vercel until durable shared storage (e.g. Redis) is configured for global daily limits.",
      remainingDaily: 0,
    };
  }

  if (params.requestedCases < 1 || params.requestedCases > cfg.maxCasesPerRequest) {
    return {
      allowed: false,
      statusCode: 400,
      message: `Spot-check supports between 1 and ${cfg.maxCasesPerRequest} cases per request.`,
      remainingDaily: Math.max(
        0,
        cfg.dailyGlobalLimit - (dailyCounts.get(today) ?? 0)
      ),
    };
  }

  // Per-IP sliding window check
  const bucket = ipBuckets.get(params.ip) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter(
    (ts) => now - ts < cfg.perIpWindowMs
  );
  if (bucket.timestamps.length >= cfg.perIpMaxRequests) {
    ipBuckets.set(params.ip, bucket);
    return {
      allowed: false,
      statusCode: 429,
      message: `Per-IP rate limit exceeded (${cfg.perIpMaxRequests} spot-checks per minute). Please wait a moment.`,
      remainingDaily: Math.max(
        0,
        cfg.dailyGlobalLimit - (dailyCounts.get(today) ?? 0)
      ),
    };
  }

  // Global daily ceiling check
  const usedToday = dailyCounts.get(today) ?? 0;
  if (usedToday + params.requestedCases > cfg.dailyGlobalLimit) {
    return {
      allowed: false,
      statusCode: 429,
      message: `Global daily spot-check limit (${cfg.dailyGlobalLimit} cases/day) reached. Use the precomputed evaluation results or try again tomorrow.`,
      remainingDaily: Math.max(0, cfg.dailyGlobalLimit - usedToday),
    };
  }

  bucket.timestamps.push(now);
  ipBuckets.set(params.ip, bucket);
  dailyCounts.set(today, usedToday + params.requestedCases);

  return {
    allowed: true,
    statusCode: 200,
    message: "OK",
    remainingDaily: cfg.dailyGlobalLimit - (usedToday + params.requestedCases),
  };
}

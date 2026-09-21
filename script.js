const rows = [...document.querySelectorAll(".pool-table tbody tr[data-pool]")];
const totalTvl = document.querySelector("#total-tvl");
const totalVolume = document.querySelector("#total-volume");
const metricsUpdated = document.querySelector("#metrics-updated");

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

async function fetchPool(address, venue) {
  let metrics = { tvl: null, volume24h: null };
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${encodeURIComponent(address)}`);
    if (!response.ok) throw new Error(`DexScreener HTTP ${response.status}`);
    const payload = await response.json();
    const pair = payload.pair ?? payload.pairs?.[0];
    if (!pair || pair.pairAddress !== address) throw new Error("Pool response mismatch");
    metrics = {
      tvl: finiteNumber(pair.liquidity?.usd),
      volume24h: finiteNumber(pair.volume?.h24),
    };
  } catch (error) {
    if (venue !== "meteora") throw error;
  }

  if (venue === "meteora" && (metrics.tvl === null || metrics.volume24h === null)) {
    const response = await fetch(`https://damm-v2.datapi.meteora.ag/pools/${encodeURIComponent(address)}`);
    if (!response.ok) throw new Error(`Meteora HTTP ${response.status}`);
    const pool = await response.json();
    const reportedTvl = finiteNumber(pool.tvl);
    const calculatedTvl =
      finiteNumber(pool.token_x_amount) * finiteNumber(pool.token_x?.price)
      + finiteNumber(pool.token_y_amount) * finiteNumber(pool.token_y?.price);
    metrics.tvl = metrics.tvl ?? (reportedTvl > 0 ? reportedTvl : finiteNumber(calculatedTvl));
    metrics.volume24h = metrics.volume24h ?? finiteNumber(pool.volume?.["24h"]);
  }

  if (metrics.tvl === null && metrics.volume24h === null) throw new Error("No pool metrics available");
  return metrics;
}

async function refreshMetrics() {
  metricsUpdated.textContent = "Refreshing live pool data…";
  const results = await Promise.allSettled(
    rows.map(async (row) => ({ row, metrics: await fetchPool(row.dataset.pool, row.dataset.venue) })),
  );

  let tvl = 0;
  let volume = 0;
  let loaded = 0;

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { row, metrics } = result.value;
    row.querySelector(".tvl").textContent = metrics.tvl === null ? "N/A" : usd.format(metrics.tvl);
    row.querySelector(".volume").textContent = metrics.volume24h === null ? "N/A" : usd.format(metrics.volume24h);
    if (metrics.tvl !== null) tvl += metrics.tvl;
    if (metrics.volume24h !== null) volume += metrics.volume24h;
    loaded += 1;
  }

  for (const [index, result] of results.entries()) {
    if (result.status !== "rejected") continue;
    const row = rows[index];
    row.querySelector(".tvl").textContent = "Unavailable";
    row.querySelector(".volume").textContent = "Unavailable";
  }

  totalTvl.textContent = loaded ? usd.format(tvl) : "Unavailable";
  totalVolume.textContent = loaded ? usd.format(volume) : "Unavailable";
  const timestamp = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
  metricsUpdated.textContent = `Live venue/DexScreener data · ${loaded}/${rows.length} pools · ${timestamp} MYT`;
}

refreshMetrics();
setInterval(refreshMetrics, 300_000);

/**
 * Price Data Fetcher — Daily closing prices for portfolio stocks
 *
 * Fetches closing prices from Yahoo Finance for all tickers in
 * holdings + watchlist tables, stores in price_data table.
 *
 * Usage:
 *   node pipeline/run.js --fetch-prices          # Fetch latest prices
 *   node pipeline/run.js --fetch-prices --backfill 365  # Backfill N days
 *
 * Design notes (from architecture review):
 *   - Uses native https (no extra dependencies)
 *   - 1.5s delay between tickers to avoid Yahoo rate limiting
 *   - Upserts via ON CONFLICT for idempotency
 *   - Also fetches FX rates (DKKSEK, DKKNOK, DKKEUR) for cross-currency returns
 *   - Logs failures but continues (partial success is better than total failure)
 */

const https = require("https");
const { supabase } = require("../supabase-client");

const FX_TICKERS = ["DKKSEK=X", "DKKNOK=X", "DKKEUR=X"];
const DELAY_MS = 1500; // 1.5s between requests (data-engineer recommendation)
const DEFAULT_BACKFILL_DAYS = 30;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch price history from Yahoo Finance chart API
 * Returns array of { date, close, volume }
 */
function fetchYahooChart(ticker, days) {
  return new Promise((resolve, reject) => {
    const period1 = Math.floor((Date.now() - days * 86400000) / 1000);
    const period2 = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d`;

    const options = {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PodSignal/1.0)",
      },
    };

    https
      .get(url, options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 429) {
            reject(new Error(`Rate limited (429) for ${ticker}`));
            return;
          }
          if (res.statusCode !== 200) {
            reject(
              new Error(
                `HTTP ${res.statusCode} for ${ticker}: ${data.slice(0, 200)}`
              )
            );
            return;
          }
          try {
            const json = JSON.parse(data);
            const result = json.chart?.result?.[0];
            if (!result) {
              reject(new Error(`No data returned for ${ticker}`));
              return;
            }

            const timestamps = result.timestamp || [];
            const closes = result.indicators?.quote?.[0]?.close || [];
            const volumes = result.indicators?.quote?.[0]?.volume || [];
            const currency =
              result.meta?.currency || result.meta?.financialCurrency;

            const prices = [];
            for (let i = 0; i < timestamps.length; i++) {
              if (closes[i] != null) {
                const d = new Date(timestamps[i] * 1000);
                const dateStr = d.toISOString().split("T")[0];
                prices.push({
                  ticker,
                  trade_date: dateStr,
                  close_price: Math.round(closes[i] * 100) / 100,
                  volume: volumes[i] || null,
                  currency: currency || null,
                  source: "yfinance",
                });
              }
            }
            resolve(prices);
          } catch (e) {
            reject(new Error(`Parse error for ${ticker}: ${e.message}`));
          }
        });
      })
      .on("error", reject);
  });
}

/**
 * Get all unique tickers from holdings + watchlist
 */
async function getTrackedTickers() {
  const { data: holdings, error: hErr } = await supabase
    .from("holdings")
    .select("ticker")
    .eq("is_active", true);

  if (hErr) console.error("Error fetching holdings:", hErr.message);

  const { data: watchlist, error: wErr } = await supabase
    .from("watchlist")
    .select("ticker")
    .eq("is_active", true);

  if (wErr) console.error("Error fetching watchlist:", wErr.message);

  const tickers = new Set();
  (holdings || []).forEach((h) => tickers.add(h.ticker));
  (watchlist || []).forEach((w) => tickers.add(w.ticker));

  // Always include FX rates
  FX_TICKERS.forEach((fx) => tickers.add(fx));

  return Array.from(tickers);
}

/**
 * Upsert price rows into Supabase
 */
async function upsertPrices(prices) {
  if (prices.length === 0) return 0;

  // Batch in chunks of 500
  let inserted = 0;
  for (let i = 0; i < prices.length; i += 500) {
    const batch = prices.slice(i, i + 500);
    const { error } = await supabase.from("price_data").upsert(batch, {
      onConflict: "ticker,trade_date",
      ignoreDuplicates: false,
    });

    if (error) {
      console.error(`  Upsert error (batch ${i / 500 + 1}):`, error.message);
    } else {
      inserted += batch.length;
    }
  }
  return inserted;
}

/**
 * Main: fetch prices for all tracked tickers
 */
async function fetchPrices(backfillDays) {
  const days = backfillDays || DEFAULT_BACKFILL_DAYS;
  const tickers = await getTrackedTickers();

  if (tickers.length === 0) {
    console.log(
      "No tickers found in holdings or watchlist. Add some first."
    );
    return;
  }

  console.log(
    `Fetching ${days} days of prices for ${tickers.length} tickers...\n`
  );

  let totalInserted = 0;
  let failures = 0;

  for (const ticker of tickers) {
    try {
      const prices = await fetchYahooChart(ticker, days);
      const count = await upsertPrices(prices);
      const latest = prices.length > 0 ? prices[prices.length - 1] : null;
      console.log(
        `  ${ticker}: ${count} prices stored` +
          (latest
            ? ` (latest: ${latest.close_price} ${latest.currency || ""} on ${latest.trade_date})`
            : "")
      );
      totalInserted += count;
    } catch (err) {
      console.error(`  ${ticker}: FAILED - ${err.message}`);
      failures++;

      // Back off extra on rate limit
      if (err.message.includes("429")) {
        console.log("  Rate limited — waiting 10s before continuing...");
        await sleep(10000);
      }
    }

    await sleep(DELAY_MS);
  }

  console.log(
    `\nDone: ${totalInserted} price records stored, ${failures} failures out of ${tickers.length} tickers.`
  );
}

module.exports = { fetchPrices };

const YAHOO_BASE = 'https://query1.finance.yahoo.com';
const cache = globalThis.__pocketIsaYahooCache || new Map();
globalThis.__pocketIsaYahooCache = cache;

const allowedOrigins = () => String(process.env.FRONTEND_ORIGIN || '*')
  .split(',')
  .map(value => value.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const headersFor = event => {
  const requestOrigin = event.headers?.origin || event.headers?.Origin || '';
  const origins = allowedOrigins();
  const allowOrigin = origins.includes('*')
    ? '*'
    : (origins.includes(requestOrigin) ? requestOrigin : origins[0] || '*');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff'
  };
};

const reply = (event, status, body, cacheSeconds = 0) => ({
  statusCode: status,
  headers: {
    ...headersFor(event),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheSeconds > 0
      ? `public, max-age=0, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`
      : 'no-store'
  },
  body: JSON.stringify(body)
});

const cacheGet = async (key, ttlMs, loader) => {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await loader();
  cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
};

const yahooJson = async (path, params, ttlMs) => cacheGet(
  path + '?' + new URLSearchParams(params).toString(),
  ttlMs,
  async () => {
    const url = new URL(YAHOO_BASE + path);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Pocket-ISA-market-relay/1.0'
      }
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) {}
    if (!response.ok || payload?.chart?.error || payload?.finance?.error) {
      const detail = payload?.chart?.error?.description
        || payload?.finance?.error?.description
        || `Yahoo Finance returned HTTP ${response.status}.`;
      throw Object.assign(new Error(String(detail)), { statusCode: response.status === 429 ? 429 : 502 });
    }
    return payload;
  }
);

const symbolsFrom = params => String(params.get('symbols') || '')
  .split(',')
  .map(item => item.trim().toUpperCase())
  .filter(Boolean);

const chartFor = async (symbol, params = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const period1 = params.period1 || now - 5 * 365 * 24 * 60 * 60;
  const period2 = params.period2 || now;
  const interval = params.interval || '1d';
  const payload = await yahooJson(`/v8/finance/chart/${encodeURIComponent(symbol)}`, {
    period1,
    period2,
    interval,
    events: 'div,splits',
    includePrePost: 'false'
  }, interval === '1mo' ? 10 * 60_000 : 30_000);
  const result = payload?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo returned no data for ${symbol}.`);
  return result;
};

const currencyInfo = (symbol, metadata) => {
  const raw = String(metadata?.currency || '').trim();
  if (raw === 'GBp' || raw === 'GBX' || raw === 'GBx') {
    return { code: 'GBp', displayDivisor: 100 };
  }
  if (raw) return { code: raw.toUpperCase(), displayDivisor: 1 };
  if (String(symbol).toUpperCase().endsWith('.L')) {
    return { code: 'GBP', displayDivisor: 1 };
  }
  return { code: 'USD', displayDivisor: 1 };
};

const gbpUsdRate = () => chartFor('GBPUSD=X', { interval: '1d' })
  .then(result => Number(result.meta?.regularMarketPrice || result.meta?.previousClose));

const toDisplayPrice = async (nativePrice, currency) => {
  const divided = nativePrice / currency.displayDivisor;
  if (currency.code === 'USD') {
    const rate = await gbpUsdRate();
    return rate > 0 ? divided / rate : divided;
  }
  return divided;
};

const quoteFor = async requestedSymbol => {
  const result = await chartFor(requestedSymbol, { interval: '1d' });
  const metadata = result.meta || {};
  const currency = currencyInfo(requestedSymbol, metadata);
  const nativePrice = Number(metadata.regularMarketPrice);
  if (!Number.isFinite(nativePrice) || nativePrice <= 0) return null;
  const displayPrice = await toDisplayPrice(nativePrice, currency);
  const previous = Number(metadata.chartPreviousClose || metadata.previousClose);
  const changePercent = Number(metadata.regularMarketChangePercent);
  const calculatedChange = previous > 0 ? ((nativePrice - previous) / previous) * 100 : 0;
  return {
    symbol: String(requestedSymbol).trim().toUpperCase(),
    price: nativePrice,
    nativePrice,
    displayPrice,
    currency: currency.code,
    shortName: metadata.shortName || metadata.symbol || requestedSymbol,
    longName: metadata.longName || metadata.shortName || metadata.symbol || requestedSymbol,
    changePercent: Number.isFinite(changePercent) ? changePercent : calculatedChange,
    asOf: metadata.regularMarketTime
      ? new Date(Number(metadata.regularMarketTime) * 1000).toISOString()
      : new Date().toISOString(),
    marketState: metadata.marketState || 'UNKNOWN'
  };
};

const searchFor = async query => {
  const payload = await yahooJson('/v1/finance/search', {
    q: query,
    quotesCount: 30,
    newsCount: 0,
    enableFuzzyQuery: 'false'
  }, 60 * 60_000);
  return (Array.isArray(payload?.quotes) ? payload.quotes : []).map(item => ({
    symbol: String(item.symbol || ''),
    shortName: item.shortname || item.longname || item.symbol,
    longName: item.longname || item.shortname || item.symbol,
    exchange: item.exchange || item.exchDisp || '',
    currency: item.currency || ''
  })).filter(item => item.symbol);
};

const historyFor = async (requestedSymbol, from) => {
  const fromDate = from
    ? new Date(from + 'T00:00:00')
    : new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);
  const result = await chartFor(requestedSymbol, {
    period1: Math.floor(fromDate.getTime() / 1000),
    period2: Math.floor(Date.now() / 1000),
    interval: '1mo'
  });
  const currency = currencyInfo(requestedSymbol, result.meta);
  const closes = result.indicators?.quote?.[0]?.close || [];
  const timestamps = result.timestamp || [];
  const points = timestamps.map((timestamp, index) => ({
    date: new Date(Number(timestamp) * 1000).toISOString().slice(0, 10),
    close: Number(closes[index]) / currency.displayDivisor
  })).filter(item => item.date && Number.isFinite(item.close) && item.close > 0);
  return { symbol: requestedSymbol, points };
};

const routeName = (url, params) => {
  const fromQuery = String(params.get('path') || '').replace(/^\/+|\/+$/g, '');
  if (fromQuery) return fromQuery;
  const marker = '/.netlify/functions/market';
  const index = url.pathname.indexOf(marker);
  if (index >= 0) return url.pathname.slice(index + marker.length).replace(/^\/+/, '');
  const apiMarker = '/api/market/';
  const apiIndex = url.pathname.indexOf(apiMarker);
  return apiIndex >= 0 ? url.pathname.slice(apiIndex + apiMarker.length).replace(/^\/+/, '') : '';
};

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return reply(event, 204, {});
  if (event.httpMethod !== 'GET') return reply(event, 405, { error: 'GET only' });

  try {
    const url = new URL(event.rawUrl || 'https://pocket-isa.netlify.app/.netlify/functions/market');
    const params = new URLSearchParams(url.search);
    const route = routeName(url, params);

    if (route === 'quote') {
      const symbols = symbolsFrom(params);
      if (!symbols.length) return reply(event, 400, { error: 'At least one symbol is required.' });
      const quotes = await Promise.all(symbols.map(quoteFor));
      return reply(event, 200, quotes.filter(Boolean), 30);
    }

    if (route === 'search') {
      const query = String(params.get('q') || '').trim();
      if (!query) return reply(event, 200, [], 3600);
      return reply(event, 200, await searchFor(query), 3600);
    }

    if (route === 'history-monthly') {
      const symbols = symbolsFrom(params);
      const from = String(params.get('from') || '');
      const result = await Promise.all(symbols.map(symbol => historyFor(symbol, from)));
      return reply(event, 200, result, 600);
    }

    return reply(event, 404, { error: 'Unknown market-data route.' });
  } catch (error) {
    const status = Number(error?.statusCode) || 502;
    const message = status === 429
      ? 'Yahoo Finance is temporarily rate-limiting the relay. Please try Refresh prices again shortly.'
      : (error instanceof Error ? error.message : 'Market-data request failed.');
    return reply(event, status, { error: message });
  }
};

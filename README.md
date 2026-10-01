# Pocket Pension + Cloudflare Yahoo Finance relay

Pocket Pension already uses the `/api/market/quote`, `/api/market/search`, and
`/api/market/history-monthly` routes. This bundle points it at the working
Cloudflare Worker:

```text
Pocket Pension → https://yahoo-proxy.andyparker1968.workers.dev → Yahoo Finance
```

The ZIP matches the Pocket ISA package layout: `index.html`, this README, and
the root-level `apple-touch-icon.png`. The HTML uses that image for the in-app
mark and home-screen icon.

The refreshed standalone appearance uses light-grey panels (`#eef0f2`), dark
supporting text, a Rounded font, and bold labels and totals. The phone layout
uses more screen width with fewer card borders. Previously saved
beige-and-green defaults are migrated on load; other customized appearance
settings are retained.

The browser never calls Yahoo directly. The frontend is configured in
`index.html` with:

```js
apiBaseUrl: "https://yahoo-proxy.andyparker1968.workers.dev"
```

No Yahoo or Finnhub API key is needed by the Worker. Yahoo data can be delayed
or temporarily rate-limited.

## Chart start date

The fund-value chart uses the earliest valid historical portfolio point only
when cached history belongs to the current portfolio and predates the selected
projection start date. If there is no usable historical series, the chart starts
at the projection start date; stale or empty history cannot stretch the x-axis
back to an unrelated holding or cached date.

## Routes

```text
GET /api/market/quote?symbols=VWRP.L,HSBA.L
GET /api/market/search?q=Vanguard
GET /api/market/history-monthly?symbols=VWRP.L&from=2021-04-15
```


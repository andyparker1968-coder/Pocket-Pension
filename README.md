# Pocket Pension + Cloudflare Yahoo Finance relay

Pocket Pension already uses the `/api/market/quote`, `/api/market/search`, and
`/api/market/history-monthly` routes. This bundle points it at the working
Cloudflare Worker:

```text
Pocket Pension → https://yahoo-proxy.andyparker1968.workers.dev → Yahoo Finance
```

The browser never calls Yahoo directly. The frontend is configured in
`index.html` with:

```js
apiBaseUrl: "https://yahoo-proxy.andyparker1968.workers.dev"
```

No Yahoo or Finnhub API key is needed by the Worker. Yahoo data can be delayed
or temporarily rate-limited.

## Routes

```text
GET /api/market/quote?symbols=VWRP.L,HSBA.L
GET /api/market/search?q=Vanguard
GET /api/market/history-monthly?symbols=VWRP.L&from=2021-04-15
```


# Pocket Pension + Yahoo Finance Netlify relay

Pocket Pension already uses the `/api/market/quote`, `/api/market/search`, and
`/api/market/history-monthly` routes. This bundle points it at the working
server-side Yahoo relay:

```text
Pocket Pension → https://pocket-isa.netlify.app → Yahoo Finance
```

The browser never calls Yahoo directly. The frontend is configured in
`index.html` with:

```js
apiBaseUrl: "https://pocket-isa.netlify.app"
```

## Use with the existing relay

If Pocket Pension is hosted on GitHub Pages, add its browser origin to the
existing Netlify site's `FRONTEND_ORIGIN` variable. For this repository owner,
the likely GitHub Pages origin is:

```text
https://andyparker1968-coder.github.io
```

If the page is hosted at another domain, use that domain instead. Keep the
existing Pocket ISA origins too, separated by commas.

No Yahoo or Finnhub API key is needed by the Yahoo relay. Yahoo data can be
delayed or temporarily rate-limited.

## Routes

```text
GET /api/market/quote?symbols=VWRP.L,HSBA.L
GET /api/market/search?q=Vanguard
GET /api/market/history-monthly?symbols=VWRP.L&from=2021-04-15
```

The `netlify/` folder and `netlify.toml` are included if you prefer to deploy
Pocket Pension as its own Netlify site instead of using the existing relay.

# Headless AMD Trading Bot

This runner turns the desk's AMD + supply/demand logic into a process that does not depend on an open browser tab.

## Safety defaults

- Starts in **paper mode**.
- Trades only from live Yahoo OHLC data; if the feed fails, the cycle is skipped.
- Requires AMD distribution, MSS, a valid retest, and trend alignment by default.
- Allows only one open position at a time.
- Deduplicates signals by symbol/timeframe/candle.
- Live TradeLocker execution requires `BOT_MODE=live` **and** `BOT_LIVE_TRADING=true`.
- Credentials are read from environment variables and are never committed.

## Run

```bash
npm run test:bot
npm run bot
```

For a one-cycle check:

```bash
npm run bot:once
```

Configure the process using `bot/config.example.env`.

## Important

A Vercel web deployment does not provide a permanent background worker. Run this bot as a long-lived Node process on a machine or worker service you control. Keep it in paper/demo mode until the symbols, quantity, stop-loss, target, and broker mapping have been verified on your account.

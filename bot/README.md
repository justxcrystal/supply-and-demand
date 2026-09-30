# Headless AMD Trading Bot

This is an unattended TradeLocker trading process. Once it is running with live execution enabled, no browser tab, manual Send button, or per-trade confirmation is required.

## Automatic TradeLocker flow

1. Log in to TradeLocker with the configured broker/prop server.
2. Select the configured account by TradeLocker account ID.
3. Discover the required `accNum` automatically.
4. Refresh JWT authentication automatically.
5. Resolve the broker's exact instrument and INFO/TRADE route IDs.
6. Pull historical candles directly from TradeLocker in live mode.
7. Run the AMD + supply/demand continuation rules.
8. Confirm the setup is executable and trend-aligned.
9. Verify there is no existing open TradeLocker position.
10. Submit the market order with the strategy stop loss and selected TP.
11. Continue scanning without needing the web dashboard open.

## Atlas configuration

The runtime configuration supports the Atlas TradeLocker setup with:

- `BOT_TL_SERVER=ATLAS`
- `BOT_TL_ENV=bsb`
- `BOT_TL_ACCOUNT_ID=<your TradeLocker account ID>`

The repository does **not** store your account ID, user ID, email, or password. Those values belong in the worker/service environment.

`BOT_TL_BASE_URL` is available as an override if the TradeLocker REST entrypoint for the account differs from the standard environment URL.

## Safety / execution controls

- One broker position at a time.
- Duplicate signal protection per symbol/timeframe/candle.
- No synthetic data is ever used for live TradeLocker orders.
- Live mode uses TradeLocker's own historical-bar endpoint.
- If market data, authentication, instrument resolution, or position verification fails, the cycle is skipped rather than forcing an order.
- Live execution requires a one-time runtime opt-in with both `BOT_MODE=live` and `BOT_LIVE_TRADING=true`. After that, execution is automatic.

## Run

```bash
npm run test:bot
npm run bot
```

For a single scan cycle:

```bash
npm run bot:once
```

Use `bot/config.example.env` as the runtime configuration reference.

## Deployment

The normal Vercel website is not a permanent background worker. For true unattended execution, run `npm run bot` as a long-lived Node process on a worker/VPS/container service. The process will keep scanning and trading without the Supply & Demand Desk being open.

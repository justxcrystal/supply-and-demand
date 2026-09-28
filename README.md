# Supply & Demand Desk

A responsive AMD and supply/demand trading dashboard with paper trading, strategy diagnostics, backtesting, and opt-in TradeLocker execution.

## Local development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run typecheck
npm run build
```

TradeLocker credentials are entered at runtime and are not stored in this repository.

## Sending trades

The regular desk opens by default. The optional $100 challenge locks FX, gold, and indices until its paper equity reaches $200. To send a TradeLocker order, connect the correct demo or live environment, select copy accounts, enable **Send to TradeLocker**, and use the manual ticket. The broker result appears beside the send controls; **accepted** means the API accepted the request, not that a position filled. Check **Open trades** for the resulting position.

Auto signals also require **Auto signals** to be on, a live chart feed, and an executable AMD retest with trend. They run in the open browser tab; this is not an unattended server bot. If the market data request falls back to simulated candles, auto broker execution pauses and the desk shows that reason. Broker orders are not added to the paper journal.

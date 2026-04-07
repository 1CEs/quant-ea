# Product Requirements Document — Quant EA

## 1. Product Overview

**Quant EA** is a desktop trading bot application that executes quantitative scalping strategies on MetaTrader 5 (MT5). It runs on **macOS** using **Electron** for the UI and a **Python bridge** that communicates with MT5 running under **Wine**. The system automates order placement, management, and cancellation based on configurable scalping algorithms.

---

## 2. Goals

- Provide a native-feeling macOS desktop app for automated MT5 scalping.
- Abstract away the Wine/MT5 complexity behind a clean UI.
- Support multiple quantitative scalping algorithms (user-selectable).
- Offer secure credential management with remember-me functionality.
- Deliver real-time trade monitoring, logging, and risk controls.

---

## 3. Target Users

- Retail forex/CFD traders on macOS who want automated scalping.
- Quant-oriented traders who want to test and deploy scalping algorithms without manual execution.

---

## 4. System Architecture

```
┌──────────────────────────────────────────────────┐
│                  Electron App (UI)                │
│         React + TailwindCSS + shadcn/ui          │
├──────────────────────────────────────────────────┤
│              IPC / WebSocket Bridge               │
├──────────────────────────────────────────────────┤
│              Python Backend Service               │
│         (FastAPI or ZeroMQ-based server)          │
├──────────────────────────────────────────────────┤
│          MetaTrader5 Python Package               │
│            (runs inside Wine env)                 │
├──────────────────────────────────────────────────┤
│          Wine + MT5 Terminal (headless)           │
└──────────────────────────────────────────────────┘
```

### 4.1 Electron Frontend
- Renders the dashboard, login, settings, and trade views.
- Communicates with the Python backend via IPC (child process) or local WebSocket.

### 4.2 Python Bridge
- Runs as a child process spawned by Electron **or** as a standalone local server.
- Uses the `MetaTrader5` Python package to interact with the MT5 terminal running under Wine.
- Exposes a JSON-based API (WebSocket or HTTP) for the Electron frontend.

### 4.3 Wine + MT5
- MT5 terminal installed via Wine on macOS.
- The Python bridge initializes MT5 by pointing to the Wine-prefixed MT5 `terminal64.exe`.

---

## 5. Features

### 5.1 Authentication & Credential Management

| Requirement | Details |
|---|---|
| **MT5 Login** | User provides MT5 account number, password, and server name. |
| **Broker Server Selection** | Dropdown or text input for the MT5 broker server. |
| **Remember Credentials** | Toggle to persist encrypted credentials locally (using OS keychain or AES-encrypted file). |
| **Auto-Login** | If credentials are remembered, auto-connect on app launch. |
| **Connection Status** | Real-time indicator showing MT5 connection state (connected / disconnected / reconnecting). |
| **Multi-Account Support** | Store and switch between multiple MT5 accounts. |
| **Logout** | Gracefully disconnect from MT5 and clear session (optionally clear saved credentials). |

### 5.2 Dashboard

| Requirement | Details |
|---|---|
| **Account Summary** | Display balance, equity, margin, free margin, profit/loss. |
| **Open Positions** | Live table of all open positions with symbol, type, volume, open price, current price, SL, TP, profit. |
| **Pending Orders** | List of all pending orders (buy limit, sell limit, buy stop, sell stop). |
| **Trade History** | Paginated history of closed trades with filters (date range, symbol, result). |
| **P&L Chart** | Real-time equity curve / cumulative P&L chart. |
| **Bot Status Card** | Shows whether the bot is running, paused, or stopped, plus current algorithm name. |

### 5.3 Bot Engine (Scalping Algorithms)

| Requirement | Details |
|---|---|
| **Algorithm Selection** | User picks from a list of available scalping strategies before starting the bot. |
| **Configurable Parameters** | Each algorithm exposes its own parameter set (e.g., EMA period, RSI threshold, spread filter, TP/SL pips). |
| **Start / Pause / Stop** | Controls to start, pause (hold positions but stop new entries), and fully stop the bot. |
| **Symbol Selection** | Choose one or more trading symbols for the bot to operate on. |
| **Timeframe Selection** | Select the chart timeframe (M1, M5, M15, etc.) the algorithm uses. |
| **Lot Size / Risk Config** | Fixed lot size or risk-based position sizing (% of balance). |

#### 5.3.1 Scalping Algorithms (to be implemented — user will choose)

1. **EMA Crossover Scalper** — Fast/slow EMA crossover with RSI confirmation and tight SL/TP.
2. **Bollinger Band Mean Reversion** — Enter on band touch, exit at middle band, with ATR-based SL.
3. **Order Block / Fair Value Gap (SMC)** — Identify institutional order blocks and FVGs for precision entries.
4. **VWAP Bounce Scalper** — Trade bounces off VWAP with volume confirmation.
5. **Momentum Breakout Scalper** — Breakout of recent high/low with momentum filter (ADX / volume spike).

### 5.4 Order Management

| Requirement | Details |
|---|---|
| **Market Orders** | Place instant buy/sell market orders. |
| **Pending Orders** | Place buy limit, sell limit, buy stop, sell stop orders. |
| **Modify Orders** | Modify SL, TP, and price of existing orders/positions. |
| **Cancel Orders** | Cancel any pending order. |
| **Close Positions** | Close a single position or close all positions at once. |
| **Partial Close** | Close a portion of an open position. |
| **Trailing Stop** | Configurable trailing stop that follows price by N pips. |
| **Break-Even Auto-Move** | Automatically move SL to entry price after N pips in profit. |

### 5.5 Risk Management

| Requirement | Details |
|---|---|
| **Max Daily Loss** | Stop the bot if daily loss exceeds a configured amount or percentage. |
| **Max Drawdown** | Stop the bot if drawdown exceeds threshold. |
| **Max Open Trades** | Limit the number of concurrent open positions. |
| **Max Spread Filter** | Skip entries if current spread exceeds N pips. |
| **Trading Hours** | Restrict bot to specific trading sessions (e.g., London, New York). |
| **News Filter** | Optionally pause trading around high-impact news events. |
| **Emergency Stop** | One-click button to close all positions and stop the bot immediately. |

### 5.6 Notifications & Logging

| Requirement | Details |
|---|---|
| **In-App Notifications** | Toast notifications for trade opened, closed, error, and bot state changes. |
| **Desktop Notifications** | macOS native notifications for key events. |
| **Trade Log** | Persistent log of all bot actions with timestamps (stored in SQLite or JSON). |
| **Error Log** | Separate error/debug log for troubleshooting. |
| **Export Logs** | Export trade history and logs to CSV. |

### 5.7 Settings

| Requirement | Details |
|---|---|
| **General** | Theme (light/dark), language, startup behavior. |
| **Connection** | MT5 path (Wine prefix), Python path, connection timeout. |
| **Risk Defaults** | Default lot size, max daily loss, max drawdown, max trades. |
| **Algorithm Defaults** | Default parameters per algorithm. |
| **Credential Management** | View/delete saved accounts, clear keychain data. |

---

## 6. Tech Stack

| Layer | Technology |
|---|---|
| **Desktop Shell** | Electron |
| **Frontend** | React + TypeScript + TailwindCSS + shadcn/ui |
| **Charts** | Lightweight Charts (TradingView) or Recharts |
| **Backend Bridge** | Python 3.11+ (FastAPI WebSocket server or ZeroMQ) |
| **MT5 Integration** | `MetaTrader5` Python package |
| **Wine Layer** | Wine 9+ / CrossOver on macOS |
| **Local DB** | SQLite (via `better-sqlite3` on Electron side, or `sqlite3` on Python side) |
| **Credential Storage** | macOS Keychain (via `keytar`) or AES-256 encrypted local file |
| **Process Management** | Electron spawns Python as a child process |
| **IPC** | WebSocket (preferred) or stdin/stdout JSON-RPC |

---

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Latency** | Order execution round-trip (app → Python → MT5) < 200ms on local machine. |
| **Reliability** | Auto-reconnect to MT5 on connection drop. Persist bot state across restarts. |
| **Security** | Credentials encrypted at rest. No credentials sent to external servers. |
| **Portability** | macOS primary. Architecture should allow future Linux/Windows support. |
| **Resource Usage** | Idle CPU < 5%. Memory < 300MB. |
| **Logging** | All trades and errors logged with timestamps for auditability. |

---

## 8. User Flows

### 8.1 First Launch
1. App opens → Login screen.
2. User enters MT5 account number, password, server.
3. User toggles "Remember Credentials".
4. App spawns Python bridge → connects to MT5 via Wine.
5. On success → redirect to Dashboard.

### 8.2 Start Bot
1. From Dashboard → click "Start Bot".
2. Select algorithm from dropdown.
3. Configure parameters (or use defaults).
4. Select symbol(s) and timeframe.
5. Set risk parameters.
6. Click "Confirm & Start".
7. Bot begins analyzing ticks and placing orders.

### 8.3 Emergency Stop
1. User clicks "Emergency Stop" button (always visible in header).
2. Bot immediately stops.
3. All open positions are closed at market.
4. All pending orders are cancelled.
5. Confirmation toast displayed.

---

## 9. Milestones

| Phase | Scope | Target |
|---|---|---|
| **Phase 1 — Foundation** | Electron shell, Python bridge, Wine/MT5 connection, Login/auth flow, credential storage. | Week 1–2 |
| **Phase 2 — Dashboard & Orders** | Account dashboard, manual order placement/modification/cancellation, position table. | Week 3–4 |
| **Phase 3 — Bot Engine** | Algorithm framework, first 1–2 scalping strategies, start/pause/stop controls, basic risk management. | Week 5–7 |
| **Phase 4 — Risk & Logging** | Full risk management suite, trade logging, notifications, export. | Week 8–9 |
| **Phase 5 — Polish & Settings** | Settings UI, theme, multi-account, bug fixes, performance tuning. | Week 10–11 |
| **Phase 6 — Testing & Release** | End-to-end testing, demo account validation, packaging for macOS distribution. | Week 12 |

---

## 10. Open Questions

- [ ] Which scalping algorithm(s) to implement first?
- [ ] Preferred broker / MT5 server for development testing?
- [ ] Should the app support a backtesting mode for strategies?
- [ ] External notification channels (Telegram, Discord, email)?
- [ ] License model — personal use only or distributable?

---

## 11. Out of Scope (v1)

- Mobile companion app.
- Cloud-hosted execution.
- Copy trading / signal provider features.
- Multi-terminal (running multiple MT5 instances).
- Built-in strategy code editor / scripting.

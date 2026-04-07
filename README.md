# Quant EA

A desktop trading application for automated quantitative strategy execution on MetaTrader 5 (MT5). Built with Electron, React, and a Python backend, designed for macOS with Wine-based MT5 integration and a mock mode for development without a live broker.

---

## Table of Contents

- [Architecture](#architecture)
- [System Flow](#system-flow)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Features](#features)

---

## Architecture

```
+-------------------------------------------------------------+
|                     Electron (Main Process)                  |
|  - Window management                                        |
|  - Python child process lifecycle (PythonBridge)             |
+----------------------------+--------------------------------+
                             |  IPC
+----------------------------v--------------------------------+
|                   Renderer (React + Tailwind)                |
|  - Login, Dashboard, Backtest, PnL Calendar, Settings       |
|  - WebSocket client for real-time communication              |
|  - Zustand state management                                  |
+----------------------------+--------------------------------+
                             |  WebSocket (port 8765)
+----------------------------v--------------------------------+
|                    Python Backend (server.py)                 |
|  - WebSocket server (asyncio + websockets)                   |
|  - Routes messages to handlers                               |
+--------+----------+-----------+----------+------------------+
         |          |           |          |
    +----v---+ +----v----+ +---v---+ +----v---------+
    | MT5    | | Order   | | Risk  | | Bot Engine   |
    |Service | | Manager | | Mgr   | | (Threading)  |
    +----+---+ +---------+ +-------+ +----+---------+
         |                                 |
    +----v---+                        +----v---------+
    | Wine   |                        | Strategy     |
    | Bridge |                        | (RL Bandit)  |
    +--------+                        +--------------+
         |
    +----v-----------+
    | MT5 Terminal    |
    | (Wine / Mock)   |
    +-----------------+

    +--------------------+
    | MongoDB            |
    | (Dataset Store)    |
    +--------------------+
```

---

## System Flow

### 1. Application Startup

1. Electron main process creates the browser window.
2. The renderer loads the React application and presents the login screen.

### 2. Authentication

1. The user enters MT5 credentials (account, password, server).
2. The renderer calls `window.api.python.start()` via IPC, which spawns the Python backend as a child process.
3. The Python backend starts a WebSocket server on port 8765.
4. The renderer connects to the WebSocket and sends a `login` message.
5. The Python backend initializes the MT5 service:
   - **Native mode**: Connects to a real MT5 terminal (Windows).
   - **Wine mode**: Connects via a Wine bridge to MT5 running under Wine on macOS.
   - **Mock mode**: Falls back to a simulated MT5 environment for development.
6. On successful login, the backend pre-caches candle data from MongoDB in the background. The renderer redirects to the dashboard.

### 3. Dashboard and Real-Time Data

1. The dashboard establishes periodic WebSocket polling for account info, positions, and pending orders.
2. Account summary, positions table, pending orders table, equity chart, and live price chart update in real time.
3. All WebSocket events are routed through a centralized `WebSocketService` class and dispatched to Zustand stores.

### 4. Bot Lifecycle (Start / Pause / Stop)

**Starting the bot:**

1. The user selects a strategy, configures lot size, and clicks **Start Bot**.
2. The button immediately shows a loading spinner (local state).
3. The renderer sends a `start_bot` message with the full strategy configuration.
4. The backend sets the bot status to `starting` and spawns a background thread.
5. The bot thread executes the following sequence, sending `bot_progress` events to the frontend at each step:
   - **Step 1** -- Load candle data from cache (instant if pre-cached) or fall back to MongoDB.
   - **Step 2** -- Initialize and train the RL strategy on the loaded candles.
   - **Step 3** -- Evaluate the initial signal on the most recent candle.
6. Once initialization completes, the bot transitions to `running` status.
7. The frontend displays a step-by-step progress indicator with a progress bar during initialization, then switches to a live status indicator.

**Running loop:**

1. The bot sleeps for the poll interval (interruptible via `threading.Event`).
2. On wake, it fetches new candle data (live MT5 or cached MongoDB).
3. If a new candle is detected, the strategy re-evaluates and may produce a BUY, SELL, or NONE signal.
4. On a signal, the bot checks risk constraints, fetches tick data, calculates SL/TP from ATR, and places an order.
5. Opposite positions are closed before opening a new one. Existing same-direction positions are skipped.
6. All actions are logged to the frontend trade log panel via async WebSocket messages.

**Pausing:**

1. The user clicks **Pause**. The bot thread continues running but skips signal evaluation.
2. Open positions are maintained. No new entries are taken.
3. Clicking **Resume** returns the bot to the running state.

**Stopping:**

1. The user clicks **Stop**. The stop event is set immediately.
2. The bot thread exits at the next interruptible checkpoint (all sleeps and blocking calls check the stop event).
3. The candle cache is cleared. Status returns to `stopped`.

### 5. Strategy Execution (RL Thompson Bandit)

1. Historical candle data is preprocessed: EMA crossovers, RSI, ADX, and ATR indicators are computed.
2. A state vector is encoded for each candle from these indicators.
3. A walk-forward training loop simulates trades on historical data, updating a Thompson Sampling contextual bandit.
4. At inference time, the bandit decides whether to act on the base indicator signal or abstain.
5. Stop-loss and take-profit levels are derived from ATR multipliers configured in the strategy parameters.

### 6. Backtesting

1. The user imports CSV candle data via the backtest page. Files are parsed and stored in MongoDB.
2. The user selects a strategy, configures parameters, and runs a backtest.
3. The backtester runs walk-forward evaluation on the stored data and returns trade-by-trade results.
4. Results are displayed with equity curve, trade table, and performance metrics.

### 7. Data Pipeline

1. CSV files are imported through the frontend. The Python backend parses them (auto-detecting delimiter and date format) and stores them in MongoDB via `DatasetStore`.
2. The `DatasetStore` provides `get_candles` and `store_candles` methods backed by a `candles` collection in MongoDB, indexed by symbol and timeframe.
3. The bot engine uses a two-tier data source: live MT5 rates (preferred) with MongoDB fallback. MongoDB results are cached in-memory after the first fetch to avoid repeated database queries.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop Shell | Electron |
| Frontend | React, TypeScript, TailwindCSS, Radix UI, Recharts, Lucide Icons |
| State Management | Zustand |
| Build Tool | electron-vite |
| Backend | Python 3.11+, asyncio, websockets |
| MT5 Integration | MetaTrader5 Python package (native or Wine bridge) |
| Database | MongoDB (via pymongo) |
| Strategy | NumPy, pandas, ta (technical analysis) |
| Wine Layer | Wine 9+ on macOS |
| IPC | WebSocket (port 8765) |

---

## Project Structure

```
quant-ea/
  src/
    main/                  Electron main process
      index.ts               Window creation, IPC handlers
      python-bridge.ts       Spawns and manages Python child process
    preload/               Preload scripts exposing IPC to renderer
      index.ts
    renderer/              React frontend
      src/
        components/
          Layout.tsx           App shell with sidebar navigation
          NotificationProvider.tsx
          Terminal.tsx
          dashboard/
            AccountSummary.tsx
            BotControlCard.tsx   Bot start/pause/stop with progress UI
            EquityChart.tsx
            LiveChart.tsx
            PendingOrdersTable.tsx
            PositionsTable.tsx
            TradeLogPanel.tsx
        pages/
          LoginPage.tsx
          DashboardPage.tsx
          BacktestPage.tsx
          PnLCalendarPage.tsx
          SettingsPage.tsx
        services/
          websocket.ts         WebSocket client singleton
        store/
          app-store.ts         Global Zustand store
          terminal-store.ts
        types/
          index.ts             TypeScript type definitions
  python/
    main.py                  Entry point (CLI argument parsing, server start)
    server.py                WebSocket server with message routing
    mt5_service.py           MT5 connection and trading operations
    mock_mt5_service.py      Simulated MT5 for development
    wine_bridge.py           Wine-based MT5 communication
    wine_mt5_worker.py       Worker process for Wine MT5 calls
    order_manager.py         High-level order placement and management
    risk_manager.py          Risk checks (daily loss, drawdown, spread, hours)
    dataset_store.py         MongoDB candle storage and retrieval
    csv_importer.py          CSV file parsing with format auto-detection
    backtester.py            Walk-forward backtesting engine
    bot_engine/
      engine.py              Bot lifecycle, strategy tick loop, auto-trading
    strategies/
      base.py                Abstract strategy interface and Signal class
      rl_strategy.py         Thompson Sampling contextual bandit strategy
    requirements.txt
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- MongoDB (running locally on default port 27017)
- Wine 9+ (optional, for live MT5 on macOS)

### Installation

```bash
# Clone the repository
git clone https://github.com/1CEs/quant-ea.git
cd quant-ea

# Install Node dependencies
npm install

# Set up Python virtual environment
cd python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..
```

### Running in Development

```bash
npm run dev
```

This starts the Electron app with hot-reload. The Python backend is spawned automatically on login.

### Building for Production

```bash
npm run build
```

---

## Usage

1. Launch the application. The login screen appears.
2. Enter MT5 credentials or use mock mode (any credentials will work in mock mode).
3. Once connected, the dashboard displays account information and live data.
4. To start automated trading, configure the strategy in the **Bot Control** card and click **Start Bot**.
5. Monitor trades in the **Trade Log** panel. Use **Pause** or **Stop** to control the bot.
6. Import historical data via the **Backtest** page to run strategy backtests.
7. Review daily performance on the **PnL Calendar** page.

---

## Features

### Dashboard
- Real-time account summary (balance, equity, margin, profit/loss)
- Live positions and pending orders tables
- Equity curve chart
- Live price chart with candlestick data

### Bot Control
- Strategy selection with configurable parameters
- Start, pause, resume, and stop with instant loading feedback
- Step-by-step initialization progress indicator
- Cancel button available during initialization

### Backtesting
- CSV data import with auto-detection of delimiter and date format
- Walk-forward strategy evaluation
- Trade-by-trade results with equity curve

### Risk Management
- Maximum daily loss limit
- Maximum drawdown threshold
- Maximum concurrent open trades
- Spread filter
- Trading hours restriction
- One-click emergency stop (close all positions)

### PnL Calendar
- Daily profit/loss tracking in a calendar view
- Aggregated performance metrics

### Data Management
- MongoDB-backed candle storage
- In-memory caching for fast repeated access
- Pre-loading of candle data at login for instant bot startup

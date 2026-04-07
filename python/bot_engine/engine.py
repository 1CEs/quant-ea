import asyncio
import logging
import threading
from typing import Optional, Callable

from strategies.base import Signal
from strategies.rl_strategy import RLStrategy

logger = logging.getLogger("quant-ea.engine")

TF_MT5 = {
    "M1": 1, "M5": 5, "M15": 15, "M30": 30,
    "H1": 16385, "H4": 16388, "D1": 16408,
    "W1": 32769, "MN1": 49153,
}

TF_SECONDS = {
    "M1": 60, "M5": 300, "M15": 900, "M30": 1800,
    "H1": 3600, "H4": 14400, "D1": 86400,
}

STRATEGY_MAP = {
    "rl_strategy": RLStrategy,
}

BOT_MAGIC = 234567
BOT_COMMENT = "QuantEA-Bot"


class BotEngine:
    def __init__(self, mt5_service, order_manager, risk_manager):
        self._mt5 = mt5_service
        self._orders = order_manager
        self._risk = risk_manager
        self._dataset_store = None
        self._status = "stopped"
        self._config: dict = {}
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._send_fn: Optional[Callable] = None
        self._log_fn: Optional[Callable] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._cached_candles: Optional[list] = None
        self._cached_candles_key: str = ""
        self._mt5_rates_failed: bool = False

    def set_dataset_store(self, store):
        self._dataset_store = store

    def get_status(self) -> str:
        return self._status

    def precache_candles(self, symbol: str, tf_str: str, count: int = 25000):
        if self._dataset_store and self._dataset_store.available:
            cache_key = f"{symbol}:{tf_str}"
            if self._cached_candles and self._cached_candles_key == cache_key:
                return
            try:
                candles = self._dataset_store.get_candles(symbol, tf_str)
                if candles and len(candles) > 0:
                    self._cached_candles = candles[-count:]
                    self._cached_candles_key = cache_key
                    logger.info(f"Pre-cached {len(self._cached_candles)} candles for {symbol} {tf_str}")
            except Exception as e:
                logger.warning(f"Pre-cache failed: {e}")

    def start(self, config: dict, send_fn: Callable, log_fn: Callable):
        if self._status in ("running", "starting"):
            return
        if self._thread and self._thread.is_alive():
            self._stop_event.set()
            self._thread.join(timeout=2)
        self._config = config
        self._send_fn = send_fn
        self._log_fn = log_fn
        self._status = "starting"
        self._stop_event.clear()

        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            self._loop = None

        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info("Bot starting")

    def pause(self):
        if self._status == "running":
            self._status = "paused"
            logger.info("Bot paused")

    def resume(self):
        if self._status == "paused":
            self._status = "running"
            logger.info("Bot resumed")

    def stop(self):
        prev = self._status
        self._status = "stopped"
        self._stop_event.set()
        self._cached_candles = None
        if prev != "stopped":
            logger.info("Bot stopped")

    def _stopped(self) -> bool:
        return self._stop_event.is_set()

    def _run_loop(self):
        config = self._config
        symbol = config.get("symbol", "XAUUSD")
        tf_str = config.get("timeframe", "M5")
        lot_size = float(config.get("lot_size", 0.01))
        strategy_name = config.get("strategy", "rl_strategy")
        params = config.get("params", {})

        tf_mt5 = TF_MT5.get(tf_str, 5)
        candle_secs = TF_SECONDS.get(tf_str, 300)

        cls = STRATEGY_MAP.get(strategy_name)
        if not cls:
            self._async_log("ERROR", symbol, f"Unknown strategy: {strategy_name}")
            self._status = "stopped"
            self._async_send("bot_status", {"status": "stopped"})
            return

        strategy = cls(params)
        candle_count = max(int(params.get("train_window", 20000)) + 5000, 25000)

        self._async_send("bot_status", {"status": "starting"})
        self._async_send("bot_progress", {"step": 1, "total": 3, "label": "Loading candle data..."})

        candles, live = self._fetch_candles(symbol, tf_str, tf_mt5, candle_count)
        if self._stopped():
            return
        if not candles or len(candles) < 500:
            self._async_log("ERROR", symbol, f"Not enough data ({len(candles) if candles else 0}). Import CSV first.")
            self._status = "stopped"
            self._async_send("bot_status", {"status": "stopped"})
            return

        if self._stopped():
            return
        self._async_send("bot_progress", {"step": 2, "total": 3, "label": f"Training on {len(candles):,} candles..."})

        try:
            strategy.init(candles)
        except Exception as e:
            self._async_log("ERROR", symbol, f"Strategy init failed: {e}")
            self._status = "stopped"
            self._async_send("bot_status", {"status": "stopped"})
            return

        if self._stopped():
            return
        self._async_send("bot_progress", {"step": 3, "total": 3, "label": "Evaluating signal..."})

        self._status = "running"
        self._async_send("bot_status", {"status": "running"})

        last_candle_time = candles[-1]["time"]
        sig = strategy.next(len(candles) - 2)
        if sig != Signal.NONE:
            self._async_log("SIGNAL", symbol, f"Initial: {sig.upper()}")
            self._process_signal(sig, strategy, symbol, lot_size)
        else:
            self._async_log("BOT", symbol, "No signal — monitoring")

        poll = max(3, min(candle_secs // 6, 10)) if live else 30

        while not self._stopped():
            if self._status == "paused":
                self._stop_event.wait(timeout=1)
                continue
            if self._status not in ("running",):
                break

            self._stop_event.wait(timeout=poll)
            if self._stopped():
                break

            new_candles, new_live = self._fetch_candles(symbol, tf_str, tf_mt5, candle_count)
            if self._stopped():
                break

            if not new_candles or len(new_candles) < 500:
                continue

            new_time = new_candles[-1]["time"]
            if new_time == last_candle_time:
                continue

            last_candle_time = new_time
            if not live and new_live:
                live = True
                poll = max(3, min(candle_secs // 6, 10))
                self._async_log("BOT", symbol, "Switched to live feed")

            try:
                strategy.init(new_candles)
                s = strategy.next(len(new_candles) - 2)
                self._process_signal(s, strategy, symbol, lot_size)
            except Exception as e:
                logger.exception(f"Strategy eval error: {e}")
                self._async_log("ERROR", symbol, f"Eval error: {e}")

        logger.info("Bot loop ended")

    def _process_signal(self, signal: str, strategy, symbol: str, lot_size: float):
        if signal == Signal.NONE:
            return

        bot_positions = self._get_bot_positions(symbol)

        for pos in bot_positions:
            if pos["type"] != signal:
                self._async_log("CLOSE", symbol,
                    f"Closing {pos['type']} #{pos['ticket']} for {signal}",
                    pos.get("profit", 0))
                self._orders.close_position(pos["ticket"])
                self._async_send("trade_closed", {
                    "ticket": pos["ticket"],
                    "symbol": symbol,
                    "profit": pos.get("profit", 0),
                })
            else:
                return

        can_trade, reason = self._risk.can_open_trade(self._mt5, symbol)
        if not can_trade:
            self._async_log("RISK", symbol, f"Blocked: {reason}")
            return

        tick = self._mt5.get_tick(symbol)
        if not tick or tick.get("bid", 0) <= 0:
            self._async_log("ERROR", symbol, "No tick data")
            return

        entry = tick["ask"] if signal == Signal.BUY else tick["bid"]
        sl = round(strategy.get_sl(signal, entry), 2)
        tp = round(strategy.get_tp(signal, entry), 2)

        self._async_log("TRADE", symbol,
            f"{signal.upper()} {lot_size} @ {entry:.2f}  SL={sl:.2f} TP={tp:.2f}")

        result = self._orders.place_order({
            "action": signal,
            "symbol": symbol,
            "volume": lot_size,
            "sl": sl,
            "tp": tp,
            "comment": BOT_COMMENT,
        })

        if result.get("success"):
            self._async_send("trade_opened", {
                "type": signal, "symbol": symbol, "volume": lot_size,
                "price": result.get("price", entry), "sl": sl, "tp": tp,
                "ticket": result.get("ticket", 0),
            })
        else:
            self._async_log("ERROR", symbol, f"Order failed: {result.get('error')}")

    def _get_bot_positions(self, symbol: str) -> list:
        positions = self._mt5.get_positions()
        return [p for p in positions
                if p.get("symbol", "").replace("m", "").replace(".a", "").upper().startswith(symbol[:3])
                and (p.get("comment", "") == BOT_COMMENT or p.get("magic") == BOT_MAGIC)]

    def _fetch_candles(self, symbol: str, tf_str: str, tf_mt5: int, count: int) -> tuple:
        if not self._mt5_rates_failed:
            try:
                rates = self._mt5.get_rates(symbol, tf_mt5, count)
                if rates is not None and len(rates) > 0:
                    candles = []
                    for r in rates:
                        candles.append({
                            "time": int(r["time"]),
                            "open": float(r["open"]),
                            "high": float(r["high"]),
                            "low": float(r["low"]),
                            "close": float(r["close"]),
                            "tick_volume": int(r["tick_volume"]),
                        })
                    return candles, True
                else:
                    self._mt5_rates_failed = True
                    logger.info("MT5 get_rates returned empty — using cache for future calls")
            except Exception as e:
                self._mt5_rates_failed = True
                logger.warning(f"MT5 get_rates failed: {e} — using cache for future calls")

        cache_key = f"{symbol}:{tf_str}"
        if self._cached_candles and self._cached_candles_key == cache_key:
            return self._cached_candles, False

        if self._dataset_store and self._dataset_store.available:
            try:
                candles = self._dataset_store.get_candles(symbol, tf_str)
                if candles and len(candles) > 0:
                    sliced = candles[-count:]
                    self._cached_candles = sliced
                    self._cached_candles_key = cache_key
                    logger.info(f"Cached {len(sliced)} MongoDB candles for {symbol} {tf_str}")
                    return sliced, False
            except Exception as e:
                logger.warning(f"MongoDB fallback failed: {e}")

        return [], False

    def _async_send(self, msg_type: str, data: dict):
        if self._send_fn and self._loop:
            asyncio.run_coroutine_threadsafe(self._send_fn(msg_type, data), self._loop)

    def _async_log(self, action: str, symbol: str, message: str, profit: float = 0):
        if self._log_fn and self._loop:
            asyncio.run_coroutine_threadsafe(
                self._log_fn(action, symbol, message, profit), self._loop
            )

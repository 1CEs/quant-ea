import asyncio
import json
import logging
import time
from typing import Optional
import websockets
from websockets.server import WebSocketServerProtocol

logger = logging.getLogger("quant-ea.server")

from mt5_service import MT5Service
from order_manager import OrderManager
from risk_manager import RiskManager
from bot_engine.engine import BotEngine
from dataset_store import DatasetStore
from csv_importer import CsvImporter
from backtester import Backtester
from strategies.rl_strategy import RLStrategy


class WebSocketServer:
    def __init__(self, port: int = 8765):
        self._port = port
        self._mt5 = MT5Service()
        self._order_manager = OrderManager(self._mt5)
        self._risk_manager = RiskManager()
        self._bot_engine = BotEngine(self._mt5, self._order_manager, self._risk_manager)
        self._dataset_store = DatasetStore()
        self._bot_engine.set_dataset_store(self._dataset_store)
        self._csv_importer = CsvImporter()
        self._client: Optional[WebSocketServerProtocol] = None
        self._running = False
        self._tick_busy = False

    async def start(self):
        self._running = True
        async with websockets.serve(self._handler, "localhost", self._port, ping_timeout=60, ping_interval=30, max_size=100 * 1024 * 1024):
            logger.info(f"WebSocket server listening on ws://localhost:{self._port}/ws")
            await asyncio.Future()

    async def _handler(self, ws: WebSocketServerProtocol):
        self._client = ws
        logger.info("Client connected")
        try:
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                    msg_type = msg.get("type", "")
                    data = msg.get("data", {})
                    await self._route(msg_type, data)
                except json.JSONDecodeError:
                    await self._send("error", {"message": "Invalid JSON"})
                except Exception as e:
                    logger.exception("Handler error")
                    await self._send("error", {"message": str(e)})
        except websockets.ConnectionClosed:
            logger.info("Client disconnected")
        finally:
            self._bot_engine.stop()
            self._client = None

    async def _route(self, msg_type: str, data: dict):
        handlers = {
            "login": self._handle_login,
            "disconnect": self._handle_disconnect,
            "get_account_info": self._handle_get_account_info,
            "get_positions": self._handle_get_positions,
            "get_pending_orders": self._handle_get_pending_orders,
            "get_symbols": self._handle_get_symbols,
            "get_bot_status": self._handle_get_bot_status,
            "place_order": self._handle_place_order,
            "modify_order": self._handle_modify_order,
            "cancel_order": self._handle_cancel_order,
            "close_position": self._handle_close_position,
            "close_all_positions": self._handle_close_all_positions,
            "start_bot": self._handle_start_bot,
            "pause_bot": self._handle_pause_bot,
            "stop_bot": self._handle_stop_bot,
            "emergency_stop": self._handle_emergency_stop,
            "update_risk_config": self._handle_update_risk_config,
            "load_dataset": self._handle_load_dataset,
            "import_csv": self._handle_import_csv,
            "get_dataset_status": self._handle_get_dataset_status,
            "get_tick": self._handle_get_tick,
            "get_chart_candles": self._handle_get_chart_candles,
            "run_backtest": self._handle_run_backtest,
        }

        handler = handlers.get(msg_type)
        if handler:
            await handler(data)
        else:
            await self._send("error", {"message": f"Unknown message type: {msg_type}"})

    async def _send(self, msg_type: str, data: dict):
        if self._client:
            await self._client.send(json.dumps({"type": msg_type, "data": data}))

    async def _send_log(self, action: str, symbol: str, message: str, profit: float = 0):
        import time
        await self._send("trade_log", {
            "id": int(time.time() * 1000),
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "action": action,
            "symbol": symbol,
            "type": "",
            "volume": 0,
            "price": 0,
            "sl": 0,
            "tp": 0,
            "profit": profit,
            "message": message,
        })

    async def _handle_login(self, data: dict):
        account = int(data.get("account", 0))
        password = data.get("password", "")
        server = data.get("server", "")

        success = self._mt5.connect(account, password, server)
        if success:
            info = self._mt5.get_account_info()
            is_demo = self._mt5.mode == "mock"
            await self._send("login_response", {
                "success": True,
                "account_info": info,
                "demo_mode": is_demo,
                "mt5_mode": self._mt5.mode,
            })
            logger.info(f"Login successful: {account}@{server} [mode={self._mt5.mode}]")
            loop = asyncio.get_event_loop()
            loop.run_in_executor(None, self._bot_engine.precache_candles, "XAUUSD", "M5", 25000)
        else:
            error = self._mt5.last_error()
            await self._send("login_response", {"success": False, "error": error})
            logger.warning(f"Login failed: {error}")

    async def _handle_disconnect(self, _data: dict):
        self._bot_engine.stop()
        self._mt5.disconnect()
        logger.info("Disconnected from MT5")

    async def _handle_get_account_info(self, _data: dict):
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, self._mt5.get_account_info)
        if info:
            await self._send("account_info", info)

    async def _handle_get_positions(self, _data: dict):
        loop = asyncio.get_event_loop()
        positions = await loop.run_in_executor(None, self._mt5.get_positions)
        await self._send("positions", {"positions": positions})

    async def _handle_get_pending_orders(self, _data: dict):
        loop = asyncio.get_event_loop()
        orders = await loop.run_in_executor(None, self._mt5.get_pending_orders)
        await self._send("pending_orders", {"orders": orders})

    async def _handle_get_symbols(self, _data: dict):
        loop = asyncio.get_event_loop()
        symbols = await loop.run_in_executor(None, self._mt5.get_symbols)
        await self._send("symbols", {"symbols": symbols})

    async def _handle_get_bot_status(self, _data: dict):
        status = self._bot_engine.get_status()
        await self._send("bot_status", {"status": status})

    async def _handle_place_order(self, data: dict):
        result = self._order_manager.place_order(data)
        if result.get("success"):
            await self._send("order_placed", result)
            await self._send_log(
                data.get("action", "ORDER").upper(),
                data.get("symbol", ""),
                f"Order placed: {data.get('action')} {data.get('volume')} {data.get('symbol')}"
            )
        else:
            await self._send("error", {"message": result.get("error", "Order failed")})

    async def _handle_modify_order(self, data: dict):
        result = self._order_manager.modify_order(data)
        if result.get("success"):
            await self._send("order_modified", result)
        else:
            await self._send("error", {"message": result.get("error", "Modify failed")})

    async def _handle_cancel_order(self, data: dict):
        ticket = data.get("ticket", 0)
        result = self._order_manager.cancel_order(ticket)
        if result.get("success"):
            await self._send("order_cancelled", result)
            await self._send_log("CANCEL", "", f"Order #{ticket} cancelled")
        else:
            await self._send("error", {"message": result.get("error", "Cancel failed")})

    async def _handle_close_position(self, data: dict):
        ticket = data.get("ticket", 0)
        volume = data.get("volume")
        result = self._order_manager.close_position(ticket, volume)
        if result.get("success"):
            await self._send("trade_closed", result)
            await self._send_log(
                "CLOSE", result.get("symbol", ""),
                f"Position #{ticket} closed",
                result.get("profit", 0)
            )
        else:
            await self._send("error", {"message": result.get("error", "Close failed")})

    async def _handle_close_all_positions(self, _data: dict):
        results = self._order_manager.close_all_positions()
        for r in results:
            if r.get("success"):
                await self._send("trade_closed", r)
        await self._send_log("CLOSE", "", f"Closed all positions ({len(results)} total)")

    async def _handle_start_bot(self, data: dict):
        risk_config = data.pop("risk_config", {})
        if risk_config:
            self._risk_manager.update_config(risk_config)

        if self._bot_engine.get_status() == "paused":
            self._bot_engine.resume()
            await self._send("bot_status", {"status": "running"})
            await self._send_log("BOT", "", "Bot resumed")
            return

        self._bot_engine.start(data, self._send, self._send_log)
        await self._send("bot_status", {"status": "starting"})

    async def _handle_pause_bot(self, _data: dict):
        self._bot_engine.pause()
        await self._send("bot_status", {"status": "paused"})
        await self._send_log("BOT", "", "Bot paused")

    async def _handle_stop_bot(self, _data: dict):
        self._bot_engine.stop()
        await self._send("bot_status", {"status": "stopped"})
        await self._send_log("BOT", "", "Bot stopped")

    async def _handle_emergency_stop(self, _data: dict):
        self._bot_engine.stop()
        results = self._order_manager.close_all_positions()
        self._order_manager.cancel_all_pending_orders()
        await self._send("bot_status", {"status": "stopped"})
        await self._send_log("EMERGENCY", "", f"Emergency stop: closed {len(results)} positions")

    async def _handle_update_risk_config(self, data: dict):
        self._risk_manager.update_config(data)
        logger.info("Risk config updated")

    async def _handle_import_csv(self, data: dict):
        file_path = data.get("file_path", "")
        timeframe_str = data.get("timeframe", "H1")
        symbol = "XAUUSD"

        if not file_path:
            await self._send("csv_imported", {"success": False, "error": "No file path provided"})
            return

        store = self._dataset_store
        if not store.available:
            await self._send("csv_imported", {"success": False, "error": "MongoDB not available"})
            return

        loop = asyncio.get_event_loop()

        try:
            await self._send("csv_progress", {"timeframe": timeframe_str, "stage": "parsing", "percent": 0})
            candles = await loop.run_in_executor(None, self._csv_importer.parse, file_path)

            if not candles:
                await self._send("csv_imported", {"success": False, "error": "CSV parsing returned no data. Check file format."})
                return

            await self._send("csv_progress", {"timeframe": timeframe_str, "stage": "storing", "percent": 50, "count": len(candles)})
            await loop.run_in_executor(None, store.store_candles, symbol, timeframe_str, candles)

            await self._send("csv_progress", {"timeframe": timeframe_str, "stage": "done", "percent": 100})
            cached_info = store.get_cached_range(symbol, timeframe_str)
            await self._send("csv_imported", {
                "success": True,
                "symbol": symbol,
                "timeframe": timeframe_str,
                "count": cached_info["count"] if cached_info else len(candles),
                "cached_range": cached_info,
            })
            await self._send_log("INFO", "data", f"Imported {len(candles)} candles for {symbol} {timeframe_str}")
            logger.info(f"CSV imported: {symbol} {timeframe_str} — {len(candles)} candles")

        except Exception as e:
            logger.exception(f"CSV import error: {e}")
            await self._send("csv_imported", {"success": False, "error": str(e)})

    async def _handle_load_dataset(self, data: dict):
        timeframe_str = data.get("timeframe", "H1")
        symbol = "XAUUSD"

        store = self._dataset_store
        if not store.available:
            await self._send("dataset_loaded", {"success": False, "error": "MongoDB not available"})
            return

        try:
            MAX_SEND = 100_000
            cached_info = store.get_cached_range(symbol, timeframe_str)
            if not cached_info or cached_info["count"] == 0:
                await self._send("dataset_loaded", {
                    "success": False,
                    "error": f"No data for {symbol} {timeframe_str}. Import a CSV first.",
                })
                return

            total_count = cached_info["count"]
            candles = store.get_candles(symbol, timeframe_str)
            send_candles = candles[-MAX_SEND:] if len(candles) > MAX_SEND else candles

            await self._send("dataset_loaded", {
                "success": True,
                "symbol": symbol,
                "timeframe": timeframe_str,
                "count": total_count,
                "candles": send_candles,
                "cached_range": cached_info,
                "mongo_available": True,
            })
            logger.info(f"Dataset loaded: {symbol} {timeframe_str} — {len(send_candles)}/{total_count} candles sent")

        except Exception as e:
            logger.exception(f"Dataset load error: {e}")
            await self._send("dataset_loaded", {"success": False, "error": str(e)})

    async def _handle_get_tick(self, _data: dict):
        if self._tick_busy:
            return
        self._tick_busy = True
        try:
            loop = asyncio.get_event_loop()
            tick = await loop.run_in_executor(None, self._mt5.get_tick, "XAUUSD")
            if tick and tick.get("bid", 0) > 0:
                await self._send("tick", {
                    "symbol": "XAUUSD",
                    "bid": tick["bid"],
                    "ask": tick["ask"],
                    "spread": round((tick["ask"] - tick["bid"]) * 100, 1),
                    "time": tick.get("time", int(time.time())),
                })
        except Exception as e:
            logger.warning(f"Tick error: {e}")
        finally:
            self._tick_busy = False

    async def _handle_get_dataset_status(self, _data: dict):
        store = self._dataset_store
        if not store.available:
            await self._send("dataset_status", {"available": False, "timeframes": {}})
            return

        tfs = ["M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1"]
        result = {}
        for tf in tfs:
            info = store.get_cached_range("XAUUSD", tf)
            if info and info["count"] > 0:
                result[tf] = {
                    "count": info["count"],
                    "start_time": info["start_time"],
                    "end_time": info["end_time"],
                }

        await self._send("dataset_status", {"available": True, "timeframes": result})

    async def _handle_get_chart_candles(self, data: dict):
        timeframe_str = data.get("timeframe", "H1")
        limit = min(data.get("limit", 500), 5000)
        symbol = "XAUUSD"

        store = self._dataset_store
        if not store.available:
            await self._send("chart_candles", {"success": False, "error": "MongoDB not available"})
            return

        try:
            loop = asyncio.get_event_loop()
            candles = await loop.run_in_executor(None, store.get_candles, symbol, timeframe_str)
            if not candles:
                await self._send("chart_candles", {"success": False, "error": f"No {timeframe_str} data. Import CSV first."})
                return

            send = candles[-limit:]
            await self._send("chart_candles", {
                "success": True,
                "timeframe": timeframe_str,
                "candles": send,
                "total": len(candles),
            })
        except Exception as e:
            logger.exception(f"Chart candles error: {e}")
            await self._send("chart_candles", {"success": False, "error": str(e)})

    async def _handle_run_backtest(self, data: dict):
        tf = data.get("timeframe", "H1")
        params = data.get("params", {})
        balance = data.get("balance", 10000.0)
        lot_size = data.get("lot_size", 0.1)
        spread = data.get("spread", 0.30)

        store = self._dataset_store
        if not store.available:
            await self._send("backtest_result", {"success": False, "error": "MongoDB not available"})
            return

        try:
            await self._send("backtest_progress", {"status": "loading"})
            loop = asyncio.get_event_loop()
            candles = await loop.run_in_executor(None, store.get_candles, "XAUUSD", tf)
            if not candles or len(candles) < 50:
                await self._send("backtest_result", {"success": False, "error": f"Not enough {tf} candles. Import CSV first."})
                return

            await self._send("backtest_progress", {"status": "running", "candles": len(candles)})

            strategy_map = {
                "rl_strategy": RLStrategy,
            }
            strategy_name = data.get("strategy", "rl_strategy")
            cls = strategy_map.get(strategy_name)
            if not cls:
                await self._send("backtest_result", {"success": False, "error": f"Unknown strategy: {strategy_name}"})
                return
            strategy = cls(params)

            bt = Backtester(strategy, candles, initial_balance=balance, lot_size=lot_size, spread=spread)
            result = await loop.run_in_executor(None, bt.run)

            await self._send("backtest_result", {
                "success": True,
                "timeframe": tf,
                "strategy": strategy_name,
                **result.to_dict(),
            })
        except Exception as e:
            logger.exception(f"Backtest error: {e}")
            await self._send("backtest_result", {"success": False, "error": str(e)})

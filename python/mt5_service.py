import logging
import platform
import shutil
from typing import Optional
from datetime import datetime

logger = logging.getLogger("quant-ea.mt5")

MT5_MODE = "mock"

try:
    import MetaTrader5 as mt5
    MT5_MODE = "native"
    logger.info("Native MetaTrader5 detected (Windows)")
except ImportError:
    mt5 = None
    if platform.system() == "Darwin" and shutil.which("wine"):
        MT5_MODE = "wine"
        logger.info("Wine detected — using Wine bridge for MT5")
    else:
        MT5_MODE = "mock"
        logger.info("MetaTrader5 not available, Wine not found — running in DEMO mode")


class MT5Service:
    def __init__(self):
        self._connected = False
        self._account = 0
        self._password = ""
        self._server = ""
        self._bridge = None
        self._last_error = ""
        self._symbol_map = {}

        if MT5_MODE == "wine":
            from wine_bridge import WineBridge
            self._bridge = WineBridge()

    @property
    def mode(self) -> str:
        return MT5_MODE

    def connect(self, account: int, password: str, server: str) -> bool:
        if MT5_MODE == "native":
            return self._connect_native(account, password, server)
        elif MT5_MODE == "wine":
            return self._connect_wine(account, password, server)
        else:
            self._last_error = "MetaTrader5 not available. Install Wine or run on Windows."
            logger.error(self._last_error)
            return False

    def _connect_native(self, account: int, password: str, server: str) -> bool:
        if not mt5.initialize():
            self._last_error = f"MT5 initialize failed: {mt5.last_error()}"
            logger.error(self._last_error)
            return False
        authorized = mt5.login(account, password=password, server=server)
        if not authorized:
            self._last_error = f"MT5 login failed: {mt5.last_error()}"
            logger.error(self._last_error)
            mt5.shutdown()
            return False
        self._connected = True
        self._account = account
        self._server = server
        logger.info(f"Connected to MT5 (native): {account}@{server}")
        return True

    def _connect_wine(self, account: int, password: str, server: str) -> bool:
        result = self._bridge.connect(account, password, server)
        if result.get("error"):
            self._last_error = result["error"]
            logger.error(f"Wine bridge connect failed: {self._last_error}")
            return False
        if not result.get("success"):
            self._last_error = result.get("error", "Unknown Wine bridge error")
            logger.error(f"Wine bridge connect failed: {self._last_error}")
            return False
        self._connected = True
        self._account = account
        self._password = password
        self._server = server
        self._bridge.set_credentials(account, password, server)
        logger.info(f"Connected to MT5 (Wine): {account}@{server}")
        return True

    def disconnect(self):
        if MT5_MODE == "native" and mt5 is not None and self._connected:
            mt5.shutdown()
        elif MT5_MODE == "wine" and self._bridge:
            self._bridge.disconnect()
        self._connected = False
        logger.info("Disconnected from MT5")

    def is_connected(self) -> bool:
        return self._connected

    def last_error(self) -> str:
        if self._last_error:
            return self._last_error
        if MT5_MODE == "native" and mt5:
            err = mt5.last_error()
            return f"Error {err[0]}: {err[1]}" if err else "Unknown error"
        return "Not connected"

    def get_account_info(self) -> Optional[dict]:
        if not self._connected:
            return None
        if MT5_MODE == "native":
            return self._get_account_info_native()
        elif MT5_MODE == "wine":
            return self._get_account_info_wine()
        return None

    def _get_account_info_native(self) -> Optional[dict]:
        info = mt5.account_info()
        if info is None:
            return None
        return {
            "balance": info.balance,
            "equity": info.equity,
            "margin": info.margin,
            "free_margin": info.margin_free,
            "profit": info.profit,
            "currency": info.currency,
            "leverage": info.leverage,
            "name": info.name,
            "server": info.server,
            "login": info.login,
        }

    def _get_account_info_wine(self) -> Optional[dict]:
        result = self._bridge.account_info()
        if result.get("error"):
            return None
        return {
            "balance": result.get("balance", 0),
            "equity": result.get("equity", 0),
            "margin": result.get("margin", 0),
            "free_margin": result.get("free_margin", 0),
            "profit": result.get("profit", 0),
            "currency": result.get("currency", "USD"),
            "leverage": result.get("leverage", 0),
            "name": result.get("name", ""),
            "server": result.get("server", ""),
            "login": result.get("login", 0),
        }

    def get_positions(self) -> list:
        if not self._connected:
            return []
        if MT5_MODE == "native":
            return self._get_positions_native()
        elif MT5_MODE == "wine":
            return self._get_positions_wine()
        return []

    def _get_positions_native(self) -> list:
        positions = mt5.positions_get()
        if positions is None:
            return []
        result = []
        for pos in positions:
            result.append({
                "ticket": pos.ticket,
                "symbol": pos.symbol,
                "type": "buy" if pos.type == 0 else "sell",
                "volume": pos.volume,
                "open_price": pos.price_open,
                "current_price": pos.price_current,
                "sl": pos.sl,
                "tp": pos.tp,
                "profit": pos.profit,
                "open_time": datetime.fromtimestamp(pos.time).isoformat(),
                "magic": pos.magic,
                "comment": pos.comment,
            })
        return result

    def _get_positions_wine(self) -> list:
        result = self._bridge.positions_get()
        if result.get("error"):
            return []
        data = result.get("data", [])
        positions = []
        for p in data:
            positions.append({
                "ticket": p["ticket"],
                "symbol": p["symbol"],
                "type": "buy" if p["type"] == 0 else "sell",
                "volume": p["volume"],
                "open_price": p["price_open"],
                "current_price": p["price_current"],
                "sl": p["sl"],
                "tp": p["tp"],
                "profit": p["profit"],
                "open_time": datetime.fromtimestamp(p["time"]).isoformat() if isinstance(p.get("time"), (int, float)) else str(p.get("time", "")),
                "magic": p.get("magic", 0),
                "comment": p.get("comment", ""),
            })
        return positions

    def get_pending_orders(self) -> list:
        if not self._connected:
            return []
        if MT5_MODE == "native":
            return self._get_pending_orders_native()
        elif MT5_MODE == "wine":
            return self._get_pending_orders_wine()
        return []

    def _get_pending_orders_native(self) -> list:
        orders = mt5.orders_get()
        if orders is None:
            return []
        type_map = {2: "buy_limit", 3: "sell_limit", 4: "buy_stop", 5: "sell_stop"}
        result = []
        for order in orders:
            result.append({
                "ticket": order.ticket,
                "symbol": order.symbol,
                "type": type_map.get(order.type, "unknown"),
                "volume": order.volume_current,
                "price": order.price_open,
                "sl": order.sl,
                "tp": order.tp,
                "open_time": datetime.fromtimestamp(order.time_setup).isoformat(),
                "comment": order.comment,
            })
        return result

    def _get_pending_orders_wine(self) -> list:
        result = self._bridge.orders_get()
        if result.get("error"):
            return []
        data = result.get("data", [])
        type_map = {2: "buy_limit", 3: "sell_limit", 4: "buy_stop", 5: "sell_stop"}
        orders = []
        for o in data:
            orders.append({
                "ticket": o["ticket"],
                "symbol": o["symbol"],
                "type": type_map.get(o["type"], "unknown"),
                "volume": o.get("volume_current", 0),
                "price": o.get("price_open", 0),
                "sl": o.get("sl", 0),
                "tp": o.get("tp", 0),
                "open_time": datetime.fromtimestamp(o["time_setup"]).isoformat() if isinstance(o.get("time_setup"), (int, float)) else str(o.get("time_setup", "")),
                "comment": o.get("comment", ""),
            })
        return orders

    def get_symbols(self) -> list:
        if not self._connected:
            return []
        if MT5_MODE == "native":
            return self._get_symbols_native()
        elif MT5_MODE == "wine":
            return self._get_symbols_wine()
        return []

    def _get_symbols_native(self) -> list:
        symbols = mt5.symbols_get()
        if symbols is None:
            return []
        result = []
        for sym in symbols:
            if not sym.visible:
                continue
            tick = mt5.symbol_info_tick(sym.name)
            result.append({
                "name": sym.name,
                "description": sym.description,
                "spread": sym.spread,
                "digits": sym.digits,
                "point": sym.point,
                "bid": tick.bid if tick else 0,
                "ask": tick.ask if tick else 0,
                "volume_min": sym.volume_min,
                "volume_max": sym.volume_max,
                "volume_step": sym.volume_step,
            })
        return result

    def _get_symbols_wine(self) -> list:
        result = self._bridge.symbols_get()
        if result.get("error"):
            return []
        return result.get("data", [])

    def get_tick(self, symbol: str) -> Optional[dict]:
        if not self._connected:
            return None
        resolved = self._symbol_map.get(symbol)
        if resolved:
            return self._fetch_tick(resolved)
        variants = [symbol, symbol + "m", symbol + ".a", symbol + ".raw"]
        for sym in variants:
            result = self._fetch_tick(sym)
            if result:
                self._symbol_map[symbol] = sym
                logger.info(f"Resolved {symbol} → {sym}")
                return result
        return None

    def _fetch_tick(self, symbol: str) -> Optional[dict]:
        if MT5_MODE == "native":
            tick = mt5.symbol_info_tick(symbol)
            if tick and tick.bid > 0:
                return {"bid": tick.bid, "ask": tick.ask, "last": tick.last, "time": tick.time}
        elif MT5_MODE == "wine":
            result = self._bridge.symbol_info_tick(symbol)
            if not result.get("error") and result.get("bid", 0) > 0:
                return result
        return None

    def get_symbol_info(self, symbol: str) -> Optional[dict]:
        if not self._connected:
            return None
        if MT5_MODE == "native":
            return self._get_symbol_info_native(symbol)
        elif MT5_MODE == "wine":
            return self._get_symbol_info_wine(symbol)
        return None

    def _get_symbol_info_native(self, symbol: str) -> Optional[dict]:
        info = mt5.symbol_info(symbol)
        if info is None:
            return None
        tick = mt5.symbol_info_tick(symbol)
        return {
            "name": info.name,
            "digits": info.digits,
            "point": info.point,
            "spread": info.spread,
            "bid": tick.bid if tick else 0,
            "ask": tick.ask if tick else 0,
            "volume_min": info.volume_min,
            "volume_max": info.volume_max,
            "volume_step": info.volume_step,
        }

    def _get_symbol_info_wine(self, symbol: str) -> Optional[dict]:
        result = self._bridge.symbol_info(symbol)
        if result.get("error"):
            return None
        return result

    def get_rates(self, symbol: str, timeframe: int, count: int = 100):
        if not self._connected:
            logger.warning("get_rates called but not connected")
            return None
        if MT5_MODE == "native":
            return mt5.copy_rates_from_pos(symbol, timeframe, 0, count)
        elif MT5_MODE == "wine":
            logger.info(f"Wine fetch: {symbol} tf={timeframe} count={count}")
            result = self._bridge.get_rates(symbol, timeframe, count)
            if result.get("error"):
                logger.error(f"Wine get_rates error: {result['error']}")
                return None
            import numpy as np
            data = result.get("data", [])
            if not data:
                mt5_err = result.get("mt5_error", "unknown")
                diag = result.get("diag", {})
                logger.warning(f"Wine get_rates empty for {symbol} tf={timeframe}: {mt5_err} | diag={diag}")
                return None
            dtype = np.dtype([
                ('time', 'i8'), ('open', 'f8'), ('high', 'f8'), ('low', 'f8'),
                ('close', 'f8'), ('tick_volume', 'i8'), ('spread', 'i4'), ('real_volume', 'i8')
            ])
            records = [(r['time'], r['open'], r['high'], r['low'], r['close'], r['tick_volume'], r['spread'], r['real_volume']) for r in data]
            return np.array(records, dtype=dtype)
        return None

    def send_order(self, request: dict) -> dict:
        if not self._connected:
            return {"success": False, "error": "Not connected"}
        if MT5_MODE == "native":
            return self._send_order_native(request)
        elif MT5_MODE == "wine":
            return self._send_order_wine(request)
        return {"success": False, "error": "No MT5 backend available"}

    def _send_order_native(self, request: dict) -> dict:
        result = mt5.order_send(request)
        if result is None:
            return {"success": False, "error": self.last_error()}
        if result.retcode != mt5.TRADE_RETCODE_DONE:
            return {"success": False, "error": f"Order failed: {result.comment} (code: {result.retcode})"}
        return {
            "success": True,
            "ticket": result.order,
            "volume": result.volume,
            "price": result.price,
        }

    def _send_order_wine(self, request: dict) -> dict:
        result = self._bridge.order_send(request)
        if result.get("error"):
            return {"success": False, "error": result["error"]}
        retcode = result.get("retcode", -1)
        if retcode != 10009:
            return {"success": False, "error": f"Order failed: {result.get('comment', '')} (code: {retcode})"}
        return {
            "success": True,
            "ticket": result.get("order", 0),
            "volume": result.get("volume", 0),
            "price": result.get("price", 0),
        }

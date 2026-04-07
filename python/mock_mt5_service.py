import logging
import random
import time
from typing import Optional
from datetime import datetime, timedelta

logger = logging.getLogger("quant-ea.mock-mt5")


class MockMT5Service:
    def __init__(self):
        self._connected = False
        self._account = 0
        self._server = ""
        self._balance = 10000.0
        self._equity = 10000.0
        self._positions = []
        self._pending_orders = []
        self._ticket_counter = 100000
        self._symbols_data = {
            "EURUSD": {"bid": 1.08450, "ask": 1.08465, "spread": 15, "digits": 5, "point": 0.00001, "description": "Euro vs US Dollar"},
            "GBPUSD": {"bid": 1.26320, "ask": 1.26340, "spread": 20, "digits": 5, "point": 0.00001, "description": "British Pound vs US Dollar"},
            "USDJPY": {"bid": 149.850, "ask": 149.870, "spread": 20, "digits": 3, "point": 0.001, "description": "US Dollar vs Japanese Yen"},
            "XAUUSD": {"bid": 2345.50, "ask": 2346.00, "spread": 50, "digits": 2, "point": 0.01, "description": "Gold vs US Dollar"},
            "BTCUSD": {"bid": 69420.00, "ask": 69450.00, "spread": 300, "digits": 2, "point": 0.01, "description": "Bitcoin vs US Dollar"},
            "GBPJPY": {"bid": 189.320, "ask": 189.350, "spread": 30, "digits": 3, "point": 0.001, "description": "British Pound vs Japanese Yen"},
            "AUDUSD": {"bid": 0.65120, "ask": 0.65135, "spread": 15, "digits": 5, "point": 0.00001, "description": "Australian Dollar vs US Dollar"},
            "NZDUSD": {"bid": 0.59780, "ask": 0.59800, "spread": 20, "digits": 5, "point": 0.00001, "description": "New Zealand Dollar vs US Dollar"},
        }

    def connect(self, account: int, password: str, server: str) -> bool:
        self._account = account
        self._server = server
        self._connected = True
        self._balance = 10000.0
        self._equity = 10000.0
        logger.info(f"[MOCK] Connected: {account}@{server}")
        return True

    def disconnect(self):
        self._connected = False
        self._positions.clear()
        self._pending_orders.clear()
        logger.info("[MOCK] Disconnected")

    def is_connected(self) -> bool:
        return self._connected

    def last_error(self) -> str:
        return "No error (mock)"

    def get_account_info(self) -> Optional[dict]:
        if not self._connected:
            return None
        self._simulate_price_movement()
        total_profit = sum(p["profit"] for p in self._positions)
        margin = sum(p["volume"] * 1000 for p in self._positions)
        self._equity = self._balance + total_profit
        return {
            "balance": round(self._balance, 2),
            "equity": round(self._equity, 2),
            "margin": round(margin, 2),
            "free_margin": round(self._equity - margin, 2),
            "profit": round(total_profit, 2),
            "currency": "USD",
            "leverage": 100,
            "name": "Demo Account",
            "server": self._server,
            "login": self._account,
        }

    def get_positions(self) -> list:
        if not self._connected:
            return []
        self._simulate_price_movement()
        return [dict(p) for p in self._positions]

    def get_pending_orders(self) -> list:
        if not self._connected:
            return []
        return [dict(o) for o in self._pending_orders]

    def get_symbols(self) -> list:
        if not self._connected:
            return []
        result = []
        for name, data in self._symbols_data.items():
            result.append({
                "name": name,
                "description": data["description"],
                "spread": data["spread"],
                "digits": data["digits"],
                "point": data["point"],
                "bid": data["bid"],
                "ask": data["ask"],
                "volume_min": 0.01,
                "volume_max": 100.0,
                "volume_step": 0.01,
            })
        return result

    def get_symbol_info(self, symbol: str) -> Optional[dict]:
        if not self._connected:
            return None
        data = self._symbols_data.get(symbol)
        if not data:
            return None
        return {
            "name": symbol,
            "digits": data["digits"],
            "point": data["point"],
            "spread": data["spread"],
            "bid": data["bid"],
            "ask": data["ask"],
            "volume_min": 0.01,
            "volume_max": 100.0,
            "volume_step": 0.01,
        }

    def get_rates(self, symbol: str, timeframe: int, count: int = 100):
        import numpy as np
        data = self._symbols_data.get(symbol)
        if not data:
            return None

        base_price = data["bid"]
        now = time.time()
        interval = max(timeframe * 60, 60)

        records = []
        price = base_price * 0.998
        for i in range(count):
            t = int(now - (count - i) * interval)
            change = random.gauss(0, base_price * 0.0003)
            price += change
            high = price + abs(random.gauss(0, base_price * 0.0002))
            low = price - abs(random.gauss(0, base_price * 0.0002))
            open_p = price + random.gauss(0, base_price * 0.0001)
            close_p = price
            vol = random.randint(50, 500)
            records.append((t, open_p, high, low, close_p, vol, 0, vol))

        dtype = np.dtype([
            ('time', 'i8'), ('open', 'f8'), ('high', 'f8'), ('low', 'f8'),
            ('close', 'f8'), ('tick_volume', 'i8'), ('spread', 'i4'), ('real_volume', 'i8')
        ])
        return np.array(records, dtype=dtype)

    def send_order(self, request: dict) -> dict:
        if not self._connected:
            return {"success": False, "error": "Not connected (mock)"}

        action = request.get("action")
        symbol = request.get("symbol", "")
        volume = request.get("volume", 0.01)
        price = request.get("price", 0)
        sl = request.get("sl", 0)
        tp = request.get("tp", 0)
        order_type = request.get("type", 0)
        position_ticket = request.get("position")
        order_ticket = request.get("order")
        comment = request.get("comment", "")

        if action == 1:
            if position_ticket:
                return self._close_position_by_ticket(position_ticket, volume, price)
            return self._open_position(symbol, order_type, volume, price, sl, tp, comment)

        if action == 5:
            self._ticket_counter += 1
            self._pending_orders.append({
                "ticket": self._ticket_counter,
                "symbol": symbol,
                "type": self._order_type_str(order_type),
                "volume": volume,
                "price": price,
                "sl": sl,
                "tp": tp,
                "open_time": datetime.utcnow().isoformat(),
                "comment": comment,
            })
            return {"success": True, "ticket": self._ticket_counter, "volume": volume, "price": price}

        if action == 3:
            return self._modify_position(request)

        if action == 4:
            return self._modify_pending_order(request)

        if action == 6:
            if order_ticket:
                self._pending_orders = [o for o in self._pending_orders if o["ticket"] != order_ticket]
                return {"success": True}
            return {"success": False, "error": "Order not found"}

        return {"success": False, "error": f"Unknown action: {action}"}

    def _open_position(self, symbol, order_type, volume, price, sl, tp, comment):
        self._ticket_counter += 1
        pos_type = "buy" if order_type in (0,) else "sell"
        self._positions.append({
            "ticket": self._ticket_counter,
            "symbol": symbol,
            "type": pos_type,
            "volume": volume,
            "open_price": price,
            "current_price": price,
            "sl": sl,
            "tp": tp,
            "profit": 0.0,
            "open_time": datetime.utcnow().isoformat(),
            "magic": 123456,
            "comment": comment,
        })
        return {"success": True, "ticket": self._ticket_counter, "volume": volume, "price": price}

    def _close_position_by_ticket(self, ticket, volume, price):
        for i, pos in enumerate(self._positions):
            if pos["ticket"] == ticket:
                profit = pos["profit"]
                self._balance += profit
                self._positions.pop(i)
                return {"success": True, "ticket": ticket, "volume": volume, "price": price, "symbol": pos["symbol"], "profit": profit}
        return {"success": False, "error": f"Position #{ticket} not found"}

    def _modify_position(self, request):
        ticket = request.get("position")
        for pos in self._positions:
            if pos["ticket"] == ticket:
                if "sl" in request:
                    pos["sl"] = request["sl"]
                if "tp" in request:
                    pos["tp"] = request["tp"]
                return {"success": True}
        return {"success": False, "error": "Position not found"}

    def _modify_pending_order(self, request):
        ticket = request.get("order")
        for order in self._pending_orders:
            if order["ticket"] == ticket:
                if "sl" in request:
                    order["sl"] = request["sl"]
                if "tp" in request:
                    order["tp"] = request["tp"]
                if "price" in request:
                    order["price"] = request["price"]
                return {"success": True}
        return {"success": False, "error": "Order not found"}

    def _simulate_price_movement(self):
        for name, data in self._symbols_data.items():
            move = random.gauss(0, data["point"] * 5)
            data["bid"] = round(data["bid"] + move, data["digits"])
            data["ask"] = round(data["bid"] + data["spread"] * data["point"], data["digits"])

        for pos in self._positions:
            sym = self._symbols_data.get(pos["symbol"])
            if not sym:
                continue
            pos["current_price"] = sym["bid"] if pos["type"] == "buy" else sym["ask"]
            if pos["type"] == "buy":
                diff = pos["current_price"] - pos["open_price"]
            else:
                diff = pos["open_price"] - pos["current_price"]
            pip_value = 10.0 if "JPY" in pos["symbol"] else 100000.0
            pos["profit"] = round(diff * pos["volume"] * pip_value, 2)

    @staticmethod
    def _order_type_str(order_type) -> str:
        mapping = {0: "buy", 1: "sell", 2: "buy_limit", 3: "sell_limit", 4: "buy_stop", 5: "sell_stop"}
        return mapping.get(order_type, "unknown")

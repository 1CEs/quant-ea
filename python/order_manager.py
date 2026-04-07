import logging
from typing import Optional

logger = logging.getLogger("quant-ea.orders")

ORDER_TYPE_BUY = 0
ORDER_TYPE_SELL = 1
ORDER_TYPE_BUY_LIMIT = 2
ORDER_TYPE_SELL_LIMIT = 3
ORDER_TYPE_BUY_STOP = 4
ORDER_TYPE_SELL_STOP = 5

TRADE_ACTION_DEAL = 1
TRADE_ACTION_SLTP = 3
TRADE_ACTION_MODIFY = 4
TRADE_ACTION_PENDING = 5
TRADE_ACTION_REMOVE = 6


class OrderManager:
    def __init__(self, mt5_service):
        self._mt5 = mt5_service

    def place_order(self, data: dict) -> dict:
        action = data.get("action", "")
        symbol = data.get("symbol", "")
        volume = float(data.get("volume", 0.01))
        price = data.get("price")
        sl = data.get("sl", 0.0)
        tp = data.get("tp", 0.0)
        comment = data.get("comment", "QuantEA")

        sym_info = self._mt5.get_symbol_info(symbol)
        if not sym_info:
            return {"success": False, "error": f"Symbol {symbol} not found"}

        action_map = {
            "buy": ORDER_TYPE_BUY,
            "sell": ORDER_TYPE_SELL,
            "buy_limit": ORDER_TYPE_BUY_LIMIT,
            "sell_limit": ORDER_TYPE_SELL_LIMIT,
            "buy_stop": ORDER_TYPE_BUY_STOP,
            "sell_stop": ORDER_TYPE_SELL_STOP,
        }

        order_type = action_map.get(action)
        if order_type is None:
            return {"success": False, "error": f"Invalid action: {action}"}

        request = {
            "action": TRADE_ACTION_DEAL if action in ("buy", "sell") else TRADE_ACTION_PENDING,
            "symbol": symbol,
            "volume": volume,
            "type": order_type,
            "sl": float(sl),
            "tp": float(tp),
            "comment": comment,
            "magic": 123456,
        }

        if action in ("buy", "sell"):
            request["price"] = sym_info["ask"] if action == "buy" else sym_info["bid"]
            request["deviation"] = 20
        else:
            request["price"] = float(price) if price else 0.0

        result = self._mt5.send_order(request)
        if result.get("success"):
            result["symbol"] = symbol
            result["type"] = action
        return result

    def modify_order(self, data: dict) -> dict:
        ticket = int(data.get("ticket", 0))
        sl = data.get("sl")
        tp = data.get("tp")
        price = data.get("price")

        positions = self._mt5.get_positions()
        position = next((p for p in positions if p["ticket"] == ticket), None)

        if position:
            request = {
                "action": TRADE_ACTION_SLTP,
                "symbol": position["symbol"],
                "position": ticket,
                "sl": float(sl) if sl is not None else position["sl"],
                "tp": float(tp) if tp is not None else position["tp"],
            }
        else:
            orders = self._mt5.get_pending_orders()
            order = next((o for o in orders if o["ticket"] == ticket), None)
            if not order:
                return {"success": False, "error": f"Order/Position #{ticket} not found"}
            request = {
                "action": TRADE_ACTION_MODIFY,
                "order": ticket,
                "sl": float(sl) if sl is not None else order["sl"],
                "tp": float(tp) if tp is not None else order["tp"],
                "price": float(price) if price is not None else order["price"],
            }

        return self._mt5.send_order(request)

    def cancel_order(self, ticket: int) -> dict:
        request = {
            "action": TRADE_ACTION_REMOVE,
            "order": ticket,
        }
        return self._mt5.send_order(request)

    def close_position(self, ticket: int, volume: Optional[float] = None) -> dict:
        positions = self._mt5.get_positions()
        pos = next((p for p in positions if p["ticket"] == ticket), None)
        if not pos:
            return {"success": False, "error": f"Position #{ticket} not found"}

        close_volume = volume if volume else pos["volume"]
        close_type = ORDER_TYPE_SELL if pos["type"] == "buy" else ORDER_TYPE_BUY

        sym_info = self._mt5.get_symbol_info(pos["symbol"])
        close_price = sym_info["bid"] if pos["type"] == "buy" else sym_info["ask"] if sym_info else 0

        request = {
            "action": TRADE_ACTION_DEAL,
            "symbol": pos["symbol"],
            "volume": close_volume,
            "type": close_type,
            "position": ticket,
            "price": close_price,
            "deviation": 20,
            "magic": 123456,
            "comment": "QuantEA close",
        }

        result = self._mt5.send_order(request)
        if result.get("success"):
            result["symbol"] = pos["symbol"]
            result["profit"] = pos["profit"]
        return result

    def close_all_positions(self) -> list:
        positions = self._mt5.get_positions()
        results = []
        for pos in positions:
            result = self.close_position(pos["ticket"])
            results.append(result)
        return results

    def cancel_all_pending_orders(self) -> list:
        orders = self._mt5.get_pending_orders()
        results = []
        for order in orders:
            result = self.cancel_order(order["ticket"])
            results.append(result)
        return results

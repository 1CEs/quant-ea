import sys
import json
import time
from datetime import datetime, timedelta


def main():
    import MetaTrader5 as mt5

    raw = sys.stdin.read()
    request = json.loads(raw)
    command = request.get("command")
    params = request.get("params", {})

    if command == "connect":
        result = cmd_connect(mt5, params)
        print(json.dumps(result, default=str))
        return

    if command == "disconnect":
        print(json.dumps({"success": True}))
        return

    init_kwargs = {}
    mt5_path = params.get("_mt5_path", "")
    if mt5_path:
        init_kwargs["path"] = mt5_path
    if not mt5.initialize(**init_kwargs):
        print(json.dumps({"error": f"MT5 init failed: {mt5.last_error()}"}))
        return

    creds = params.get("_credentials")
    if creds:
        login = int(creds["login"])
        password = str(creds["password"])
        server = str(creds["server"])
        if not mt5.login(login, password=password, server=server):
            print(json.dumps({"error": f"MT5 re-login failed: {mt5.last_error()}"}))
            mt5.shutdown()
            return
        time.sleep(1)

    try:
        result = dispatch(mt5, command, params)
        print(json.dumps(result, default=str))
    finally:
        mt5.shutdown()


def dispatch(mt5, command, params):
    handlers = {
        "connect": lambda: cmd_connect(mt5, params),
        "disconnect": lambda: cmd_disconnect(mt5),
        "account_info": lambda: cmd_account_info(mt5),
        "symbol_info": lambda: cmd_symbol_info(mt5, params),
        "symbol_info_tick": lambda: cmd_symbol_info_tick(mt5, params),
        "get_rates": lambda: cmd_get_rates(mt5, params),
        "positions_get": lambda: cmd_positions_get(mt5, params),
        "orders_get": lambda: cmd_orders_get(mt5),
        "history_deals_get": lambda: cmd_history_deals_get(mt5, params),
        "order_send": lambda: cmd_order_send(mt5, params),
        "symbols_get": lambda: cmd_symbols_get(mt5, params),
    }
    handler = handlers.get(command)
    if handler:
        return handler()
    return {"error": f"Unknown command: {command}"}


def cmd_connect(mt5, params):
    path = params.get("path", "")
    init_kwargs = {}
    if path:
        init_kwargs["path"] = path
    if not mt5.initialize(**init_kwargs):
        return {"success": False, "error": str(mt5.last_error())}
    login = params.get("login", 0)
    password = params.get("password", "")
    server = params.get("server", "")
    if login:
        authorized = mt5.login(login=int(login), password=password, server=server)
        if not authorized:
            err = str(mt5.last_error())
            mt5.shutdown()
            return {"success": False, "error": err}
    return {"success": True}


def cmd_disconnect(mt5):
    mt5.shutdown()
    return {"success": True}


def cmd_account_info(mt5):
    info = mt5.account_info()
    if info is None:
        return {"error": str(mt5.last_error())}
    return {
        "login": info.login,
        "balance": info.balance,
        "equity": info.equity,
        "margin": info.margin,
        "free_margin": info.margin_free,
        "profit": info.profit,
        "leverage": info.leverage,
        "currency": info.currency,
        "server": info.server,
        "name": info.name,
    }


def cmd_symbol_info(mt5, params):
    symbol = params.get("symbol", "EURUSD")
    info = mt5.symbol_info(symbol)
    if info is None:
        return {"error": str(mt5.last_error())}
    tick = mt5.symbol_info_tick(symbol)
    return {
        "name": info.name,
        "description": info.description,
        "bid": tick.bid if tick else 0,
        "ask": tick.ask if tick else 0,
        "spread": info.spread,
        "digits": info.digits,
        "point": info.point,
        "volume_min": info.volume_min,
        "volume_max": info.volume_max,
        "volume_step": info.volume_step,
    }


def cmd_symbol_info_tick(mt5, params):
    symbol = params.get("symbol", "EURUSD")
    mt5.symbol_select(symbol, True)
    tick = mt5.symbol_info_tick(symbol)
    if tick is None:
        return {"error": str(mt5.last_error())}
    return {"bid": tick.bid, "ask": tick.ask, "last": tick.last, "time": tick.time}


def cmd_get_rates(mt5, params):
    symbol = params.get("symbol", "EURUSD")
    timeframe = params.get("timeframe", 16385)
    count = params.get("count", 100)

    info = mt5.account_info()
    terminal = mt5.terminal_info()
    diag = {
        "account": info.login if info else None,
        "terminal_connected": terminal.connected if terminal else False,
    }

    mt5.symbol_select(symbol, True)
    time.sleep(0.5)

    rates = mt5.copy_rates_from_pos(symbol, timeframe, 0, count)
    if rates is None or len(rates) == 0:
        utc_from = datetime.utcnow() - timedelta(days=30)
        rates = mt5.copy_rates_from(symbol, timeframe, utc_from, count)

    if rates is None or len(rates) == 0:
        err = mt5.last_error()
        return {"data": [], "mt5_error": str(err) if err else "no rates returned", "diag": diag}
    result = []
    for r in rates:
        result.append({
            "time": int(r[0]),
            "open": float(r[1]),
            "high": float(r[2]),
            "low": float(r[3]),
            "close": float(r[4]),
            "tick_volume": int(r[5]),
            "spread": int(r[6]),
            "real_volume": int(r[7]),
        })
    return {"data": result}


def cmd_positions_get(mt5, params):
    symbol = params.get("symbol")
    ticket = params.get("ticket")
    if ticket:
        positions = mt5.positions_get(ticket=int(ticket))
    elif symbol:
        positions = mt5.positions_get(symbol=symbol)
    else:
        positions = mt5.positions_get()
    if positions is None:
        return {"data": []}
    result = []
    for p in positions:
        result.append({
            "ticket": p.ticket,
            "symbol": p.symbol,
            "type": p.type,
            "volume": p.volume,
            "price_open": p.price_open,
            "price_current": p.price_current,
            "sl": p.sl,
            "tp": p.tp,
            "profit": p.profit,
            "swap": p.swap,
            "time": p.time,
            "magic": p.magic,
            "comment": p.comment,
        })
    return {"data": result}


def cmd_orders_get(mt5):
    orders = mt5.orders_get()
    if orders is None:
        return {"data": []}
    result = []
    for o in orders:
        result.append({
            "ticket": o.ticket,
            "symbol": o.symbol,
            "type": o.type,
            "volume_current": o.volume_current,
            "price_open": o.price_open,
            "sl": o.sl,
            "tp": o.tp,
            "time_setup": o.time_setup,
            "comment": o.comment,
        })
    return {"data": result}


def cmd_history_deals_get(mt5, params):
    days = params.get("days", 30)
    date_from = datetime.now() - timedelta(days=days)
    date_to = datetime.now()
    deals = mt5.history_deals_get(date_from, date_to)
    if deals is None:
        return {"data": []}
    result = []
    for d in deals:
        result.append({
            "ticket": d.ticket,
            "order": d.order,
            "symbol": d.symbol,
            "type": d.type,
            "volume": d.volume,
            "price": d.price,
            "profit": d.profit,
            "swap": d.swap,
            "commission": d.commission,
            "time": d.time,
            "comment": d.comment,
        })
    return {"data": result}


def cmd_order_send(mt5, params):
    request = params.get("request", {})
    result = mt5.order_send(request)
    if result is None:
        return {"error": str(mt5.last_error())}
    return {
        "retcode": result.retcode,
        "order": result.order,
        "price": result.price,
        "volume": result.volume,
        "comment": result.comment,
    }


def cmd_symbols_get(mt5, params):
    group = params.get("group", "")
    if group:
        symbols = mt5.symbols_get(group=group)
    else:
        symbols = mt5.symbols_get()
    if symbols is None:
        return {"data": []}
    result = []
    for s in symbols:
        if not s.visible:
            continue
        tick = mt5.symbol_info_tick(s.name)
        result.append({
            "name": s.name,
            "description": s.description,
            "spread": s.spread,
            "digits": s.digits,
            "point": s.point,
            "bid": tick.bid if tick else 0,
            "ask": tick.ask if tick else 0,
            "volume_min": s.volume_min,
            "volume_max": s.volume_max,
            "volume_step": s.volume_step,
        })
    return {"data": result}


if __name__ == "__main__":
    main()

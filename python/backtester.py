import logging
from typing import Optional
from strategies.base import Strategy, Signal

logger = logging.getLogger("quant-ea.backtester")


class Trade:
    def __init__(self, direction: str, entry_price: float, sl: float, tp: float, entry_time: int, entry_index: int):
        self.direction = direction
        self.entry_price = entry_price
        self.sl = sl
        self.tp = tp
        self.entry_time = entry_time
        self.entry_index = entry_index
        self.exit_price: float = 0
        self.exit_time: int = 0
        self.exit_index: int = 0
        self.pnl: float = 0
        self.exit_reason: str = ""

    def to_dict(self) -> dict:
        return {
            "direction": self.direction,
            "entry_price": round(self.entry_price, 2),
            "exit_price": round(self.exit_price, 2),
            "sl": round(self.sl, 2),
            "tp": round(self.tp, 2),
            "entry_time": self.entry_time,
            "exit_time": self.exit_time,
            "pnl": round(self.pnl, 2),
            "exit_reason": self.exit_reason,
        }


class BacktestResult:
    def __init__(self):
        self.trades: list[Trade] = []
        self.equity_curve: list[dict] = []
        self.initial_balance: float = 0
        self.final_balance: float = 0

    def compute_stats(self) -> dict:
        if not self.trades:
            return {
                "total_trades": 0,
                "win_rate": 0,
                "profit_factor": 0,
                "total_pnl": 0,
                "max_drawdown": 0,
                "max_drawdown_pct": 0,
                "avg_win": 0,
                "avg_loss": 0,
                "best_trade": 0,
                "worst_trade": 0,
                "avg_trade_duration": 0,
                "wins": 0,
                "losses": 0,
                "initial_balance": self.initial_balance,
                "final_balance": self.initial_balance,
            }

        wins = [t for t in self.trades if t.pnl > 0]
        losses = [t for t in self.trades if t.pnl <= 0]
        total_pnl = sum(t.pnl for t in self.trades)
        gross_profit = sum(t.pnl for t in wins) if wins else 0
        gross_loss = abs(sum(t.pnl for t in losses)) if losses else 0

        peak = self.initial_balance
        max_dd = 0
        balance = self.initial_balance
        for t in self.trades:
            balance += t.pnl
            if balance > peak:
                peak = balance
            dd = peak - balance
            if dd > max_dd:
                max_dd = dd

        durations = [t.exit_time - t.entry_time for t in self.trades if t.exit_time > 0]
        avg_duration = sum(durations) / len(durations) if durations else 0

        return {
            "total_trades": len(self.trades),
            "wins": len(wins),
            "losses": len(losses),
            "win_rate": round(len(wins) / len(self.trades) * 100, 1) if self.trades else 0,
            "profit_factor": round(gross_profit / gross_loss, 2) if gross_loss > 0 else 999.0,
            "total_pnl": round(total_pnl, 2),
            "max_drawdown": round(max_dd, 2),
            "max_drawdown_pct": round(max_dd / self.initial_balance * 100, 2) if self.initial_balance > 0 else 0,
            "avg_win": round(gross_profit / len(wins), 2) if wins else 0,
            "avg_loss": round(gross_loss / len(losses), 2) if losses else 0,
            "best_trade": round(max(t.pnl for t in self.trades), 2),
            "worst_trade": round(min(t.pnl for t in self.trades), 2),
            "avg_trade_duration": int(avg_duration),
            "initial_balance": self.initial_balance,
            "final_balance": round(self.initial_balance + total_pnl, 2),
        }

    def to_dict(self) -> dict:
        stats = self.compute_stats()
        eq_sampled = self.equity_curve
        if len(eq_sampled) > 2000:
            step = len(eq_sampled) // 2000
            eq_sampled = eq_sampled[::step]
        return {
            "stats": stats,
            "trades": [t.to_dict() for t in self.trades],
            "equity_curve": eq_sampled,
        }


class Backtester:
    def __init__(self, strategy: Strategy, candles: list[dict], initial_balance: float = 10000.0, lot_size: float = 0.1, spread: float = 0.30):
        self._strategy = strategy
        self._candles = candles
        self._initial_balance = initial_balance
        self._lot_size = lot_size
        self._spread = spread

    def run(self) -> BacktestResult:
        self._strategy.init(self._candles)
        result = BacktestResult()
        result.initial_balance = self._initial_balance

        balance = self._initial_balance
        open_trade: Optional[Trade] = None
        equity_curve = [{"time": self._candles[0]["time"], "equity": balance}]

        for i in range(1, len(self._candles)):
            candle = self._candles[i]
            high = candle["high"]
            low = candle["low"]
            close = candle["close"]

            if open_trade:
                closed = False
                if open_trade.direction == Signal.BUY:
                    if low <= open_trade.sl:
                        open_trade.exit_price = open_trade.sl
                        open_trade.exit_reason = "sl"
                        closed = True
                    elif high >= open_trade.tp:
                        open_trade.exit_price = open_trade.tp
                        open_trade.exit_reason = "tp"
                        closed = True
                else:
                    if high >= open_trade.sl:
                        open_trade.exit_price = open_trade.sl
                        open_trade.exit_reason = "sl"
                        closed = True
                    elif low <= open_trade.tp:
                        open_trade.exit_price = open_trade.tp
                        open_trade.exit_reason = "tp"
                        closed = True

                if closed:
                    if open_trade.direction == Signal.BUY:
                        open_trade.pnl = (open_trade.exit_price - open_trade.entry_price) * self._lot_size * 100
                    else:
                        open_trade.pnl = (open_trade.entry_price - open_trade.exit_price) * self._lot_size * 100
                    open_trade.exit_time = candle["time"]
                    open_trade.exit_index = i
                    balance += open_trade.pnl
                    result.trades.append(open_trade)
                    open_trade = None

            if not open_trade:
                signal = self._strategy.next(i)
                if signal == Signal.BUY:
                    entry = close + self._spread
                    sl = self._strategy.get_sl(Signal.BUY, entry)
                    tp = self._strategy.get_tp(Signal.BUY, entry)
                    open_trade = Trade(Signal.BUY, entry, sl, tp, candle["time"], i)
                elif signal == Signal.SELL:
                    entry = close - self._spread
                    sl = self._strategy.get_sl(Signal.SELL, entry)
                    tp = self._strategy.get_tp(Signal.SELL, entry)
                    open_trade = Trade(Signal.SELL, entry, sl, tp, candle["time"], i)

            equity_curve.append({"time": candle["time"], "equity": round(balance, 2)})

        if open_trade:
            last = self._candles[-1]
            open_trade.exit_price = last["close"]
            open_trade.exit_time = last["time"]
            open_trade.exit_index = len(self._candles) - 1
            open_trade.exit_reason = "end"
            if open_trade.direction == Signal.BUY:
                open_trade.pnl = (open_trade.exit_price - open_trade.entry_price) * self._lot_size * 100
            else:
                open_trade.pnl = (open_trade.entry_price - open_trade.exit_price) * self._lot_size * 100
            balance += open_trade.pnl
            result.trades.append(open_trade)

        result.equity_curve = equity_curve
        result.final_balance = balance
        logger.info(f"Backtest done: {len(result.trades)} trades, PnL={sum(t.pnl for t in result.trades):.2f}")
        return result

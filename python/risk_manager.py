import logging
from datetime import datetime, time

logger = logging.getLogger("quant-ea.risk")


class RiskManager:
    def __init__(self):
        self._config = {
            "max_daily_loss": 100,
            "max_daily_loss_type": "amount",
            "max_drawdown": 10,
            "max_open_trades": 5,
            "max_spread": 3,
            "trading_hours_enabled": False,
            "trading_hours_start": "08:00",
            "trading_hours_end": "22:00",
        }
        self._daily_starting_balance = 0
        self._daily_loss_accumulated = 0
        self._peak_equity = 0

    def update_config(self, config: dict):
        self._config.update(config)
        logger.info(f"Risk config updated: {self._config}")

    def reset_daily(self, balance: float):
        self._daily_starting_balance = balance
        self._daily_loss_accumulated = 0
        self._peak_equity = balance

    def update_equity(self, equity: float):
        if equity > self._peak_equity:
            self._peak_equity = equity

    def can_open_trade(self, mt5_service, symbol: str) -> tuple:
        if not self._check_trading_hours():
            return False, "Outside trading hours"

        positions = mt5_service.get_positions()
        if len(positions) >= self._config["max_open_trades"]:
            return False, f"Max open trades reached ({self._config['max_open_trades']})"

        sym_info = mt5_service.get_symbol_info(symbol)
        if sym_info and sym_info["spread"] > self._config["max_spread"]:
            return False, f"Spread too high ({sym_info['spread']} > {self._config['max_spread']})"

        account = mt5_service.get_account_info()
        if account:
            if self._check_daily_loss_exceeded(account):
                return False, "Max daily loss exceeded"
            if self._check_drawdown_exceeded(account):
                return False, "Max drawdown exceeded"

        return True, ""

    def _check_trading_hours(self) -> bool:
        if not self._config["trading_hours_enabled"]:
            return True

        now = datetime.utcnow().time()
        start_parts = self._config["trading_hours_start"].split(":")
        end_parts = self._config["trading_hours_end"].split(":")

        start = time(int(start_parts[0]), int(start_parts[1]))
        end = time(int(end_parts[0]), int(end_parts[1]))

        if start <= end:
            return start <= now <= end
        return now >= start or now <= end

    def _check_daily_loss_exceeded(self, account: dict) -> bool:
        if self._daily_starting_balance == 0:
            self._daily_starting_balance = account["balance"]

        current_loss = self._daily_starting_balance - account["equity"]

        if self._config["max_daily_loss_type"] == "percent":
            loss_pct = (current_loss / self._daily_starting_balance) * 100 if self._daily_starting_balance > 0 else 0
            return loss_pct >= self._config["max_daily_loss"]

        return current_loss >= self._config["max_daily_loss"]

    def _check_drawdown_exceeded(self, account: dict) -> bool:
        if self._peak_equity == 0:
            self._peak_equity = account["equity"]

        self.update_equity(account["equity"])

        drawdown_pct = ((self._peak_equity - account["equity"]) / self._peak_equity) * 100 if self._peak_equity > 0 else 0
        return drawdown_pct >= self._config["max_drawdown"]

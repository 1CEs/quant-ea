import subprocess
import json
import os
import logging

logger = logging.getLogger("quant-ea.wine-bridge")

WINE_PYTHON = "wine"
WINE_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wine_mt5_worker.py")


class WineBridge:
    def __init__(self, mt5_path: str = ""):
        self._wine_python_cmd = [WINE_PYTHON, "python", WINE_SCRIPT]
        self._mt5_path = mt5_path
        self._env = {**os.environ, "WINEDEBUG": "-all"}
        self._credentials = None

    def set_credentials(self, login: int, password: str, server: str):
        self._credentials = {"login": login, "password": password, "server": server}

    def execute(self, command: str, params: dict = None, timeout: int = 30) -> dict:
        p = params.copy() if params else {}
        if self._mt5_path and "_mt5_path" not in p:
            p["_mt5_path"] = self._mt5_path
        if self._credentials and "_credentials" not in p:
            p["_credentials"] = self._credentials
        payload = json.dumps({"command": command, "params": p})
        try:
            result = subprocess.run(
                self._wine_python_cmd,
                input=payload,
                capture_output=True,
                text=True,
                timeout=timeout,
                env=self._env,
            )
            stdout = result.stdout.strip()
            if not stdout:
                return {"error": f"No output. stderr: {result.stderr[-300:] if result.stderr else 'none'}"}
            for line in reversed(stdout.split("\n")):
                line = line.strip()
                if line.startswith("{") or line.startswith("["):
                    return json.loads(line)
            return {"error": f"No JSON in output: {stdout[-200:]}"}
        except subprocess.TimeoutExpired:
            return {"error": f"Wine bridge timeout ({timeout}s)"}
        except json.JSONDecodeError as e:
            return {"error": f"JSON decode error: {e}"}
        except FileNotFoundError:
            return {"error": "Wine not found. Install Wine: brew install --cask wine-stable"}
        except Exception as e:
            return {"error": str(e)}

    def is_wine_available(self) -> bool:
        try:
            result = subprocess.run(
                ["wine", "--version"],
                capture_output=True, text=True, timeout=5,
                env=self._env,
            )
            return result.returncode == 0
        except Exception:
            return False

    def is_terminal_running(self) -> bool:
        try:
            result = subprocess.run(
                ["pgrep", "-f", "terminal64.exe"],
                capture_output=True, text=True, timeout=3,
            )
            return result.returncode == 0
        except Exception:
            return False

    def connect(self, login: int, password: str, server: str, path: str = "") -> dict:
        return self.execute("connect", {
            "login": login,
            "password": password,
            "server": server,
            "path": path,
        })

    def disconnect(self) -> dict:
        return self.execute("disconnect")

    def account_info(self) -> dict:
        return self.execute("account_info")

    def symbol_info(self, symbol: str) -> dict:
        return self.execute("symbol_info", {"symbol": symbol})

    def symbol_info_tick(self, symbol: str) -> dict:
        return self.execute("symbol_info_tick", {"symbol": symbol})

    def get_rates(self, symbol: str, timeframe: int, count: int) -> dict:
        timeout = 30 if count <= 50000 else 120
        return self.execute("get_rates", {
            "symbol": symbol,
            "timeframe": timeframe,
            "count": count,
        }, timeout=timeout)

    def positions_get(self, symbol: str = None, ticket: int = None) -> dict:
        return self.execute("positions_get", {"symbol": symbol, "ticket": ticket})

    def orders_get(self) -> dict:
        return self.execute("orders_get")

    def history_deals_get(self, days: int) -> dict:
        return self.execute("history_deals_get", {"days": days})

    def order_send(self, request: dict) -> dict:
        return self.execute("order_send", {"request": request})

    def symbols_get(self) -> dict:
        return self.execute("symbols_get")

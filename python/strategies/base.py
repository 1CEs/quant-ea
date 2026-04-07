from abc import ABC, abstractmethod
from typing import Optional


class Signal:
    BUY = "buy"
    SELL = "sell"
    NONE = "none"


class Strategy(ABC):
    name: str = "base"
    description: str = ""
    default_params: dict = {}

    def __init__(self, params: dict = None):
        self.params = {**self.default_params, **(params or {})}

    @abstractmethod
    def init(self, candles: list[dict]) -> None:
        pass

    @abstractmethod
    def next(self, index: int) -> str:
        pass

    @abstractmethod
    def get_sl(self, direction: str, entry_price: float) -> float:
        pass

    @abstractmethod
    def get_tp(self, direction: str, entry_price: float) -> float:
        pass

    def get_indicators(self) -> dict:
        return {}

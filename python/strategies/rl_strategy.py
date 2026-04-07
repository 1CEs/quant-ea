import logging
import random
import numpy as np
from strategies.base import Strategy, Signal

logger = logging.getLogger("quant-ea.rl")

DIR_NONE = 0
DIR_BUY  = 1
DIR_SELL = 2

OUTCOME_TP   = 0
OUTCOME_SL   = 1
OUTCOME_FLAT = 2


def _ema(values: np.ndarray, period: int) -> np.ndarray:
    result = np.zeros(len(values))
    if len(values) < period:
        return result
    k = 2.0 / (period + 1)
    result[period - 1] = values[:period].mean()
    for i in range(period, len(values)):
        result[i] = values[i] * k + result[i - 1] * (1 - k)
    return result


def _sma(values: np.ndarray, period: int) -> np.ndarray:
    result = np.zeros(len(values))
    if len(values) < period:
        return result
    cs = np.cumsum(values)
    result[period - 1:] = (cs[period - 1:] - np.concatenate([[0], cs[:-period]])) / period
    return result


def _rsi(closes: np.ndarray, period: int) -> np.ndarray:
    result = np.full(len(closes), 50.0)
    if len(closes) < period + 1:
        return result
    deltas = np.diff(closes)
    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)
    ag = gains[:period].mean()
    al = losses[:period].mean()
    for i in range(period, len(deltas)):
        ag = (ag * (period - 1) + gains[i]) / period
        al = (al * (period - 1) + losses[i]) / period
        if al == 0:
            result[i + 1] = 100.0
        else:
            result[i + 1] = 100.0 - 100.0 / (1.0 + ag / al)
    return result


def _atr(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int) -> np.ndarray:
    n = len(closes)
    result = np.zeros(n)
    if n < period + 1:
        return result
    tr = np.maximum(
        highs[1:] - lows[1:],
        np.maximum(np.abs(highs[1:] - closes[:-1]), np.abs(lows[1:] - closes[:-1]))
    )
    val = tr[:period].mean()
    result[period] = val
    for i in range(period, len(tr)):
        val = (val * (period - 1) + tr[i]) / period
        result[i + 1] = val
    return result


def _adx(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int) -> np.ndarray:
    n = len(closes)
    result = np.zeros(n)
    if n < period * 2 + 1:
        return result
    plus_dm = np.zeros(n)
    minus_dm = np.zeros(n)
    tr_arr = np.zeros(n)
    for i in range(1, n):
        up = highs[i] - highs[i - 1]
        dn = lows[i - 1] - lows[i]
        plus_dm[i] = up if up > dn and up > 0 else 0.0
        minus_dm[i] = dn if dn > up and dn > 0 else 0.0
        tr_arr[i] = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
    sm_tr = np.zeros(n)
    sm_plus = np.zeros(n)
    sm_minus = np.zeros(n)
    sm_tr[period] = tr_arr[1:period + 1].sum()
    sm_plus[period] = plus_dm[1:period + 1].sum()
    sm_minus[period] = minus_dm[1:period + 1].sum()
    for i in range(period + 1, n):
        sm_tr[i] = sm_tr[i - 1] - sm_tr[i - 1] / period + tr_arr[i]
        sm_plus[i] = sm_plus[i - 1] - sm_plus[i - 1] / period + plus_dm[i]
        sm_minus[i] = sm_minus[i - 1] - sm_minus[i - 1] / period + minus_dm[i]
    with np.errstate(divide='ignore', invalid='ignore'):
        plus_di = np.where(sm_tr != 0, 100.0 * sm_plus / sm_tr, 0.0)
        minus_di = np.where(sm_tr != 0, 100.0 * sm_minus / sm_tr, 0.0)
        di_sum = plus_di + minus_di
        dx = np.where(di_sum != 0, 100.0 * np.abs(plus_di - minus_di) / di_sum, 0.0)
    start = period * 2
    if start < n:
        result[start] = dx[period + 1:start + 1].mean() if start >= period + 1 else 0
        for i in range(start + 1, n):
            result[i] = (result[i - 1] * (period - 1) + dx[i]) / period
    return result


def _digitize(value: float, edges: list[float]) -> int:
    for idx, e in enumerate(edges):
        if value <= e:
            return idx
    return len(edges)


def _build_direction_signals(closes: np.ndarray, highs: np.ndarray, lows: np.ndarray,
                             adx_arr: np.ndarray, adx_min: float) -> np.ndarray:
    n = len(closes)
    directions = np.full(n, DIR_NONE, dtype=np.int32)
    ema8 = _ema(closes, 8)
    ema21 = _ema(closes, 21)
    rsi7 = _rsi(closes, 7)
    for i in range(30, n):
        if adx_arr[i] < adx_min:
            continue
        if ema8[i] > ema21[i] and rsi7[i] > 40 and rsi7[i] < 75:
            directions[i] = DIR_BUY
        elif ema8[i] < ema21[i] and rsi7[i] < 60 and rsi7[i] > 25:
            directions[i] = DIR_SELL
    return directions


class StateEncoder:
    def __init__(self, closes: np.ndarray, highs: np.ndarray, lows: np.ndarray,
                 volumes: np.ndarray, atr_arr: np.ndarray):
        n = len(closes)
        rsi5 = _rsi(closes, 5)
        atr_sma50 = _sma(atr_arr, 50)
        vol_sma20 = _sma(volumes, 20)

        roc3 = np.zeros(n)
        safe_c = np.where(closes[:-3] != 0, closes[:-3], 1e-6)
        roc3[3:] = (closes[3:] - closes[:-3]) / safe_c * 100

        with np.errstate(divide='ignore', invalid='ignore'):
            safe_atr = np.where(atr_sma50 != 0, atr_sma50, 1.0)
            vol_regime = np.where(atr_sma50 != 0, atr_arr / safe_atr, 1.0)
            safe_vol = np.where(vol_sma20 != 0, vol_sma20, 1.0)
            vol_surge = np.where(vol_sma20 != 0, volumes / safe_vol, 1.0)

        self._rsi5 = rsi5
        self._roc3 = roc3
        self._vol_regime = vol_regime
        self._vol_surge = vol_surge

    def encode(self, i: int) -> int:
        rsi_bin = _digitize(self._rsi5[i], [30.0, 45.0, 55.0, 70.0])
        mom_bin = _digitize(self._roc3[i], [-0.15, 0.0, 0.15])
        vr_bin = _digitize(self._vol_regime[i], [0.8, 1.2])
        vs_bin = _digitize(self._vol_surge[i], [0.8, 1.3])
        state = rsi_bin
        state = state * 4 + mom_bin
        state = state * 3 + vr_bin
        state = state * 3 + vs_bin
        return state


class TradeSimulator:
    def __init__(self, closes: np.ndarray, highs: np.ndarray, lows: np.ndarray,
                 atr: np.ndarray, directions: np.ndarray,
                 spread: float, sl_mult: float, tp_mult: float, max_hold: int):
        self._n = len(closes)
        self._outcomes = np.full(self._n, OUTCOME_FLAT, dtype=np.int32)
        self._pnl = np.zeros(self._n)
        self._precompute(closes, highs, lows, atr, directions, spread, sl_mult, tp_mult, max_hold)

    def _precompute(self, closes, highs, lows, atr, directions, spread, sl_mult, tp_mult, max_hold):
        n = self._n
        for i in range(n - 1):
            d = directions[i]
            if d == DIR_NONE:
                continue
            a = atr[i]
            if a <= 0:
                continue
            sl_d = a * sl_mult
            tp_d = a * tp_mult
            end_j = min(i + 1 + max_hold, n)
            if d == DIR_BUY:
                entry = closes[i] + spread
                sl, tp = entry - sl_d, entry + tp_d
                for j in range(i + 1, end_j):
                    if lows[j] <= sl:
                        self._outcomes[i] = OUTCOME_SL
                        self._pnl[i] = -(sl_d + spread)
                        break
                    if highs[j] >= tp:
                        self._outcomes[i] = OUTCOME_TP
                        self._pnl[i] = tp_d - spread
                        break
                else:
                    last = min(i + max_hold, n - 1)
                    self._pnl[i] = closes[last] - entry
            else:
                entry = closes[i] - spread
                sl, tp = entry + sl_d, entry - tp_d
                for j in range(i + 1, end_j):
                    if highs[j] >= sl:
                        self._outcomes[i] = OUTCOME_SL
                        self._pnl[i] = -(sl_d + spread)
                        break
                    if lows[j] <= tp:
                        self._outcomes[i] = OUTCOME_TP
                        self._pnl[i] = tp_d - spread
                        break
                else:
                    last = min(i + max_hold, n - 1)
                    self._pnl[i] = entry - closes[last]
        logger.info(f"Pre-computed trade outcomes for {n} bars")

    def get_outcome(self, index: int) -> tuple[int, float]:
        return self._outcomes[index], self._pnl[index]


class ThompsonBandit:
    def __init__(self, n_states: int, prior_a: float = 1.0, prior_b: float = 1.0):
        self._alpha = np.full(n_states, prior_a)
        self._beta = np.full(n_states, prior_b)

    def should_take(self, state: int, explore: bool = True) -> bool:
        if explore:
            theta = np.random.beta(self._alpha[state], self._beta[state])
            return theta > 0.5
        return self._alpha[state] / (self._alpha[state] + self._beta[state]) > 0.5

    def update_win(self, state: int):
        self._alpha[state] += 1.0

    def update_loss(self, state: int):
        self._beta[state] += 1.0

    def decay(self, factor: float = 0.995):
        self._alpha = 1.0 + (self._alpha - 1.0) * factor
        self._beta = 1.0 + (self._beta - 1.0) * factor

    def stats(self) -> dict:
        wr = self._alpha / (self._alpha + self._beta)
        active = np.sum((self._alpha + self._beta) > 3.0)
        return {"active_states": int(active), "mean_wr": round(float(wr[wr > 0].mean()), 3)}


class RLStrategy(Strategy):
    name = "rl_strategy"
    description = "RL Meta-Labeler — Thompson Sampling bandit filters EMA/RSI/ADX signals, learns to survive the market"
    default_params = {
        "train_window":      20000,
        "retrain_interval":  5000,
        "adx_min":           20.0,
        "max_hold":          20,
        "atr_period":        10,
        "sl_atr_mult":       1.5,
        "tp_atr_mult":       2.5,
        "spread":            0.30,
        "min_atr":           1.0,
        "win_weight":        1.0,
        "loss_weight":       1.5,
    }

    def init(self, candles: list[dict]) -> None:
        self._n = len(candles)
        self._warmup = max(300, self.params["train_window"] // 3)

        logger.info(f"RL Thompson bandit init: {self._n} candles")

        closes  = np.array([c["close"]       for c in candles], dtype=np.float64)
        opens   = np.array([c["open"]        for c in candles], dtype=np.float64)
        highs   = np.array([c["high"]        for c in candles], dtype=np.float64)
        lows    = np.array([c["low"]         for c in candles], dtype=np.float64)
        volumes = np.array([c["tick_volume"] for c in candles], dtype=np.float64)

        self._atr_arr = _atr(highs, lows, closes, self.params["atr_period"])
        adx_arr = _adx(highs, lows, closes, 14)

        logger.info("Building direction signals (EMA8/21 + RSI7 + ADX)...")
        self._directions = _build_direction_signals(closes, highs, lows, adx_arr, self.params["adx_min"])

        logger.info("Encoding states...")
        self._encoder = StateEncoder(closes, highs, lows, volumes, self._atr_arr)
        self._states = np.array([self._encoder.encode(i) for i in range(self._n)], dtype=np.int32)

        logger.info("Pre-computing trade outcomes...")
        self._sim = TradeSimulator(
            closes, highs, lows, self._atr_arr, self._directions,
            self.params["spread"], self.params["sl_atr_mult"],
            self.params["tp_atr_mult"], self.params["max_hold"]
        )

        n_states = 5 * 4 * 3 * 3
        self._bandit = ThompsonBandit(n_states, prior_a=1.0, prior_b=1.0)
        self._final_actions = np.full(self._n, DIR_NONE, dtype=np.int32)

        logger.info("Walk-forward RL training...")
        self._walk_forward()
        logger.info(f"RL training done — {self._bandit.stats()}")

    def _walk_forward(self):
        tw = self.params["train_window"]
        ri = self.params["retrain_interval"]
        ww = self.params["win_weight"]
        lw = self.params["loss_weight"]

        i = self._warmup
        while i < self._n:
            train_start = max(0, i - tw)
            train_end = i

            self._bandit = ThompsonBandit(5 * 4 * 3 * 3, prior_a=1.0, prior_b=1.0)
            for idx in range(train_start, train_end):
                if self._directions[idx] == DIR_NONE:
                    continue
                outcome, pnl = self._sim.get_outcome(idx)
                s = self._states[idx]
                if outcome == OUTCOME_TP:
                    for _ in range(max(1, int(ww))):
                        self._bandit.update_win(s)
                elif outcome == OUTCOME_SL:
                    for _ in range(max(1, int(lw))):
                        self._bandit.update_loss(s)
                else:
                    if pnl >= 0:
                        self._bandit.update_win(s)
                    else:
                        self._bandit.update_loss(s)

            pred_end = min(i + ri, self._n)
            for idx in range(i, pred_end):
                if self._directions[idx] == DIR_NONE:
                    continue
                if self._atr_arr[idx] < self.params["min_atr"]:
                    continue
                s = self._states[idx]
                if self._bandit.should_take(s, explore=False):
                    self._final_actions[idx] = self._directions[idx]

            i += ri

    def next(self, index: int) -> str:
        if index < self._warmup:
            return Signal.NONE
        d = self._final_actions[index]
        atr = self._atr_arr[index]
        self._current_atr = atr if atr > 0 else 3.0
        if d == DIR_BUY:
            return Signal.BUY
        if d == DIR_SELL:
            return Signal.SELL
        return Signal.NONE

    def get_sl(self, direction: str, entry_price: float) -> float:
        dist = self._current_atr * self.params["sl_atr_mult"]
        return entry_price - dist if direction == Signal.BUY else entry_price + dist

    def get_tp(self, direction: str, entry_price: float) -> float:
        dist = self._current_atr * self.params["tp_atr_mult"]
        return entry_price + dist if direction == Signal.BUY else entry_price - dist

    def get_indicators(self) -> dict:
        return {"actions": self._final_actions.tolist(), "atr": self._atr_arr.tolist()}

import logging
from typing import Optional
from pymongo import MongoClient, ASCENDING
from datetime import datetime, timedelta

logger = logging.getLogger("quant-ea.dataset-store")

MONGO_URI = "mongodb://localhost:27017"
DB_NAME = "quant_ea"
COLLECTION = "candles"


class DatasetStore:
    def __init__(self, uri: str = MONGO_URI):
        self._client = MongoClient(uri, serverSelectionTimeoutMS=3000)
        self._db = self._client[DB_NAME]
        self._col = self._db[COLLECTION]
        self._ensure_indexes()
        self._available = True
        try:
            self._client.admin.command("ping")
            logger.info("MongoDB connected")
        except Exception as e:
            self._available = False
            logger.warning(f"MongoDB not available: {e}")

    def _ensure_indexes(self):
        try:
            self._col.create_index(
                [("symbol", ASCENDING), ("timeframe", ASCENDING), ("time", ASCENDING)],
                unique=True,
            )
        except Exception:
            pass

    @property
    def available(self) -> bool:
        return self._available

    def get_cached_range(self, symbol: str, timeframe: str) -> Optional[dict]:
        if not self._available:
            return None
        query = {"symbol": symbol, "timeframe": timeframe}
        oldest = self._col.find_one(query, sort=[("time", ASCENDING)])
        newest = self._col.find_one(query, sort=[("time", -1)])
        if not oldest or not newest:
            return None
        count = self._col.count_documents(query)
        return {
            "start_time": oldest["time"],
            "end_time": newest["time"],
            "count": count,
        }

    def get_candles(self, symbol: str, timeframe: str, start_time: int = 0, end_time: int = 0) -> list:
        if not self._available:
            return []
        query = {"symbol": symbol, "timeframe": timeframe}
        if start_time:
            query["time"] = {"$gte": start_time}
        if end_time:
            if "time" in query:
                query["time"]["$lte"] = end_time
            else:
                query["time"] = {"$lte": end_time}
        cursor = self._col.find(query, {"_id": 0, "symbol": 0, "timeframe": 0}).sort("time", ASCENDING)
        return list(cursor)

    def store_candles(self, symbol: str, timeframe: str, candles: list):
        if not self._available or not candles:
            return 0
        ops = []
        from pymongo import UpdateOne
        for c in candles:
            doc = {
                "symbol": symbol,
                "timeframe": timeframe,
                "time": c["time"],
                "open": c["open"],
                "high": c["high"],
                "low": c["low"],
                "close": c["close"],
                "tick_volume": c.get("tick_volume", 0),
            }
            ops.append(UpdateOne(
                {"symbol": symbol, "timeframe": timeframe, "time": c["time"]},
                {"$set": doc},
                upsert=True,
            ))
        if ops:
            result = self._db[COLLECTION].bulk_write(ops, ordered=False)
            inserted = result.upserted_count
            modified = result.modified_count
            logger.info(f"Stored {symbol} {timeframe}: {inserted} new, {modified} updated, {len(candles)} total")
            return inserted + modified
        return 0

    def compute_missing_range(self, symbol: str, timeframe: str, requested_days: int) -> dict:
        now_ts = int(datetime.utcnow().timestamp())
        requested_start = int((datetime.utcnow() - timedelta(days=requested_days)).timestamp())

        cached = self.get_cached_range(symbol, timeframe)
        if not cached:
            return {
                "need_fetch": True,
                "fetch_count": None,
                "fetch_from": requested_start,
                "fetch_to": now_ts,
                "cached_count": 0,
                "strategy": "full",
            }

        cached_start = cached["start_time"]
        cached_end = cached["end_time"]

        needs_older = requested_start < cached_start
        needs_newer = now_ts - cached_end > 3600

        if not needs_older and not needs_newer:
            return {
                "need_fetch": False,
                "cached_count": cached["count"],
                "strategy": "cache_hit",
            }

        tf_minutes = {"M1": 1, "M5": 5, "M15": 15, "M30": 30, "H1": 60, "H4": 240, "D1": 1440, "W1": 10080, "MN1": 43200}
        tf_min = tf_minutes.get(timeframe, 60)

        older_bars = 0
        newer_bars = 0
        if needs_older:
            older_minutes = (cached_start - requested_start) / 60
            older_bars = int(older_minutes / tf_min) + 10
        if needs_newer:
            newer_minutes = (now_ts - cached_end) / 60
            newer_bars = int(newer_minutes / tf_min) + 10

        return {
            "need_fetch": True,
            "fetch_older_bars": older_bars if needs_older else 0,
            "fetch_newer_bars": newer_bars if needs_newer else 0,
            "cached_start": cached_start,
            "cached_end": cached_end,
            "cached_count": cached["count"],
            "strategy": "merge",
        }

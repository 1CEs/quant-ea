import csv
import logging
from datetime import datetime

logger = logging.getLogger("quant-ea.csv-importer")

DELIMITERS = [",", ";", "\t", "|"]

DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y.%m.%d %H:%M:%S",
    "%Y.%m.%d %H:%M",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%m/%d/%Y %H:%M:%S",
    "%m/%d/%Y %H:%M",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d",
    "%Y.%m.%d",
]


class CsvImporter:
    def parse(self, file_path: str) -> list:
        logger.info(f"Parsing CSV: {file_path}")
        candles = []
        date_fmt = None
        delimiter = self._detect_delimiter(file_path)
        logger.info(f"Detected delimiter: {repr(delimiter)}")

        with open(file_path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f, delimiter=delimiter)

            fieldnames = reader.fieldnames
            if not fieldnames:
                logger.error("CSV has no headers")
                return []

            col_map = self._map_columns(fieldnames)
            if not col_map:
                logger.error(f"Cannot map CSV columns: {fieldnames} example: {delimiter.join(fieldnames)}")
                return []

            logger.info(f"Column mapping: {col_map}")

            for row in reader:
                try:
                    date_str = row[col_map["date"]].strip()
                    if date_fmt is None:
                        date_fmt = self._detect_format(date_str)
                        if date_fmt is None:
                            logger.error(f"Cannot parse date: {date_str}")
                            return []
                        logger.info(f"Detected date format: {date_fmt}")

                    dt = datetime.strptime(date_str, date_fmt)
                    ts = int(dt.timestamp())

                    candles.append({
                        "time": ts,
                        "open": float(row[col_map["open"]]),
                        "high": float(row[col_map["high"]]),
                        "low": float(row[col_map["low"]]),
                        "close": float(row[col_map["close"]]),
                        "tick_volume": int(float(row.get(col_map.get("volume", ""), "0") or "0")),
                    })
                except Exception as e:
                    continue

        candles.sort(key=lambda c: c["time"])
        logger.info(f"Parsed {len(candles)} candles from CSV")
        return candles

    def _map_columns(self, fieldnames: list) -> dict:
        mapping = {}
        lower_map = {f.strip().lower(): f.strip() for f in fieldnames}

        date_keys = ["date", "time", "datetime", "date/time", "timestamp"]
        for k in date_keys:
            if k in lower_map:
                mapping["date"] = lower_map[k]
                break

        for field in ["open", "high", "low", "close"]:
            if field in lower_map:
                mapping[field] = lower_map[field]

        vol_keys = ["volume", "vol", "tick_volume", "tickvol"]
        for k in vol_keys:
            if k in lower_map:
                mapping["volume"] = lower_map[k]
                break

        required = ["date", "open", "high", "low", "close"]
        if all(k in mapping for k in required):
            return mapping
        return {}

    def _detect_delimiter(self, file_path: str) -> str:
        with open(file_path, "r", encoding="utf-8-sig") as f:
            header = f.readline()
        for d in DELIMITERS:
            if header.count(d) >= 4:
                return d
        return ","

    def _detect_format(self, date_str: str) -> str:
        for fmt in DATE_FORMATS:
            try:
                datetime.strptime(date_str, fmt)
                return fmt
            except ValueError:
                continue
        return None

import argparse
import asyncio
import logging
from server import WebSocketServer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

logger = logging.getLogger("quant-ea")


def main():
    parser = argparse.ArgumentParser(description="Quant EA Python Bridge")
    parser.add_argument("--port", type=int, default=8765, help="WebSocket port")
    args = parser.parse_args()

    logger.info(f"Starting Quant EA Python Bridge on port {args.port}")

    server = WebSocketServer(port=args.port)
    asyncio.run(server.start())


if __name__ == "__main__":
    main()

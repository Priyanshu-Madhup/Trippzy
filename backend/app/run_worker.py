"""Standalone worker process (use with RUN_WORKER_IN_API=false): `python -m app.run_worker`."""

import asyncio
import signal

from app.context import build_ctx
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.db import ensure_indexes, make_client
from app.services.worker import worker_loop


async def main() -> None:
    settings = get_settings()
    setup_logging(settings.log_level)
    client = make_client(settings)
    db = client[settings.mongodb_db]
    await ensure_indexes(db)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:  # Windows
            pass
    await worker_loop(build_ctx(settings, db), stop)
    await client.close()


if __name__ == "__main__":
    asyncio.run(main())

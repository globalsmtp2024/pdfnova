import logging
import sys

import structlog

from app.core.config import Settings

REDACTED_KEYS = frozenset({"password", "token", "secret", "authorization", "cookie", "content", "filename"})


def _redact(_: object, __: str, event_dict: structlog.typing.EventDict) -> structlog.typing.EventDict:
    for key in list(event_dict):
        if any(marker in key.lower() for marker in REDACTED_KEYS):
            event_dict[key] = "[redacted]"
    return event_dict


def configure_logging(settings: Settings) -> None:
    level = logging.getLevelName(settings.log_level.upper())
    renderer: structlog.typing.Processor = (
        structlog.processors.JSONRenderer() if settings.log_json else structlog.dev.ConsoleRenderer()
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            _redact,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
    logging.basicConfig(level=level, stream=sys.stdout, format="%(message)s")


def get_logger(name: str) -> structlog.typing.FilteringBoundLogger:
    logger: structlog.typing.FilteringBoundLogger = structlog.get_logger(name)
    return logger

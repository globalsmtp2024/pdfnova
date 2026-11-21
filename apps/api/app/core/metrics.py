import time
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from prometheus_client import Counter, Histogram

HTTP_REQUESTS = Counter("pdfnova_http_requests_total", "HTTP requests", ["method", "route", "status"])
HTTP_LATENCY = Histogram("pdfnova_http_request_duration_seconds", "HTTP request latency", ["method", "route"])
JOBS_FINISHED = Counter("pdfnova_jobs_finished_total", "Finished jobs", ["tool", "status"])
JOB_DURATION = Histogram(
    "pdfnova_job_duration_seconds",
    "Job execution time",
    ["tool"],
    buckets=(0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600),
)
FILES_DELETED = Counter("pdfnova_files_deleted_total", "Files removed by the retention sweeper")


async def metrics_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    started = time.perf_counter()
    response = await call_next(request)
    route = request.scope.get("route")
    route_path = getattr(route, "path", "unmatched")
    HTTP_REQUESTS.labels(request.method, route_path, str(response.status_code)).inc()
    HTTP_LATENCY.labels(request.method, route_path).observe(time.perf_counter() - started)
    return response

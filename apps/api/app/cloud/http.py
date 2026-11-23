from typing import Any

import httpx

from app.cloud.base import CloudError

TIMEOUT = httpx.Timeout(60.0, connect=10.0)


def check(response: httpx.Response) -> httpx.Response:
    if response.status_code in {401, 403}:
        raise CloudError("The connection to your cloud account expired. Connect it again.", reauthorize=True)
    if response.status_code == 404:
        raise CloudError("That file or folder was not found in your cloud account.")
    if response.status_code == 429:
        raise CloudError("The cloud provider is rate limiting requests. Try again in a minute.")
    if response.status_code >= 400:
        raise CloudError("The cloud provider returned an error.")
    return response


async def request(method: str, url: str, **kwargs: Any) -> httpx.Response:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            return check(await client.request(method, url, **kwargs))
    except httpx.TimeoutException as exc:
        raise CloudError("The cloud provider took too long to answer.") from exc
    except httpx.HTTPError as exc:
        raise CloudError("The cloud provider could not be reached.") from exc


def size_guard(size: int | None, limit: int) -> None:
    if size is not None and size > limit:
        raise CloudError("That file is larger than the allowed size.")

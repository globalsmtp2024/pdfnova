from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, Field

SecretName = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")]
SecretValue = Annotated[str, Field(max_length=98304)]


class CreateTaskRequest(BaseModel):
    tool: str = Field(min_length=1, max_length=64)


class CreateUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    size: int = Field(gt=0)


class UploadResponse(BaseModel):
    id: str
    task_id: str
    filename: str
    size: int
    offset: int
    chunk_size: int
    status: str
    kind: str | None = None
    page_count: int | None = None
    encrypted: bool = False
    rejection_reason: str | None = None


class StartTaskRequest(BaseModel):
    options: dict[str, Any] = Field(default_factory=dict)
    file_order: list[str] | None = Field(default=None, max_length=1000)
    passwords: dict[str, str] = Field(default_factory=dict, max_length=1000, repr=False)
    secrets: dict[SecretName, SecretValue] = Field(default_factory=dict, max_length=8, repr=False)


class TaskFileResponse(BaseModel):
    id: str
    filename: str
    size: int
    mime_type: str
    kind: str
    page_count: int | None
    status: str
    download_url: str | None = None


class TaskResponse(BaseModel):
    id: str
    tool: str
    status: str
    progress: float
    progress_label: str
    error_code: str | None
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    expires_at: datetime
    files_deleted: bool
    input_bytes: int
    output_bytes: int
    estimated_seconds: float | None = None
    inputs: list[TaskFileResponse]
    outputs: list[TaskFileResponse]


class TaskEvent(BaseModel):
    status: str
    progress: float
    label: str
    error_code: str | None
    error_message: str | None

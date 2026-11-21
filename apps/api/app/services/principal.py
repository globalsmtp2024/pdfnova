from dataclasses import dataclass

from app.fair_use import FairUse, get_fair_use
from app.models.user import User


@dataclass(frozen=True)
class Principal:
    user: User | None
    anon_id: str | None
    client_ip_hash: str
    api_key_id: str | None = None

    @property
    def owner_key(self) -> str:
        if self.user is not None:
            return f"u:{self.user.id}"
        if self.anon_id is not None:
            return f"a:{self.anon_id}"
        return f"ip:{self.client_ip_hash}"

    @property
    def limits(self) -> FairUse:
        return get_fair_use()

    @property
    def is_authenticated(self) -> bool:
        return self.user is not None

    @property
    def via_api_key(self) -> bool:
        return self.api_key_id is not None

    @property
    def retention_seconds(self) -> int:
        limits = self.limits
        if self.user is not None and self.user.retention_extended:
            return limits.extended_retention_seconds
        return limits.retention_seconds

    @property
    def priority(self) -> int:
        limits = self.limits
        return limits.api_priority if self.via_api_key else limits.interactive_priority

    @property
    def has_own_ai_key(self) -> bool:
        return self.user is not None and self.user.ai_api_key_encrypted is not None

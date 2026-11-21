import asyncio
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from html import escape
from typing import Protocol

from app.core.brand import get_brand
from app.core.config import Settings
from app.core.logging import get_logger

log = get_logger(__name__)


@dataclass(frozen=True)
class OutgoingEmail:
    to: str
    subject: str
    text: str
    html: str


class EmailSender(Protocol):
    async def send(self, email: OutgoingEmail) -> None: ...


class ConsoleEmailSender:
    def __init__(self) -> None:
        self.outbox: list[OutgoingEmail] = []

    async def send(self, email: OutgoingEmail) -> None:
        self.outbox.append(email)
        log.info(
            "email_console",
            recipient_domain=email.to.rpartition("@")[2],
            subject=email.subject,
            body=email.text,
        )


class SmtpEmailSender:
    def __init__(self, settings: Settings):
        self._settings = settings

    def _deliver(self, email: OutgoingEmail) -> None:
        message = EmailMessage()
        message["From"] = f"{get_brand().name} <{self._settings.email_from}>"
        message["To"] = email.to
        message["Subject"] = email.subject
        message.set_content(email.text)
        message.add_alternative(email.html, subtype="html")
        with smtplib.SMTP(self._settings.smtp_host, self._settings.smtp_port, timeout=30) as client:
            if self._settings.smtp_use_tls:
                client.starttls(context=ssl.create_default_context())
            if self._settings.smtp_username and self._settings.smtp_password:
                client.login(self._settings.smtp_username, self._settings.smtp_password.get_secret_value())
            client.send_message(message)

    async def send(self, email: OutgoingEmail) -> None:
        await asyncio.to_thread(self._deliver, email)


def build_email_sender(settings: Settings) -> EmailSender:
    return SmtpEmailSender(settings) if settings.email_backend == "smtp" else ConsoleEmailSender()


def action_email(
    to: str, subject: str, intro: str, action_label: str, action_url: str, outro: str
) -> OutgoingEmail:
    brand = get_brand()
    text = f"{intro}\n\n{action_label}: {action_url}\n\n{outro}\n\n{brand.name}"
    html = (
        '<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;color:#0F1222">'
        f"<h2 style=\"font-family:'Plus Jakarta Sans',Arial,sans-serif\">{escape(brand.name)}</h2>"
        f"<p>{escape(intro)}</p>"
        f'<p><a href="{escape(action_url)}" style="display:inline-block;padding:12px 20px;'
        'background:#5B4BFF;color:#fff;border-radius:12px;text-decoration:none;font-weight:600">'
        f"{escape(action_label)}</a></p>"
        f'<p style="color:#5B6178;font-size:14px">{escape(outro)}</p></div>'
    )
    return OutgoingEmail(to=to, subject=subject, text=text, html=html)

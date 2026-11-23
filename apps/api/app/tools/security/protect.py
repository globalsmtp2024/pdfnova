import secrets
from pathlib import Path

import pikepdf

from app.files.sniff import FileKind
from app.tools.base import (
    InputFile,
    InputSpec,
    JobContext,
    OutputFile,
    Tool,
    ToolCategory,
    ToolFailedError,
    ToolOptions,
)
from app.tools.batch import run_each
from app.tools.pdfkit import open_pdf, output_pdf, pdf_name, save_pdf

USER_KEY_NAME = "user_password"
OWNER_KEY_NAME = "owner_password"
MAX_PASSWORD_BYTES = 127


class ProtectOptions(ToolOptions):
    allow_print: bool = True
    allow_print_high_quality: bool = True
    allow_copy: bool = True
    allow_modify: bool = True
    allow_annotate: bool = True
    allow_fill_forms: bool = True
    allow_assemble: bool = True


def build_permissions(options: ProtectOptions) -> pikepdf.Permissions:
    return pikepdf.Permissions(
        accessibility=True,
        extract=options.allow_copy,
        modify_annotation=options.allow_annotate,
        modify_assembly=options.allow_assemble,
        modify_form=options.allow_fill_forms,
        modify_other=options.allow_modify,
        print_lowres=options.allow_print,
        print_highres=options.allow_print and options.allow_print_high_quality,
    )


def _check_password_length(value: str) -> None:
    if len(value.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ToolFailedError(
            f"Passwords can be at most {MAX_PASSWORD_BYTES} bytes long.", code="password_too_long"
        )


def verify_protected(path: Path, user_password: str) -> None:
    try:
        with pikepdf.open(path):
            pass
    except pikepdf.PasswordError:
        pass
    else:
        raise ToolFailedError("The protected file could not be verified.", code="protect_verify_failed")
    try:
        with pikepdf.open(path, password=user_password) as reopened:
            if not reopened.is_encrypted:
                raise ToolFailedError(
                    "The protected file could not be verified.", code="protect_verify_failed"
                )
    except pikepdf.PdfError as exc:
        raise ToolFailedError(
            "The protected file could not be verified.", code="protect_verify_failed"
        ) from exc


class ProtectTool(Tool[ProtectOptions]):
    slug = "protect"
    name = "Protect PDF"
    category = ToolCategory.SECURITY
    summary = "Add an open password and choose what readers may do, using AES-256 encryption."
    input_spec = InputSpec(
        min_files=1, max_files=100, accepted_kinds=frozenset({FileKind.PDF}), allow_encrypted_pdf=True
    )
    options_schema = ProtectOptions
    accepted_secrets = frozenset({USER_KEY_NAME, OWNER_KEY_NAME})
    required_secrets = frozenset({USER_KEY_NAME})
    seconds_per_page = 0.002

    def run(self, ctx: JobContext[ProtectOptions]) -> list[OutputFile]:
        user_password = ctx.secret(USER_KEY_NAME)
        owner_password = ctx.optional_secret(OWNER_KEY_NAME) or secrets.token_urlsafe(32)
        ctx.forget_secrets()
        _check_password_length(user_password)
        _check_password_length(owner_password)
        encryption = pikepdf.Encryption(
            user=user_password, owner=owner_password, R=6, aes=True, allow=build_permissions(ctx.options)
        )
        del owner_password

        def handle(item: InputFile, _: int) -> list[OutputFile]:
            target = ctx.output_path(pdf_name(f"{item.stem}-protected", "protected"))
            with open_pdf(item) as pdf:
                save_pdf(pdf, target, encryption=encryption)
            verify_protected(target, user_password)
            return [output_pdf(target)]

        return run_each(ctx, handle, "Protecting file")

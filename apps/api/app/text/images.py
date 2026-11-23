import base64
import binascii
import io
import zlib

from PIL import Image, UnidentifiedImageError

from app.core.errors import ToolInputError
from app.text.overlay import PreparedImage

MAX_IMAGE_PIXELS = 40_000_000
MAX_IMAGE_BYTES = 10 * 1024 * 1024
_PNG = b"\x89PNG\r\n\x1a\n"
_JPEG = b"\xff\xd8\xff"


def decode_image_data(value: str) -> bytes:
    payload = value.strip()
    if payload.startswith("data:"):
        header, _, payload = payload.partition(",")
        if "svg" in header.lower():
            raise _svg_error()
    try:
        data = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ToolInputError(
            "The watermark image could not be read.", hint="Upload a PNG or JPG file."
        ) from exc
    if len(data) > MAX_IMAGE_BYTES:
        raise ToolInputError("The watermark image is larger than 10 MB.", hint="Use a smaller PNG or JPG.")
    return data


def _svg_error() -> ToolInputError:
    return ToolInputError(
        "SVG images can't be used as watermarks.", hint="Export the image as PNG or JPG and upload that."
    )


def check_image(data: bytes) -> tuple[str, int, int]:
    head = data[:512].lstrip()
    if head.startswith(b"<") or b"<svg" in data[:2048].lower():
        raise _svg_error()
    if data.startswith(_PNG):
        expected = "PNG"
    elif data.startswith(_JPEG):
        expected = "JPEG"
    else:
        raise ToolInputError("Watermark images must be PNG or JPG.", hint="Convert the image and try again.")
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format != expected:
                raise ToolInputError("Watermark images must be PNG or JPG.")
            width, height = image.size
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ToolInputError("The watermark image is damaged or unsupported.") from exc
    if width < 1 or height < 1 or width * height > MAX_IMAGE_PIXELS:
        raise ToolInputError(
            "The watermark image has too many pixels.", hint="Use an image under 40 megapixels."
        )
    return expected, width, height


def prepare_image(data: bytes) -> PreparedImage:
    kind, _, _ = check_image(data)
    with Image.open(io.BytesIO(data)) as image:
        if kind == "JPEG" and image.mode in {"RGB", "L", "CMYK"}:
            space = {"RGB": "/DeviceRGB", "L": "/DeviceGray", "CMYK": "/DeviceCMYK"}[image.mode]
            return PreparedImage(
                width=image.width,
                height=image.height,
                data=data,
                color_space=space,  # type: ignore[arg-type]
                filter="/DCTDecode",
                decode_inverted=image.mode == "CMYK" and "adobe" in image.info,
            )
        has_alpha = image.mode in {"RGBA", "LA", "PA"} or (image.mode == "P" and "transparency" in image.info)
        converted = image.convert("RGBA" if has_alpha else "RGB")
    alpha: bytes | None = None
    if has_alpha:
        alpha_channel = converted.getchannel("A")
        if alpha_channel.getextrema() != (255, 255):
            alpha = zlib.compress(alpha_channel.tobytes(), 6)
        converted = converted.convert("RGB")
    return PreparedImage(
        width=converted.width,
        height=converted.height,
        data=zlib.compress(converted.tobytes(), 6),
        color_space="/DeviceRGB",
        filter="/FlateDecode",
        alpha=alpha,
    )

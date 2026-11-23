from dataclasses import dataclass
from functools import lru_cache

import uharfbuzz as hb

from app.text.bidi import Direction, visual_runs
from app.text.fonts import FontFace, FontKey, face_for


@dataclass(frozen=True)
class Glyph:
    gid: int
    text: str
    x: float
    y: float
    advance: float


@dataclass(frozen=True)
class ShapedRun:
    face: FontFace
    glyphs: tuple[Glyph, ...]
    width: float


@dataclass(frozen=True)
class ShapedLine:
    runs: tuple[ShapedRun, ...]
    width: float
    ascent: float
    descent: float


@lru_cache(maxsize=32)
def _hb_font(face: FontFace) -> hb.Font:
    return hb.Font(hb.Face(hb.Blob(face.data)))


def shape_run(text: str, face: FontFace, rtl: bool, size: float) -> ShapedRun:
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    buffer.direction = "rtl" if rtl else "ltr"
    buffer.cluster_level = hb.BufferClusterLevel.MONOTONE_CHARACTERS
    hb.shape(_hb_font(face), buffer, {"kern": True, "liga": True})
    scale = size / face.units_per_em
    infos = buffer.glyph_infos
    positions = buffer.glyph_positions
    clusters = sorted({info.cluster for info in infos})
    cluster_end = {start: end for start, end in zip(clusters, [*clusters[1:], len(text)], strict=True)}
    seen: set[int] = set()
    glyphs: list[Glyph] = []
    pen = 0.0
    order = list(zip(infos, positions, strict=True))
    for info, position in order:
        cluster = info.cluster
        piece = "" if cluster in seen else text[cluster : cluster_end[cluster]]
        seen.add(cluster)
        glyphs.append(
            Glyph(
                gid=info.codepoint,
                text=piece,
                x=pen + position.x_offset * scale,
                y=position.y_offset * scale,
                advance=position.x_advance * scale,
            )
        )
        pen += position.x_advance * scale
    return ShapedRun(face=face, glyphs=tuple(glyphs), width=pen)


def shape_line(text: str, key: FontKey, bold: bool, size: float, direction: Direction = "auto") -> ShapedLine:
    runs: list[ShapedRun] = []
    for run in visual_runs(text, direction):
        face = face_for(run.text, key, bold, run.rtl)
        runs.append(shape_run(run.text, face, run.rtl, size))
    faces = [run.face for run in runs] or [face_for(text or " ", key, bold, False)]
    ascent = max(face.ascent / face.units_per_em for face in faces) * size
    descent = max(-face.descent / face.units_per_em for face in faces) * size
    return ShapedLine(runs=tuple(runs), width=sum(run.width for run in runs), ascent=ascent, descent=descent)

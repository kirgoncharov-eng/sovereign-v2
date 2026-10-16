"""Offline font metadata maintenance (#113). Requires fonttools==4.61.1 and brotli==1.2.0.

Run from web: python scripts/font-notices.py. Never downloads/replaces font outlines.
The reviewed inventory records source hashes and is preserved on subsequent runs.
"""
import hashlib
import json
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
INVENTORY = ROOT / "assets/fonts/inventory.json"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def rendering_digest(font):
    """Every table except naming, checksums/timestamps and a no-longer-valid signature."""
    chunks = []
    for tag in sorted(font.reader.keys()):
        if tag not in {"name", "head", "DSIG"}:
            chunks.extend([tag.encode("ascii"), font.getTableData(tag)])
    # head also holds rendering-relevant units/bounds/flags: exclude only checksum and dates.
    head = bytearray(font.getTableData("head"))
    head[8:12] = bytes(4)
    head[20:36] = bytes(16)
    chunks.extend([b"head", bytes(head)])
    return digest(b"".join(chunks))


def primary_names(font, family, style):
    replacements = {
        1: family, 3: f"{family};{style};2.1.5-subset-1", 4: f"{family} {style}",
        5: "Version 2.1.5; Sovereign subset 1", 6: f"SovereignSerif-{style}",
        16: family, 17: style, 18: f"{family} {style}", 21: family, 22: style, 25: "SovereignSerif",
    }
    for record in font["name"].names:
        if record.nameID in replacements:
            record.string = replacements[record.nameID].encode(record.getEncoding())
    for name_id in [16, 17]:
        font["name"].setName(replacements[name_id], name_id, 3, 1, 0x409)


def update_font(path, previous):
    original = path.read_bytes()
    font = TTFont(path, lazy=True, recalcTimestamp=False)
    before_rendering = rendering_digest(font)
    family = "Liberation" if path.name.startswith("SovereignSerif") else "Handjet" if "handjet" in path.name else "Tiny5"
    license_path = ROOT / f"public/fonts/licenses/{family}.txt"
    license_text = license_path.read_text(encoding="utf-8")
    if family == "Liberation":
        primary_names(font, "Sovereign Serif", path.stem.split("-")[-1])
    # Windows/Unicode records make the complete notice inspectable inside embedded demo fonts.
    font["name"].removeNames(nameID=13)
    font["name"].setName(license_text, 13, 3, 1, 0x409)
    font["name"].setName(license_text, 13, 0, 4, 0)
    if "DSIG" in font:
        del font["DSIG"]
    font.save(path)
    font.close()
    updated = TTFont(path, lazy=True, recalcTimestamp=False)
    after_rendering = rendering_digest(updated)
    assert before_rendering == after_rendering, f"Rendering tables changed: {path}"
    relative = path.relative_to(ROOT).as_posix()
    prior = previous.get(relative, {})
    entry = {
        "file": relative, "upstreamFamily": family,
        "family": updated["name"].getDebugName(1), "version": updated["name"].getDebugName(5),
        "glyphs": len(updated.getGlyphOrder()), "characters": len(updated.getBestCmap()),
        "sourceSha256": prior.get("sourceSha256", digest(original)),
        "sha256": digest(path.read_bytes()), "renderingSha256": after_rendering,
        "license": f"public/fonts/licenses/{family}.txt",
    }
    updated.close()
    return entry


def main():
    previous = json.loads(INVENTORY.read_text()) if INVENTORY.exists() else []
    previous = {entry["file"]: entry for entry in previous}
    files = sorted([*(ROOT / "assets/fonts").glob("*.ttf"), *(ROOT / "public/fonts").glob("*.woff2")])
    entries = [update_font(path, previous) for path in files]
    INVENTORY.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(entries)} fonts: notices embedded; all rendering tables unchanged")


if __name__ == "__main__":
    main()

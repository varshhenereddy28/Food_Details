import re
from datetime import date

MONTHS = {name: index for index, name in enumerate(("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"), 1)}
DATE_PATTERN = re.compile(r"\b(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+[A-Z]{3,9}\s+\d{2,4}|[A-Z]{3,9}\s+\d{1,2}[ ,.-]+\d{2,4}|\d{1,2}[./-]\d{4})\b")


def normalize_year(value: int) -> int:
    return 2000 + value if value < 50 else 1900 + value if value < 100 else value


def iso(year: int, month: int, day: int = 1) -> str:
    return date(normalize_year(year), month, day).isoformat()


def parse_date(value: str) -> str | None:
    match = re.fullmatch(r"(\d{4})[./-](\d{1,2})[./-](\d{1,2})", value)
    if match:
        return iso(int(match[1]), int(match[2]), int(match[3]))
    match = re.fullmatch(r"(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})", value)
    if match:
        return iso(int(match[3]), int(match[2]), int(match[1]))
    match = re.fullmatch(r"(\d{1,2})\s+([A-Z]{3,9})\s+(\d{2,4})", value)
    if match and match[2][:3] in MONTHS:
        return iso(int(match[3]), MONTHS[match[2][:3]], int(match[1]))
    match = re.fullmatch(r"([A-Z]{3,9})\s+(\d{1,2})[ ,.-]+(\d{2,4})", value)
    if match and match[1][:3] in MONTHS:
        return iso(int(match[3]), MONTHS[match[1][:3]], int(match[2]))
    match = re.fullmatch(r"(\d{1,2})[./-](\d{4})", value)
    if match:
        return iso(int(match[2]), int(match[1]))
    return None


def extract_dates(raw_text: str) -> dict:
    text = re.sub(r"[^A-Z0-9./,: -]", " ", raw_text.upper().replace("|", "1"))
    found = []
    for value in DATE_PATTERN.findall(text):
        parsed = parse_date(value)
        if parsed is None:
            continue
        index = text.find(value)
        nearby = text[max(0, index - 24): index + len(value) + 8]
        expiry = bool(re.search(r"EXP|USE BY|BEST BEFORE", nearby))
        manufacturing = bool(re.search(r"MFD|MFG|PKD|MANUFACT", nearby))
        found.append({"date": parsed, "type": "expiry" if expiry else "manufacturing" if manufacturing else "unknown", "confidence": 0.92 if expiry or manufacturing else 0.68, "pattern": value})
    found.sort(key=lambda item: item["date"])
    expiry = next((item for item in found if item["type"] == "expiry"), None)
    manufacturing = next((item for item in found if item["type"] == "manufacturing"), None)
    if not expiry and len(found) > 1:
        return {"manufacturing": found[0]["date"], "expiry": found[-1]["date"], "confidence": 0.58, "candidates": found}
    return {"manufacturing": manufacturing["date"] if manufacturing else None, "expiry": expiry["date"] if expiry else None, "confidence": max([item["confidence"] for item in found], default=0), "candidates": found}

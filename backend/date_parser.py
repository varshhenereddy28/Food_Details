import re
from calendar import monthrange
from datetime import date

MONTHS = {name: index for index, name in enumerate(("JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"), 1)}
MONTH_NAME_PATTERN = r"(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)"
OCR_MONTH_ALIASES = {"0CT": "OCT", "N0V": "NOV", "0EC": "DEC"}
DATE_PATTERN = re.compile(
    r"\b(?:"
    r"\d{4}[./-]\d{1,2}[./-]\d{1,2}"
    r"|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}"
    r"|\d{1,2}[./-]\d{4}"
    r"|\d{1,2}[./-]\d{2}"
    rf"|\d{{1,2}}\s+{MONTH_NAME_PATTERN}\s+\d{{2,4}}"
    rf"|{MONTH_NAME_PATTERN}\s+\d{{1,2}}[ ,.-]+\d{{2,4}}"
    r")\b",
    re.IGNORECASE,
)
EXPIRY_RE = re.compile(r"EXP|USE\s*BY|BEST\s*BEFORE|BB|EXPIRE", re.IGNORECASE)
MANUFACTURING_RE = re.compile(r"MFG|MFD|PKD|PACKED|MANUFACTURED|BATCH", re.IGNORECASE)


def normalize_year(value: int) -> int:
    return 2000 + value if value < 50 else 1900 + value if value < 100 else value


def sanitize_ocr_token(value: str) -> str:
    token = value.strip().replace("|", "1")
    replacements = {"O": "0", "o": "0", "Q": "0", "q": "0", "I": "1", "i": "1", "L": "1", "l": "1", "S": "5", "s": "5", "B": "8", "b": "8", "Z": "2", "z": "2"}
    normalized = "".join(replacements.get(character, character) for character in token)
    for alias, month in OCR_MONTH_ALIASES.items():
        normalized = re.sub(rf"\b{alias}\b", month, normalized)
    return normalized


def sanitize_ocr_text(value: str) -> str:
    text = str(value or "").upper().replace("|", "1")
    replacements = {"O": "0", "Q": "0", "I": "1", "L": "1", "S": "5", "B": "8", "Z": "2"}
    for old, new in replacements.items():
        text = text.replace(old, new)
    for alias, month in OCR_MONTH_ALIASES.items():
        text = re.sub(rf"\b{alias}\b", month, text)
    return text


def iso(year: int, month: int, day: int = 1) -> str:
    normalized_year = normalize_year(year)
    return date(normalized_year, month, day).isoformat()


def parse_date(value: str, *, mode: str = "expiry") -> str | None:
    if value is None:
        return None
    cleaned = sanitize_ocr_token(value)
    if not cleaned:
        return None

    try:
        match = re.fullmatch(r"(\d{4})[./-](\d{1,2})[./-](\d{1,2})", cleaned)
        if match:
            return iso(int(match[1]), int(match[2]), int(match[3]))

        match = re.fullmatch(r"(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})", cleaned)
        if match:
            day = int(match[1])
            month = int(match[2])
            year = int(match[3])
            if day > 31 and month <= 12:
                day, month = month, day
            if month > 12 and day <= 12:
                month, day = day, month
            return iso(year, month, day)

        match = re.fullmatch(r"(\d{1,2})\s+([A-Z]{3,9})\s+(\d{2,4})", cleaned.upper())
        if match and match[2][:3].upper() in MONTHS:
            return iso(int(match[3]), MONTHS[match[2][:3].upper()], int(match[1]))

        match = re.fullmatch(r"([A-Z]{3,9})\s+(\d{1,2})[ ,.-]+(\d{2,4})", cleaned.upper())
        if match and match[1][:3].upper() in MONTHS:
            return iso(int(match[3]), MONTHS[match[1][:3].upper()], int(match[2]))

        match = re.fullmatch(r"(\d{1,2})[./-](\d{4})", cleaned)
        if match:
            month = int(match[1])
            year = int(match[2])
            day = monthrange(normalize_year(year), month)[1] if mode == "expiry" else 1
            return iso(year, month, day)

        match = re.fullmatch(r"(\d{1,2})[./-](\d{2})", cleaned)
        if match:
            month = int(match[1])
            year = int(match[2])
            day = monthrange(normalize_year(year), month)[1] if mode == "expiry" else 1
            return iso(year, month, day)

        match = re.fullmatch(r"(\d{1,2})[./-](\d{1,2})", cleaned)
        if match:
            month = int(match[1])
            year = int(match[2])
            if month > 12 and year <= 99:
                month, year = year, month
            day = monthrange(normalize_year(year), month)[1] if mode == "expiry" else 1
            return iso(year, month, day)

    except ValueError:
        return None

    return None


def classify_date_label(text: str, start: int, end: int) -> str:
    preceding = []
    following = []
    for label, pattern in (("manufacturing", MANUFACTURING_RE), ("expiry", EXPIRY_RE)):
        for match in pattern.finditer(text):
            if match.end() <= start:
                preceding.append((start - match.end(), label))
            elif match.start() >= end:
                following.append((match.start() - end, label))

    if preceding:
        return min(preceding, key=lambda item: item[0])[1]
    if following:
        return min(following, key=lambda item: item[0])[1]
    return "unknown"


def extract_dates(raw_text: str) -> dict:
    raw_text = re.sub(r"[^A-Z0-9./,: -]", " ", str(raw_text or "").upper().replace("|", "1"))
    text = sanitize_ocr_text(raw_text)
    found = []

    for match in DATE_PATTERN.finditer(text):
        value = match.group(0)
        candidate = sanitize_ocr_token(value)
        mode = classify_date_label(raw_text, match.start(), match.end())
        parsed = parse_date(candidate, mode=mode if mode != "unknown" else "expiry")
        if parsed is not None:
            found.append({"date": parsed, "type": mode, "confidence": 0.92 if mode in {"manufacturing", "expiry"} else 0.68, "pattern": value})

    if not found:
        return {"manufacturing": None, "expiry": None, "confidence": 0.0, "candidates": []}

    found.sort(key=lambda item: item["date"])
    expiry = next((item for item in found if item["type"] == "expiry"), None)
    manufacturing = next((item for item in found if item["type"] == "manufacturing"), None)

    if expiry is None and len(found) > 1:
        return {"manufacturing": found[0]["date"], "expiry": found[-1]["date"], "confidence": 0.58, "candidates": found}

    return {
        "manufacturing": manufacturing["date"] if manufacturing else None,
        "expiry": expiry["date"] if expiry else None,
        "confidence": max(item["confidence"] for item in found),
        "candidates": found,
    }

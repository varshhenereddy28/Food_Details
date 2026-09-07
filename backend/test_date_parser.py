from date_parser import extract_dates


def test_label_dates():
    cases = {
        "EXP 12/2026": "2026-12-01",
        "Best Before 05 DEC 26": "2026-12-05",
        "MFD: 03-09-2026": "2026-09-03",
        "USE BY 2026.12.05": "2026-12-05",
        "PKD 01/02/24": "2024-02-01",
        "BEST BEFORE MAR 9 2027": "2027-03-09",
    }
    for text, expected in cases.items():
        assert extract_dates(text)["candidates"][0]["date"] == expected


def test_unlabelled_dates():
    result = extract_dates("01/01/24 01/01/25")
    assert result["manufacturing"] == "2024-01-01"
    assert result["expiry"] == "2025-01-01"

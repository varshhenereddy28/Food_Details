from date_parser import extract_dates


def test_label_dates():
    cases = {
        "EXP 12/2026": "2026-12-31",
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


def test_expiry_only_and_ocr_sanitization():
    result = extract_dates("Best Before 11/26")
    assert result["expiry"] == "2026-11-30"

    result = extract_dates("EXP O8/2O26")
    assert result["expiry"] == "2026-08-31"


def test_manufacturing_and_expiry_ordering():
    result = extract_dates("MFG 15/02/2024 EXP 25/02/2024")
    assert result["manufacturing"] == "2024-02-15"
    assert result["expiry"] == "2024-02-25"


def test_dot_label_format_from_product_image():
    result = extract_dates("Mfg. Date : 17 Mar 2024 Exp. Date : 17 Mar 2027")
    assert result["manufacturing"] == "2024-03-17"
    assert result["expiry"] == "2027-03-17"


def test_common_packaged_food_label_formats():
    cases = [
        ("MFG 01/01/2025 EXP 01/01/2026", "2025-01-01", "2026-01-01"),
        ("MFD 12-02-24 USE BY 12-08-25", "2024-02-12", "2025-08-12"),
        ("PKD 2024.03.17 BEST BEFORE 2027.03.17", "2024-03-17", "2027-03-17"),
        ("PACKED: 05 APR 2024 BB 05 APR 2025", "2024-04-05", "2025-04-05"),
        ("MANUFACTURED 2024/05/06 EXPIRE 2026/05/06", "2024-05-06", "2026-05-06"),
        ("MFG 06 JUN 24 EXP 06 JUN 26", "2024-06-06", "2026-06-06"),
        ("MFG 07.07.2024 BEST BEFORE 07.07.2025", "2024-07-07", "2025-07-07"),
        ("MFD 08/2024 EXP 08/2026", "2024-08-01", "2026-08-31"),
        ("MFG 09-24 USE BY 09-26", "2024-09-01", "2026-09-30"),
        ("Mfg Date: 10 Oct 2024 Exp Date: 10 Oct 2026", "2024-10-10", "2026-10-10"),
    ]
    for text, manufacturing, expiry in cases:
        result = extract_dates(text)
        assert result["manufacturing"] == manufacturing, text
        assert result["expiry"] == expiry, text

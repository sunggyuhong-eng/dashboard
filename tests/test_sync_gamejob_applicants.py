from collections import Counter
from datetime import datetime, timezone

from scripts.sync_gamejob_applicants import (
    OpeningSummary,
    extract_application_dates,
    extract_opening_title,
    extract_total_applicants,
    is_transient_http_error,
    merge_data,
    normalize_application_date,
    parse_opening_text,
    project_from_title,
)


def test_gateway_page_is_not_treated_as_login_page():
    assert is_transient_http_error(502, "") is True
    assert is_transient_http_error(200, "502 Bad Gateway connection refused") is True
    assert is_transient_http_error(200, "기업회원 로그인") is False


def test_project_name_normalizes_octopus():
    assert project_from_title("[Project octopus] 시스템 기획자 모집") == "OTPS"
    assert project_from_title("[Server 실] 운영툴 개발자") == "Server실"


def test_parse_opening_card_reads_total_and_dates():
    card = """
    등록일 : 2026-09-21 | 수정일 : 2026-09-22 | 마감일 : 2026-12-20
    [Project octopus] 시스템 기획자 모집 (경력 2년 이상) (채용시 마감)
    모집분야 : 게임기획
    총 지원자 [20 명] | 미열람 이력서 [18 명]
    """
    item = parse_opening_text(card)
    assert item.title == "[Project octopus] 시스템 기획자 모집 (경력 2년 이상)"
    assert item.project == "OTPS"
    assert item.total == 20
    assert item.unread == 18
    assert item.deadline == "2026-12-20"


def test_application_dates_support_today_and_month_day():
    now = datetime(2026, 9, 22, 3, 0, tzinfo=timezone.utc)
    text = "[지원일] Today\n[지원일] 09/21\n[지원일] 2026-09-20"
    assert extract_application_dates(text, now) == ["2026-09-22", "2026-09-21", "2026-09-20"]
    assert normalize_application_date("12/31", now) == "2025-12-31"


def test_applicant_page_text_fallbacks_ignore_non_application_dates():
    now = datetime(2026, 9, 22, 3, 0, tzinfo=timezone.utc)
    body = """
    등록일 : 2026-09-21 | 수정일 : 2026-09-22 | 마감일 : 2026-12-20
    [Project octopus] 시스템 기획자 모집 (경력 2년 이상) (채용시 마감)
    총 지원자 [20 명] | 미열람 이력서 [20 명]
    [지원일] Today
    [지원일] 09/21
    """
    assert extract_opening_title(body) == "[Project octopus] 시스템 기획자 모집 (경력 2년 이상)"
    assert extract_total_applicants(body) == 20
    assert extract_application_dates(body, now) == ["2026-09-22", "2026-09-21"]


def test_merge_uses_exact_dates_without_personal_information():
    opening = OpeningSummary(
        id="gamejob-1", title="[OTPS] 기획자", project="OTPS", total=2, unread=1,
        posted_at="2026-09-20", modified_at="2026-09-21", deadline="2026-12-20",
        listing_page=1, card_index=0,
    )
    result = merge_data({}, [opening], {opening.id: Counter({"2026-09-21": 1, "2026-09-22": 1})}, datetime(2026, 9, 22, tzinfo=timezone.utc))
    assert result["openings"][0]["currentTotal"] == 2
    assert result["openings"][0]["applicationDatesComplete"] is True
    assert result["dailyApplications"] == [
        {"date": "2026-09-21", "openingId": "gamejob-1", "count": 1},
        {"date": "2026-09-22", "openingId": "gamejob-1", "count": 1},
    ]

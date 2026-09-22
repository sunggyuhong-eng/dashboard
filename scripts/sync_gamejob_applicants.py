from __future__ import annotations

import hashlib
import json
import os
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any
from urllib.parse import parse_qs, urlparse

if TYPE_CHECKING:
    from playwright.sync_api import Locator, Page

LOGIN_URL = "https://www.gamejob.co.kr/Login/Login_GI.asp"
COMPANY_TAB_XPATH = "/html/body/div[2]/div[2]/form/fieldset/div/div[2]/div[1]/ul/li[2]/input"
USER_XPATH = "/html/body/div/div/div[2]/form/fieldset/div/div[2]/div[2]/input[1]"
PASSWORD_XPATH = "/html/body/div/div/div[2]/form/fieldset/div/div[2]/div[2]/input[2]"
LOGIN_BUTTON_XPATH = "/html/body/div/div/div[2]/form/fieldset/div/div[2]/div[2]/button"
OPENING_TITLE_XPATH = "/html/body/div/table/tbody/tr/td/table[1]/tbody/tr/td[5]/form/table[3]/tbody/tr[2]/td/table/tbody/tr/td/a/font"
TOTAL_APPLICANTS_XPATH = "/html/body/div/table/tbody/tr/td/table[1]/tbody/tr/td[5]/form/table[5]/tbody/tr[4]/td[1]/a[1]/b/u"
APPLICATION_DATE_CELLS_XPATH = "/html/body/div/table/tbody/tr/td/table[1]/tbody/tr/td[5]/form/table[6]/tbody/tr/td[3]"
PAGINATION_FONTS_XPATH = "/html/body/div/table/tbody/tr/td/table[1]/tbody/tr/td[5]/form/table[7]/tbody/tr[3]/td/a/font"
KST = timezone(timedelta(hours=9))
ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "gamejob-opening-urls.json"
OUTPUT = ROOT / "public" / "data" / "gamejob-applicants.json"


@dataclass
class OpeningSummary:
    id: str
    title: str
    project: str
    total: int
    unread: int = 0
    posted_at: str = ""
    modified_at: str = ""
    deadline: str = ""
    listing_page: int = 1
    card_index: int = 0


def clean(value: object) -> str:
    return " ".join(str(value or "").replace("\xa0", " ").split())


def project_from_title(title: str) -> str:
    bracket = re.match(r"^\[([^]]+)]", clean(title))
    if not bracket:
        return "프로젝트 미지정"
    project = re.sub(r"^project\s+", "", bracket.group(1), flags=re.I).strip()
    if project.lower() in {"octopus", "otps"}:
        return "OTPS"
    return project.replace("Server 실", "Server실")


def stable_opening_id(title: str, href: str = "") -> str:
    query = parse_qs(urlparse(href).query)
    for key in ("GI_No", "gi_no", "GI_NO", "No", "no"):
        if query.get(key):
            return f"gamejob-{query[key][0]}"
    digest = hashlib.sha256(clean(title).lower().encode("utf-8")).hexdigest()[:16]
    return f"gamejob-{digest}"


def parse_opening_text(text: str, href: str = "", page_number: int = 1, card_index: int = 0) -> OpeningSummary:
    normalized = clean(text)
    title_match = re.search(r"(\[[^]]+]\s*[^\n]+?)(?:\s*\(채용시 마감\)|\s*모집분야\s*:)", text, re.S)
    if not title_match:
        title_match = re.search(r"(\[[^]]+]\s*.+?)(?=\s+(?:보기|수정|복사|마감|삭제|업데이트|총 지원자))", normalized)
    title = clean(title_match.group(1) if title_match else normalized)
    title = re.sub(r"\s*\(채용시 마감\)\s*$", "", title).strip()
    total_match = re.search(r"총\s*지원자\s*\[?\s*(\d+)\s*명", normalized)
    unread_match = re.search(r"미열람\s*이력서\s*\[?\s*(\d+)\s*명", normalized)
    dates = {label: re.search(rf"{label}\s*[:：]\s*(\d{{4}}[-./]\d{{2}}[-./]\d{{2}})", normalized) for label in ("등록일", "수정일", "마감일")}
    return OpeningSummary(
        id=stable_opening_id(title, href), title=title, project=project_from_title(title),
        total=int(total_match.group(1)) if total_match else 0,
        unread=int(unread_match.group(1)) if unread_match else 0,
        posted_at=dates["등록일"].group(1).replace(".", "-").replace("/", "-") if dates["등록일"] else "",
        modified_at=dates["수정일"].group(1).replace(".", "-").replace("/", "-") if dates["수정일"] else "",
        deadline=dates["마감일"].group(1).replace(".", "-").replace("/", "-") if dates["마감일"] else "",
        listing_page=page_number, card_index=card_index,
    )


def normalize_application_date(value: str, collected_at: datetime) -> str | None:
    source = clean(value)
    if not source:
        return None
    if source.lower() == "today" or source == "오늘":
        return collected_at.astimezone(KST).date().isoformat()
    full = re.search(r"(\d{4})[-./](\d{1,2})[-./](\d{1,2})", source)
    if full:
        return f"{int(full.group(1)):04d}-{int(full.group(2)):02d}-{int(full.group(3)):02d}"
    short = re.search(r"(?<!\d)(\d{1,2})[-./](\d{1,2})(?!\d)", source)
    if short:
        now = collected_at.astimezone(KST)
        month, day = int(short.group(1)), int(short.group(2))
        year = now.year - 1 if month > now.month + 1 else now.year
        return f"{year:04d}-{month:02d}-{day:02d}"
    return None


def extract_application_dates(text: str, collected_at: datetime) -> list[str]:
    values = re.findall(r"(?:\[지원일]\s*)?(Today|오늘|\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2})", text, flags=re.I)
    return [date for value in values if (date := normalize_application_date(value, collected_at))]


def load_opening_urls() -> list[str]:
    try:
        payload = json.loads(CONFIG.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("config/gamejob-opening-urls.json 파일을 읽지 못했습니다.") from error
    values = payload.get("urls") if isinstance(payload, dict) else payload
    if not isinstance(values, list):
        raise RuntimeError("게임잡 공고 URL 목록 형식이 올바르지 않습니다.")
    urls: list[str] = []
    for value in values:
        url = clean(value)
        parsed = urlparse(url)
        if parsed.scheme == "https" and parsed.netloc.lower() in {"gamejob.co.kr", "www.gamejob.co.kr"} and "EM_Apply_Applicant.asp" in parsed.path:
            urls.append(url)
    if not urls:
        raise RuntimeError("수집할 게임잡 지원자 관리 URL이 없습니다.")
    return list(dict.fromkeys(urls))


def navigate(page: Page, url: str, label: str) -> None:
    last_error: Exception | None = None
    for attempt in range(1, 3):
        try:
            page.goto(url, wait_until="commit", timeout=30_000)
            page.wait_for_timeout(1_500)
            if page.locator("body").count():
                return
        except Exception as error:
            last_error = error
            try:
                if page.url not in {"", "about:blank"} and page.locator("body").count() and clean(page.locator("body").inner_text()):
                    return
            except Exception:
                pass
        if attempt < 2:
            page.wait_for_timeout(3_000)
    raise RuntimeError(f"게임잡 {label} 페이지가 GitHub Actions 실행 서버에 응답하지 않았습니다. 주소: {url} / 오류: {type(last_error).__name__ if last_error else '응답 없음'}")


def first_visible(locators: list[Any]) -> Any:
    for locator in locators:
        try:
            if locator.count() and locator.first.is_visible():
                return locator.first
        except Exception:
            continue
    raise RuntimeError("게임잡 로그인 입력 요소를 찾지 못했습니다.")


def login(page: Page, user_id: str, password: str) -> None:
    navigate(page, LOGIN_URL, "로그인")
    company = first_visible([page.locator(f"xpath={COMPANY_TAB_XPATH}"), page.locator('input[value*="기업"]')])
    company.click()
    user = first_visible([page.locator(f"xpath={USER_XPATH}"), page.locator('input[type="text"]')])
    secret = first_visible([page.locator(f"xpath={PASSWORD_XPATH}"), page.locator('input[type="password"]')])
    button = first_visible([page.locator(f"xpath={LOGIN_BUTTON_XPATH}"), page.get_by_role("button", name=re.compile("로그인"))])
    user.fill(user_id)
    secret.fill(password)
    button.click(no_wait_after=True)
    page.wait_for_timeout(3_000)


def read_text(locator: Locator, label: str, url: str) -> str:
    try:
        locator.first.wait_for(state="visible", timeout=30_000)
        return clean(locator.first.inner_text())
    except Exception as error:
        raise RuntimeError(f"{label} XPath를 찾지 못했습니다. 공고 주소: {url}") from error


def collect_dates_on_page(page: Page, collected_at: datetime) -> list[str]:
    cells = page.locator(f"xpath={APPLICATION_DATE_CELLS_XPATH}")
    dates: list[str] = []
    for index in range(cells.count()):
        value = normalize_application_date(cells.nth(index).inner_text(), collected_at)
        if value:
            dates.append(value)
    return dates


def move_to_applicant_page(page: Page, page_number: int, opening_url: str) -> None:
    fonts = page.locator(f"xpath={PAGINATION_FONTS_XPATH}")
    target = None
    for index in range(fonts.count()):
        font = fonts.nth(index)
        if clean(font.inner_text()) == str(page_number):
            target = font.locator("xpath=parent::a")
            break
    if target is None:
        raise RuntimeError(f"지원자 목록 {page_number}페이지 링크를 찾지 못했습니다. 공고 주소: {opening_url}")
    target.click(no_wait_after=True)
    page.wait_for_timeout(2_000)


def collect_opening(page: Page, url: str, collected_at: datetime) -> tuple[OpeningSummary, Counter[str], bool]:
    navigate(page, url, "지원자 관리")
    if "Login" in page.url or "로그인" in clean(page.locator("body").inner_text())[:200]:
        raise RuntimeError("게임잡 로그인이 유지되지 않아 지원자 관리 화면으로 이동하지 못했습니다.")
    title = read_text(page.locator(f"xpath={OPENING_TITLE_XPATH}"), "공고명", url)
    total_text = read_text(page.locator(f"xpath={TOTAL_APPLICANTS_XPATH}"), "총 지원자 수", url)
    total_match = re.search(r"\d+", total_text)
    if not total_match:
        raise RuntimeError(f"총 지원자 수에서 숫자를 읽지 못했습니다. 표시값: {total_text}")
    total = int(total_match.group())
    opening = OpeningSummary(id=stable_opening_id(title, url), title=title, project=project_from_title(title), total=total)
    dates = collect_dates_on_page(page, collected_at)
    pages = max(1, (total + 9) // 10)
    for page_number in range(2, pages + 1):
        move_to_applicant_page(page, page_number, url)
        dates.extend(collect_dates_on_page(page, collected_at))
    return opening, Counter(dates), total == 0 or len(dates) >= total


def load_existing() -> dict[str, Any]:
    try:
        data = json.loads(OUTPUT.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def merge_data(existing: dict[str, Any], openings: list[OpeningSummary], exact_dates: dict[str, Counter[str]], collected_at: datetime) -> dict[str, Any]:
    old_openings = {str(item.get("id")): item for item in existing.get("openings", []) if isinstance(item, dict)}
    daily_map: dict[tuple[str, str], int] = {}
    for item in existing.get("dailyApplications", []):
        if isinstance(item, dict) and item.get("date") and item.get("openingId"):
            daily_map[(str(item["date"]), str(item["openingId"]))] = max(0, int(item.get("count") or 0))
    today = collected_at.astimezone(KST).date().isoformat()
    output_openings: list[dict[str, Any]] = []
    for opening in openings:
        counts = exact_dates.get(opening.id, Counter())
        for date, count in counts.items():
            daily_map[(date, opening.id)] = count
        if not counts:
            delta = max(0, opening.total - int(old_openings.get(opening.id, {}).get("currentTotal") or 0))
            if delta:
                daily_map[(today, opening.id)] = daily_map.get((today, opening.id), 0) + delta
        output_openings.append({
            "id": opening.id, "title": opening.title, "project": opening.project,
            "currentTotal": opening.total, "unreadTotal": opening.unread,
            "postedAt": "", "modifiedAt": "", "deadline": "",
            "applicationDatesComplete": sum(counts.values()) >= opening.total if opening.total else True,
        })
    return {
        "version": 1, "syncedAt": collected_at.isoformat(), "source": "gamejob",
        "openings": sorted(output_openings, key=lambda item: (item["project"], item["title"])),
        "dailyApplications": [{"date": date, "openingId": opening_id, "count": count} for (date, opening_id), count in sorted(daily_map.items())],
    }


def main() -> int:
    from playwright.sync_api import sync_playwright
    user_id = os.getenv("GAMEJOB_ID", "").strip()
    password = os.getenv("GAMEJOB_PASSWORD", "").strip()
    if not user_id or not password:
        raise RuntimeError("GAMEJOB_ID 또는 GAMEJOB_PASSWORD GitHub Secret이 없습니다.")
    urls = load_opening_urls()
    collected_at = datetime.now(timezone.utc)
    openings: list[OpeningSummary] = []
    exact_dates: dict[str, Counter[str]] = {}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--disable-dev-shm-usage"])
        context = browser.new_context(locale="ko-KR", timezone_id="Asia/Seoul", user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36", service_workers="block")
        page = context.new_page()
        page.route("**/*", lambda route: route.abort() if route.request.resource_type in {"image", "media", "font"} else route.continue_())
        login(page, user_id, password)
        for index, url in enumerate(urls, start=1):
            opening, counts, complete = collect_opening(page, url, collected_at)
            openings.append(opening)
            exact_dates[opening.id] = counts
            print(f"[{index}/{len(urls)}] {opening.title}: 총 {opening.total}명 / 지원일 {sum(counts.values())}건 / 완전={complete}")
        context.close()
        browser.close()
    data = merge_data(load_existing(), openings, exact_dates, collected_at)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"지정된 게임잡 공고 {len(openings)}건의 지원자 추이를 저장했습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

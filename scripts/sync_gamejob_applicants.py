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
MANAGE_URL = "https://www.gamejob.co.kr/Text_Co/EM_GI_Mng.asp"
COMPANY_TAB_XPATH = "/html/body/div[2]/div[2]/form/fieldset/div/div[2]/div[1]/ul/li[2]/input"
USER_XPATH = "/html/body/div/div/div[2]/form/fieldset/div/div[2]/div[2]/input[1]"
PASSWORD_XPATH = "/html/body/div/div/div[2]/form/fieldset/div/div[2]/div[2]/input[2]"
LOGIN_BUTTON_XPATH = "/html/body/div/div/div[2]/form/fieldset/div/div[2]/div[2]/button"
KST = timezone(timedelta(hours=9))
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "data" / "gamejob-applicants.json"


@dataclass
class OpeningSummary:
    id: str
    title: str
    project: str
    total: int
    unread: int
    posted_at: str
    modified_at: str
    deadline: str
    listing_page: int
    card_index: int


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
    title = clean(title_match.group(1) if title_match else "")
    title = re.sub(r"\s*\(채용시 마감\)\s*$", "", title).strip()
    if not title:
        raise ValueError("공고 카드에서 공고 제목을 찾지 못했습니다.")
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
    full = re.fullmatch(r"(\d{4})[-./](\d{1,2})[-./](\d{1,2})", source)
    if full:
        return f"{int(full.group(1)):04d}-{int(full.group(2)):02d}-{int(full.group(3)):02d}"
    short = re.fullmatch(r"(\d{1,2})[-./](\d{1,2})", source)
    if short:
        now = collected_at.astimezone(KST)
        month, day = int(short.group(1)), int(short.group(2))
        year = now.year - 1 if month > now.month + 1 else now.year
        return f"{year:04d}-{month:02d}-{day:02d}"
    return None


def extract_application_dates(text: str, collected_at: datetime) -> list[str]:
    values = re.findall(r"\[지원일]\s*(Today|오늘|\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2})", text, flags=re.I)
    return [date for value in values if (date := normalize_application_date(value, collected_at))]


def _first_visible(locators: list[Any]) -> Any:
    for locator in locators:
        try:
            if locator.count() and locator.first.is_visible():
                return locator.first
        except Exception:
            continue
    raise RuntimeError("게임잡 로그인 입력 요소를 찾지 못했습니다. 로그인 화면 구조를 확인해 주세요.")


def login(page: Page, user_id: str, password: str) -> None:
    page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60_000)
    company_tab = _first_visible([
        page.locator(f"xpath={COMPANY_TAB_XPATH}"),
        page.get_by_text("기업회원", exact=False),
    ])
    company_tab.click()
    user = _first_visible([
        page.locator(f"xpath={USER_XPATH}"),
        page.locator('input[type="text"]'),
        page.locator('input[name*="id" i]'),
    ])
    secret = _first_visible([
        page.locator(f"xpath={PASSWORD_XPATH}"),
        page.locator('input[type="password"]'),
    ])
    button = _first_visible([
        page.locator(f"xpath={LOGIN_BUTTON_XPATH}"),
        page.get_by_role("button", name=re.compile("로그인")),
    ])
    user.fill(user_id)
    secret.fill(password)
    button.click()
    try:
        page.wait_for_load_state("domcontentloaded", timeout=30_000)
    except Exception:
        pass
    page.goto(MANAGE_URL, wait_until="domcontentloaded", timeout=60_000)
    try:
        page.get_by_text(re.compile(r"총\s*지원자")).first.wait_for(state="visible", timeout=20_000)
    except Exception:
        body = clean(page.locator("body").inner_text())
        current_url = page.url
        if "로그인" in body or "Login" in current_url:
            raise RuntimeError("게임잡 기업회원 로그인에 실패했거나 추가 인증이 필요합니다.")
        raise RuntimeError(f"게임잡 공고관리 화면은 열렸지만 총 지원자 영역이 나타나지 않았습니다. 현재 주소: {current_url}")


CARD_SCRIPT = r"""
() => {
  const result = [];
  const seen = new Set();
  const cells = Array.from(document.querySelectorAll('td')).filter(td => /총\s*지원자/.test(td.innerText || ''));
  for (const cell of cells) {
    const numericAnchors = Array.from(cell.querySelectorAll('a')).filter(anchor => {
      const own = (anchor.innerText || '').replace(/[\[\]\s명]/g, '');
      return /^\d+$/.test(own);
    });
    const anchor = numericAnchors[0];
    if (!anchor || seen.has(anchor)) continue;
    seen.add(anchor);
    let node = anchor;
    let card = null;
    while (node && node !== document.body) {
      const text = (node.innerText || '').replace(/\s+/g, ' ');
      if (/모집분야/.test(text) && /총\s*지원자/.test(text) && /채용시\s*마감/.test(text)) { card = node; break; }
      node = node.parentElement;
    }
    if (!card) continue;
    card.dataset.gamejobOpeningIndex = String(result.length);
    anchor.dataset.gamejobApplicantLink = String(result.length);
    result.push({ text: card.innerText || '', href: anchor.href || '', index: result.length });
  }
  return result;
}
"""


def find_exact_link(page: Page, label: str) -> Locator | None:
    links = page.locator("a")
    for index in range(links.count()):
        link = links.nth(index)
        try:
            if clean(link.inner_text()) == label and link.is_visible():
                href = clean(link.get_attribute("href"))
                if "EM_GI" in href or "page" in href.lower() or href.lower().startswith("javascript"):
                    return link
        except Exception:
            continue
    return None


def goto_listing_page(page: Page, page_number: int) -> None:
    page.goto(MANAGE_URL, wait_until="domcontentloaded", timeout=60_000)
    for number in range(2, page_number + 1):
        link = find_exact_link(page, str(number))
        if link is None:
            raise RuntimeError(f"게임잡 공고 목록 {number}페이지 버튼을 찾지 못했습니다.")
        link.click()
        page.wait_for_load_state("domcontentloaded", timeout=30_000)


def collect_opening_pages(page: Page) -> list[OpeningSummary]:
    openings: list[OpeningSummary] = []
    seen: set[str] = set()
    page_number = 1
    while page_number <= 50:
        if page_number > 1:
            goto_listing_page(page, page_number)
        cards: list[dict[str, Any]] = page.evaluate(CARD_SCRIPT)
        if not cards:
            if page_number == 1:
                raise RuntimeError("게임잡 공고 카드에서 총 지원자 정보를 찾지 못했습니다.")
            break
        added = 0
        for card in cards:
            summary = parse_opening_text(card["text"], card.get("href", ""), page_number, int(card["index"]))
            if summary.id in seen:
                continue
            seen.add(summary.id)
            openings.append(summary)
            added += 1
        next_link = find_exact_link(page, str(page_number + 1))
        if next_link is None or added == 0:
            break
        page_number += 1
    return openings


def select_largest_page_size(page: Page) -> None:
    selects = page.locator("select")
    for index in range(selects.count()):
        select = selects.nth(index)
        try:
            options = select.locator("option")
            numeric: list[tuple[int, str]] = []
            for option_index in range(options.count()):
                option = options.nth(option_index)
                label = clean(option.inner_text())
                value = clean(option.get_attribute("value"))
                if label.isdigit():
                    numeric.append((int(label), value or label))
            if numeric and max(number for number, _ in numeric) >= 10:
                select.select_option(max(numeric)[1])
                page.wait_for_load_state("domcontentloaded", timeout=15_000)
                return
        except Exception:
            continue


def collect_opening_dates(page: Page, opening: OpeningSummary, collected_at: datetime) -> tuple[Counter[str], bool]:
    goto_listing_page(page, opening.listing_page)
    page.evaluate(CARD_SCRIPT)
    link = page.locator(f'[data-gamejob-applicant-link="{opening.card_index}"]')
    if not link.count():
        return Counter(), False
    link.first.click()
    try:
        page.wait_for_load_state("domcontentloaded", timeout=30_000)
    except Exception:
        pass
    select_largest_page_size(page)
    dates: list[str] = []
    candidate_page = 1
    while candidate_page <= 100:
        text = page.locator("body").inner_text()
        dates.extend(extract_application_dates(text, collected_at))
        if len(dates) >= opening.total:
            break
        next_link = find_exact_link(page, str(candidate_page + 1))
        if next_link is None:
            break
        next_link.click()
        page.wait_for_load_state("domcontentloaded", timeout=30_000)
        candidate_page += 1
    return Counter(dates), opening.total == 0 or len(dates) >= opening.total


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
    snapshot_date = collected_at.astimezone(KST).date().isoformat()
    output_openings: list[dict[str, Any]] = []
    for opening in openings:
        previous = old_openings.get(opening.id, {})
        counts = exact_dates.get(opening.id, Counter())
        for date, count in counts.items():
            daily_map[(date, opening.id)] = count
        if not counts:
            previous_total = int(previous.get("currentTotal") or 0)
            delta = max(0, opening.total - previous_total)
            if delta:
                daily_map[(snapshot_date, opening.id)] = daily_map.get((snapshot_date, opening.id), 0) + delta
        output_openings.append({
            "id": opening.id, "title": opening.title, "project": opening.project,
            "currentTotal": opening.total, "unreadTotal": opening.unread,
            "postedAt": opening.posted_at, "modifiedAt": opening.modified_at, "deadline": opening.deadline,
            "applicationDatesComplete": sum(counts.values()) >= opening.total if opening.total else True,
        })
    valid_ids = {opening.id for opening in openings} | set(old_openings)
    daily = [
        {"date": date, "openingId": opening_id, "count": count}
        for (date, opening_id), count in sorted(daily_map.items())
        if opening_id in valid_ids
    ]
    return {
        "version": 1,
        "syncedAt": collected_at.isoformat(),
        "source": "gamejob",
        "openings": sorted(output_openings, key=lambda item: (item["project"], item["title"])),
        "dailyApplications": daily,
    }


def main() -> int:
    from playwright.sync_api import sync_playwright
    user_id = os.getenv("GAMEJOB_ID", "").strip()
    password = os.getenv("GAMEJOB_PASSWORD", "").strip()
    if not user_id or not password:
        raise RuntimeError("GAMEJOB_ID 또는 GAMEJOB_PASSWORD GitHub Secret이 없습니다.")
    collected_at = datetime.now(timezone.utc)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(locale="ko-KR", timezone_id="Asia/Seoul", user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36")
        page = context.new_page()
        login(page, user_id, password)
        openings = collect_opening_pages(page)
        exact_dates: dict[str, Counter[str]] = {}
        for index, opening in enumerate(openings, start=1):
            try:
                dates, complete = collect_opening_dates(page, opening, collected_at)
                exact_dates[opening.id] = dates
                print(f"[{index}/{len(openings)}] {opening.title}: {opening.total}명, 지원일 {sum(dates.values())}건, 완전={complete}")
            except Exception as error:
                print(f"[{index}/{len(openings)}] {opening.title}: 지원일 상세 수집 생략 ({type(error).__name__})")
        context.close()
        browser.close()
    data = merge_data(load_existing(), openings, exact_dates, collected_at)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"게임잡 공고 {len(openings)}건의 집계 데이터를 저장했습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

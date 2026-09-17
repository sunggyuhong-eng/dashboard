from __future__ import annotations

import json
import os
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

LIST_URL = "https://www.gamejob.co.kr/Recruit/joblist?menucode=searchdetail"
PAGE_URL = "https://www.gamejob.co.kr/Recruit/_GI_Job_List/"
COMPANY_KEYWORDS = ("콩스튜디오코리아", "kong studios korea")


def text(node, selector: str) -> str:
    found = node.select_one(selector)
    return found.get_text(" ", strip=True) if found else ""


def date_value(value: str) -> str:
    match = re.search(r"(\d{1,2})[./-](\d{1,2})", value or "")
    return f"{datetime.now().year}-{int(match.group(1)):02d}-{int(match.group(2)):02d}" if match else ""


def parse_rows(html: str, base_url: str) -> list[dict[str, str]]:
    jobs: list[dict[str, str]] = []
    soup = BeautifulSoup(html, "html.parser")
    for row in soup.select("table.tblList tbody tr"):
        link = row.select_one(".tit a[href*='GI_No']")
        company = text(row, ".company strong")
        if not link or not link.get("href") or not any(key in company.lower() for key in COMPANY_KEYWORDS):
            continue
        url = urljoin(base_url, str(link["href"]))
        query = parse_qs(urlparse(url).query)
        gi_no = (query.get("GI_No") or query.get("gi_no") or [""])[0]
        if not gi_no:
            match = re.search(r"GI_No=(\d+)", url, re.I)
            gi_no = match.group(1) if match else ""
        if not gi_no:
            continue
        title_node = row.select_one(".tit a strong") or link
        deadline_text = text(row, "span.date")
        jobs.append({
            "id": f"gamejob-{gi_no}",
            "title": title_node.get_text(" ", strip=True),
            "url": url,
            "postedAt": date_value(text(row, ".modifyDate")),
            "deadline": "" if "상시" in deadline_text or "채용시" in deadline_text else date_value(deadline_text),
        })
    return jobs


def collect() -> list[dict[str, str]]:
    headers = {"User-Agent": "KongStudios-Recruiting-Dashboard/1.0", "Accept-Language": "ko-KR,ko;q=0.9"}
    found: dict[str, dict[str, str]] = {}
    with httpx.Client(headers=headers, timeout=30, follow_redirects=True) as client:
        for page in range(1, 81):
            if page == 1:
                response = client.get(LIST_URL)
            else:
                response = client.post(PAGE_URL, data={"condition[menucode]": "searchdetail", "page": str(page), "direct": "0", "order": "1", "pagesize": "40", "tabcode": "1"}, headers={"Referer": LIST_URL, "X-Requested-With": "XMLHttpRequest"})
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")
            if not soup.select("table.tblList tbody tr"):
                break
            for job in parse_rows(response.text, str(response.url)):
                found[job["id"]] = job
            time.sleep(0.35)
    return sorted(found.values(), key=lambda item: item["id"])


def build_dashboard(jobs: list[dict[str, str]], sheet_data: dict) -> tuple[dict, int]:
    candidates_by_title: dict[str, list[dict]] = defaultdict(list)
    for candidate in sheet_data.get("candidates", []):
        title = str(candidate.get("openingTitle") or "").strip()
        if title:
            candidates_by_title[title].append(candidate)
    hired_counts = sheet_data.get("hiredCounts") if isinstance(sheet_data.get("hiredCounts"), dict) else {}

    openings = []
    current_titles = {job["title"].strip() for job in jobs}
    for job in jobs:
        title = job["title"].strip()
        candidates = candidates_by_title.get(title, [])
        project = next((str(item.get("project") or "").strip() for item in candidates if item.get("project")), "")
        openings.append({
            **job,
            "source": "gamejob",
            "status": "진행중",
            "project": project,
            "targetTo": 0,
            "hiredCount": int(hired_counts.get(title, 0) or 0),
            "reason": "",
            "candidates": candidates,
        })

    dashboard = {
        "openings": openings,
        "candidateCount": sum(len(opening["candidates"]) for opening in openings),
        "syncedAt": datetime.now(timezone.utc).isoformat(),
    }
    unmatched = sum(len(items) for title, items in candidates_by_title.items() if title not in current_titles)
    return dashboard, unmatched


def main() -> int:
    jobs = collect()
    if not jobs:
        raise RuntimeError("콩스튜디오코리아 공고를 찾지 못해 기존 상태를 유지합니다.")
    if "--dry-run" in sys.argv:
        print(json.dumps(jobs, ensure_ascii=False, indent=2))
        return 0
    endpoint, token = os.getenv("SHEET_API_URL", ""), os.getenv("SHEET_API_TOKEN", "")
    if not endpoint or not token:
        raise RuntimeError("SHEET_API_URL 또는 SHEET_API_TOKEN Secret이 없습니다.")
    response = httpx.post(endpoint, content=json.dumps({"action": "dashboard", "token": token}, ensure_ascii=False).encode(), headers={"Content-Type": "text/plain;charset=utf-8"}, timeout=60, follow_redirects=True)
    response.raise_for_status()
    sheet_data = response.json()
    if not sheet_data.get("ok") or not isinstance(sheet_data.get("candidates"), list):
        raise RuntimeError(sheet_data.get("error") or "지원자 데이터를 가져오지 못했습니다.")

    dashboard, unmatched = build_dashboard(jobs, sheet_data)
    output = Path(__file__).resolve().parents[1] / "public" / "data" / "dashboard.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(dashboard, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"게임잡 공고 {len(jobs)}건과 진행 지원자 {dashboard['candidateCount']}명을 결합했습니다. 제목 불일치 지원자 {unmatched}명")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

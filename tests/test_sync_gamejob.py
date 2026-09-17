from scripts.sync_gamejob import build_dashboard, parse_rows


def test_parse_rows_filters_kong_and_uses_gamejob_id():
    html = '''<table class="tblList"><tbody>
      <tr><td class="company"><strong>㈜콩스튜디오코리아</strong></td><td class="tit"><a href="/Recruit/GI_Read/View?GI_No=284942"><strong>[Project MAZE] Dev PM 모집</strong></a><span class="modifyDate">09/17</span></td><td><span class="date">09/30</span></td></tr>
      <tr><td class="company"><strong>다른회사</strong></td><td class="tit"><a href="/Recruit/GI_Read/View?GI_No=1"><strong>제외</strong></a></td></tr>
    </tbody></table>'''
    jobs = parse_rows(html, "https://www.gamejob.co.kr")
    assert jobs == [{"id": "gamejob-284942", "title": "[Project MAZE] Dev PM 모집", "url": "https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=284942", "postedAt": "2026-09-17", "deadline": "2026-09-30"}]


def test_build_dashboard_only_joins_current_gamejob_openings():
    jobs = [{"id": "gamejob-1", "title": "소프트웨어 엔지니어", "url": "https://example.com/1", "postedAt": "2026-09-17", "deadline": "2026-10-01"}]
    sheet_data = {
        "candidates": [
            {"id": "row-1", "row": 1, "name": "지원자A", "stage": "코딩테스트", "project": "MAZE", "openingTitle": "소프트웨어 엔지니어"},
            {"id": "row-2", "row": 2, "name": "지원자B", "stage": "면접", "project": "ZERO", "openingTitle": "종료된 공고"},
        ],
        "hiredCounts": {"소프트웨어 엔지니어": 1},
    }
    dashboard, unmatched = build_dashboard(jobs, sheet_data)
    assert dashboard["candidateCount"] == 1
    assert dashboard["openings"][0]["hiredCount"] == 1
    assert dashboard["openings"][0]["project"] == "MAZE"
    assert dashboard["openings"][0]["candidates"][0]["name"] == "지원자A"
    assert unmatched == 1

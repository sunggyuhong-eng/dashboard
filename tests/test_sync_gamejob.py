from scripts.sync_gamejob import parse_rows


def test_parse_rows_filters_kong_and_uses_gamejob_id():
    html = '''<table class="tblList"><tbody>
      <tr><td class="company"><strong>㈜콩스튜디오코리아</strong></td><td class="tit"><a href="/Recruit/GI_Read/View?GI_No=284942"><strong>[Project MAZE] Dev PM 모집</strong></a><span class="modifyDate">09/17</span></td><td><span class="date">09/30</span></td></tr>
      <tr><td class="company"><strong>다른회사</strong></td><td class="tit"><a href="/Recruit/GI_Read/View?GI_No=1"><strong>제외</strong></a></td></tr>
    </tbody></table>'''
    jobs = parse_rows(html, "https://www.gamejob.co.kr")
    assert jobs == [{"id": "gamejob-284942", "title": "[Project MAZE] Dev PM 모집", "url": "https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=284942", "postedAt": "2026-09-17", "deadline": "2026-09-30"}]

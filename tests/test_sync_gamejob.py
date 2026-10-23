from scripts.sync_gamejob import (
    build_dashboard,
    opening_id,
    opening_key,
)


def test_opening_key_normalizes_project_and_title():
    assert opening_key(" MAZE ", "Software   Engineer ") == opening_key("maze", "software engineer")


def test_opening_id_is_stable_for_same_opening():
    assert opening_id("MAZE", "Dev PM") == opening_id(" maze ", "dev  pm")


def test_build_dashboard_uses_to_sheet_as_opening_master():
    sheet_data = {
        "openings": [
            {"row": 2, "project": "MAZE", "title": "Software Engineer", "targetTo": 3, "reason": "신규 채용"},
            {"row": 3, "project": "ZERO", "title": "Client Engineer", "targetTo": 2, "reason": "대체 채용"},
        ],
        "candidates": [
            {"id": "row-1", "row": 1, "name": "지원자A", "stage": "코딩테스트", "project": "MAZE", "openingTitle": "Software Engineer"},
            {"id": "row-2", "row": 2, "name": "지원자B", "stage": "면접", "project": "ZERO", "openingTitle": "종료된 공고"},
        ],
        "hiredCounts": {opening_key("MAZE", "Software Engineer"): 1},
        "applications": [
            {"date": "2026-09-15", "source": "그리팅", "project": "MAZE", "openingTitle": "Software Engineer"},
        ],
    }

    dashboard, unmatched = build_dashboard(sheet_data)

    assert len(dashboard["openings"]) == 2
    maze = next(item for item in dashboard["openings"] if item["project"] == "MAZE")
    assert maze["source"] == "sheet"
    assert maze["targetTo"] == 3
    assert maze["reason"] == "신규 채용"
    assert maze["hiredCount"] == 1
    assert maze["candidates"][0]["name"] == "지원자A"
    assert "applications" not in dashboard
    assert unmatched == 1


def test_build_dashboard_keeps_opening_without_active_candidates():
    sheet_data = {
        "openings": [{"project": "OTPS", "title": "시스템 기획자", "targetTo": 1, "reason": "증원"}],
        "candidates": [],
        "hiredCounts": {},
    }

    dashboard, unmatched = build_dashboard(sheet_data)

    assert dashboard["openings"][0]["title"] == "시스템 기획자"
    assert dashboard["openings"][0]["candidates"] == []
    assert dashboard["candidateCount"] == 0
    assert unmatched == 0


def test_new_badge_only_marks_openings_added_since_previous_sync():
    existing_id = opening_id("MAZE", "Dev PM")
    sheet_data = {
        "openings": [
            {"project": "MAZE", "title": "Dev PM", "targetTo": 1, "reason": "증원"},
            {"project": "ZERO", "title": "Client Engineer", "targetTo": 1, "reason": "신규"},
        ],
        "candidates": [],
        "hiredCounts": {},
    }

    dashboard, _ = build_dashboard(sheet_data, {existing_id})

    flags = {item["title"]: item["isNew"] for item in dashboard["openings"]}
    assert flags == {"Dev PM": False, "Client Engineer": True}

    next_dashboard, _ = build_dashboard(sheet_data, {item["id"] for item in dashboard["openings"]})
    assert all(item["isNew"] is False for item in next_dashboard["openings"])


def test_approval_links_follow_each_opening_and_keep_ids_when_links_change():
    data = {"openings": [
        {"project": "QA실", "title": "QA 담당자", "approvalUrl": "https://example.com/approval/qa"},
        {"project": "HERO", "title": "QA 담당자", "approvalUrl": "https://example.com/approval/hero"},
    ], "candidates": []}
    dashboard, _ = build_dashboard(data)
    links = {item["project"]: item["approvalUrl"] for item in dashboard["openings"]}
    assert links == {"QA실": "https://example.com/approval/qa", "HERO": "https://example.com/approval/hero"}
    old_ids = {item["id"] for item in dashboard["openings"]}
    data["openings"][0]["approvalUrl"] = ""
    changed, _ = build_dashboard(data, old_ids)
    assert {item["id"] for item in changed["openings"]} == old_ids
    assert not any(item["isNew"] for item in changed["openings"])
    assert next(item for item in changed["openings"] if item["project"] == "QA실")["approvalUrl"] == ""


def test_approval_link_is_optional_and_rejects_non_web_addresses():
    for url in [None, "", "javascript:alert(1)", "//example.com/approval", "https://", "https://example.com/one\ntwo"]:
        dashboard, _ = build_dashboard({"openings": [{"project": "QA실", "title": "QA 담당자", "approvalUrl": url}], "candidates": []})
        assert dashboard["openings"][0]["approvalUrl"] == ""


def test_shared_to_is_exported_without_merging_postings_or_candidates():
    import json
    from pathlib import Path
    data = json.loads((Path(__file__).parent / "fixtures/shared_to.json").read_text())
    dashboard, unmatched = build_dashboard(data)
    assert len(dashboard["openings"]) == 2
    assert dashboard["candidateCount"] == 4
    assert unmatched == 0
    ids = {item["id"] for item in dashboard["openings"]}
    for item in dashboard["openings"]:
        assert item["toGroup"] == "MAZE-개발-01"
        assert item["targetTo"] == 3
        assert len(item["candidates"]) == 2
        assert all(candidate["openingTitle"] == item["title"] for candidate in item["candidates"])
    data["openings"][0]["toGroup"] = ""
    changed, _ = build_dashboard(data, ids)
    assert {item["id"] for item in changed["openings"]} == ids
    assert not any(item["isNew"] for item in changed["openings"])


def test_shared_to_conflicts_are_not_silently_summed_and_projects_stay_separate():
    import pytest
    data = {"openings": [
        {"project": "Project octopus", "title": "직무A", "toGroup": " Group  01 ", "targetTo": 3},
        {"project": "OTPS", "title": "직무B", "toGroup": "group 01", "targetTo": 2},
    ], "candidates": []}
    with pytest.raises(ValueError, match="채용인원이 서로 다릅니다"):
        build_dashboard(data)
    data["openings"][1]["targetTo"] = 0
    dashboard, _ = build_dashboard(data)
    assert len(dashboard["openings"]) == 2
    data["openings"][1]["targetTo"] = 2
    data["openings"][1]["project"] = "MAZE"
    dashboard, _ = build_dashboard(data)
    assert len(dashboard["openings"]) == 2

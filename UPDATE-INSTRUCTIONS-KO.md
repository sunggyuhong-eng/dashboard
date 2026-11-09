Dashboard_TO I/J열 채용 완료 표시 수정 파일

1. ZIP 내부의 파일만 기존 GitHub 저장소의 같은 경로에 업로드하거나 덮어쓰세요. 전체 저장소를 다시 업로드할 필요는 없습니다.
2. google-apps-script/Code.gs를 기존 Apps Script Code.gs에 반영하고 새 버전으로 다시 배포하세요. GitHub의 SHEET_API_URL이 기존 배포 URL을 가리킨다면 배포 URL은 그대로 쓸 수 있습니다.
3. GitHub Actions 배포 후 대시보드에서 데이터를 다시 불러오세요.

Dashboard_TO H=TO번호, I=채용완료(입사자), J=입사날짜를 연결해 '채용 완료 TO' 영역에 프로젝트·TO번호·채용 직무·입사자·입사 날짜·TO 상태를 표시합니다. 공유 TO의 동일 인물·날짜는 한 건으로 표시합니다. G열 완료인데 I/J가 비면 미입력으로 보여줍니다. I/J에 이름이 있어도 G열이 진행중인 TO는 진행중으로 표시합니다. 최초 JSON 생성과 실시간 갱신 양쪽에 적용됩니다.

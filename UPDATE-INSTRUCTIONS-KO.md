채용 대시보드 업데이트 파일입니다.

1. ZIP 안의 `src/` 파일을 GitHub 저장소의 같은 경로에 덮어씁니다.
2. `public/` 안의 새 SVG 아이콘 4개를 저장소의 `public/` 폴더에 추가합니다. GDTS·ZERO 이미지와 기존 `kong-studios-logo.png`는 그대로 사용합니다.
3. `google-apps-script/Code.gs` 내용을 기존 Apps Script의 `Code.gs` 전체에 덮어씁니다.
4. Apps Script를 새 버전으로 다시 배포한 다음, 대시보드에서 `데이터 다시 불러오기`를 누릅니다.

화면에는 MAZE 이름 옆에 전체 TO와 진행 중 TO 인원 수가 표시됩니다. MAZE 전체 TO는 `TO_MAZE!B1`, 진행 중 TO는 `Dashboard_TO`의 `채용버튼` 열에서 `진행중`인 행의 채용인원을 기준으로 계산합니다. 각 공고에는 `TO번호`가 붙고, 오퍼가 있는 공고에는 지원자별 입사 예정일이 표시됩니다. 입사 예정일이 비어 있으면 `예정일 미입력`으로 나옵니다. 전형명은 띄어쓰기 차이가 있어도 같은 단계로 읽습니다.

프로젝트 아이콘은 Art=Photoshop 스타일, OTPS·MAZE·HERO=NEW PROJECT, QA=공구, SERVER=Wi-Fi, KONG=기존 회사 로고입니다.

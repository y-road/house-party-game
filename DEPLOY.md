# 배포 가이드 (Render)

## 1. 올리기
1. 이 폴더를 GitHub 저장소(비공개 권장)에 올립니다. (`node_modules`, `client/dist`는 `.gitignore`로 제외됨)
2. Render 대시보드 → **New → Blueprint** → 저장소 선택. 루트의 `render.yaml`이 자동 적용됩니다.
   - 리전 Singapore, 플랜 Starter(유료), 인스턴스 1대, 헬스체크 `/healthz`
3. 배포가 끝나면 `https://<서비스이름>.onrender.com` 주소가 생깁니다.
   - 플레이어: 위 주소 (QR 코드로 나눠 주면 편해요)
   - 관리자(PC): 위 주소 뒤에 `/admin`

## 2. 행사 전 점검 (전날)
- PC에서 `/admin` 접속 → [테스트 봇 채우기] → [시작]으로 레이스~선물 끝까지 한 번 돌려 보기
- 폰 1~2대를 LTE로 접속해 커스터마이징·연타·카드 열기 확인
- 끝나면 Render에서 **서비스 재시작**(Manual Deploy → Restart)해서 테스트 데이터를 비우기

## 3. 운영 주의
- 게임 상태는 서버 메모리에만 있어서 **서비스가 재시작·재배포되면 모두 초기화**됩니다. 행사 중에는 배포하지 마세요 (`autoDeploy: false`).
- 인스턴스를 2대 이상으로 늘리면 게임이 깨집니다. 1대로 유지하세요.
- 관리자 인증이 없어서, **`/admin`에 접속하면 기존 관리자 자리를 가져갑니다.** 주소를 손님에게 알려 주지 마세요.
- 행사가 끝나고 약 2주 뒤 Render에서 서비스를 삭제(또는 Suspend)하면 과금이 멈춥니다.

## 4. 로컬 실행
```
npm install
npm run build
npm start        # http://localhost:3000  (관리자: /admin)
```

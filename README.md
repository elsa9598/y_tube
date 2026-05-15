# 오둥이 하루 — Y_Tube

Cartoon-Music: 이미지 + MP3 + LRC → MP4 → 유튜브 업로드 Flutter 앱.

3개 페이지:
1. **홈** — 브랜드 헤더 + 리모션 렌더링 CTA + STEP 안내
2. **리모션 렌더링** — 16:9 미리보기 (블러 배경 + 좌측 1:1 이미지 + 우측 LRC 가사 타임 스크롤 + 하단 송 타이틀) + 진행률 + 에셋 3개 picker
3. **유튜브 업로드** — 자동 미리보기 + 파일 정보 + 인코딩 진행률 + 제목/설명/태그/공개 상태 폼

바텀 네비 3개 (홈/렌더링/업로드) 모든 페이지에서 동일.

---

## ✅ 지금 동작하는 것

**Flutter 앱:**
- 3개 페이지 UI 완성 (다크 테마, Material 3, 스크린샷 디자인 매칭)
- 페이지 간 네비게이션 + 바텀 네비
- 이미지 / MP3 / LRC 파일 피커
- LRC 파일 파싱 (`[mm:ss.xx]가사` 표준)
- MP3 재생 (just_audio) + 위치 스트림
- 가사 시간 동기화 + 활성 라인 강조 + 자동 스크롤
- 렌더 진행률 UI + 단계별 상태 메시지
- 프로젝트 상태 공유 (Provider) — 1→2→3 페이지 자산 전달
- 유튜브 메타 폼 (제목·설명·태그·공개 상태)
- `flutter create .` 스캐폴딩 완료 (Android), AndroidManifest 권한 추가, `flutter pub get` 통과

**Remotion 서브프로젝트 (`remotion/`):**
- 16:9 1080p 30fps 컴포지션 (`Cartoon`) — 블러 BG + 좌측 1:1 + 우측 가사 스크롤 + 하단 타이틀
- `gen-props.mjs` 자동화 — 곡 폴더 한 개 주면 thumbnail/lrc/mp4 자동 검출 → `public/current/` 복사 → `sample-props.json` 생성
- LRC 영어+한글 같은 시각 라인 자동 병합 (`\n`)

## ⏳ 다음 단계

**Phase 2 — Remotion 서버 렌더링 (서버 렌더 구조로 결정됨):**
- [x] Remotion 컴포넌트 + props 자동 생성 스크립트
- [ ] 로컬 PC에서 `npx remotion render` 검증 (진행 중)
- [ ] Express/Fastify 서버 (`server/`) — POST `/render`, GET `/status/{id}`, GET `/download/{id}` + 자산 multipart 업로드
- [ ] 호스팅 결정 (Render.com / AWS Lambda / VPS / 로컬 PC)
- [ ] Flutter `video_renderer.dart` → 서버 API 클라이언트로 교체

**Phase 3 — 실제 유튜브 업로드:**
- [secrets.dart](lib/secrets.dart) 에 OAuth client + **refresh token** 이미 준비됨 → 동의 화면 스킵 가능
- `googleapis: ^13.0.0` + `googleapis_auth: ^1.4.0` 추가
- refresh token으로 access token 갱신 → `YouTubeApi.videos.insert`

## 🚧 진행 로그

### 2026-05-15
1. Flutter SDK 3.41.9 설치 (`D:\flutter\`)
2. `flutter create . --org com.elsa.ytube --platforms=android` 성공 (29파일, 기존 `lib/` 보존)
3. AndroidManifest.xml에 권한 4개 추가 (INTERNET, READ_EXTERNAL_STORAGE, READ_MEDIA_IMAGES, READ_MEDIA_AUDIO)
4. `test/widget_test.dart` 기본 카운터 → `YTubeApp` 부팅 테스트로 교체
5. `flutter pub get` + `flutter doctor` 통과 (cmdline-tools 누락 — APK 빌드 시 추가 설치 필요)
6. **Phase 2 방향 결정: Remotion 서버 렌더 (옵션 B)** — `flutter_quick_video_encoder` / `ffmpeg_kit_flutter_new` 후보 검토 후 사장님 결정
7. `remotion/` 서브프로젝트 스캐폴드: Composition.tsx, Root.tsx, types.ts, lrc.ts, gen-props.mjs
8. `npm install` 완료 (remotion 4 + react 18 + zod, 195 packages)
9. 자산 검증: `D:\Claude_works\y_tube\musics\<곡명>\` 패턴 확인 — `<곡>.mp4 / lyrics.lrc / thumbnail.jpg(1024×1024) / meta.json`
10. mp4를 그대로 audio source로 쓰기로 결정 (MP3 별도 추출 불필요)
11. 첫 렌더 시도 → `file://` 차단 발견 → `staticFile()` + `public/current/` 복사 패턴으로 수정
12. 렌더 재시도 진행 중 (Headless Shell 113MB 다운로드 완료)
13. ✅ **첫 렌더 성공** — `remotion/out/odung_test.mp4` (46.4MB, 154초). 디자인+가사싱크 "멋져" 통과
14. ✅ **사장님 워크플로우 확정**: 폰에서 **mp4 + JSON 첨부** → 렌더 → 페이지3 자동 이동 (3페이지 구조 유지)
15. JSON 형식 확정 — `{id, title, thumbnail:"자동배치됨", time, lyrics}`. lyrics는 LRC 큰 문자열, `한국어 / 영어` 순서, `\n` 구분
16. `gen-props.mjs` mp4+JSON 모드 추가: mp4 첫 프레임 → 1:1 이미지 추출 (Remotion 번들 ffmpeg.exe 직접 실행), lyrics 문자열 파싱
17. ✅ mp4+JSON 모드 검증 통과 — "이방인의 식탁" 31라인 192초, 첫 프레임 1024×1024 추출 OK, 한국어 위/영어 아래
18. ✅ 가사 스크롤 번쩍임 수정 — CSS transition은 Remotion에서 무효 → `spring()` 프레임 보간으로 교체 ("좋아졌어")
19. ✅ 좌측 이미지 ken-burns — 7단계(시계방향 4모서리→전체→중앙→전체) × 3회 반복, smoothstep ease ("좋아")
20. ✅ **서버(`server/`) 완성** — Express + multer. POST /render, GET /status/:id, GET /download/:id, 시리얼 큐, stdout 진행률 파싱
21. 서버 안정화 — `npx`(Windows .cmd) 불안정 → `node @remotion/cli/remotion-cli.js` 직접 호출 + crash 방어 핸들러
22. ✅ 서버 전체 파이프라인 curl 검증 통과 (mp4+JSON 업로드→렌더→다운로드 153MB 일치)

**호스팅 결정**: 로컬 PC + 같은 wifi. PC IP `192.168.45.24:4000`. 방화벽 4000 inbound 룰 필요.

### 2026-05-16 (이어서)
23. ✅ Flutter 통합 — `config.dart`(서버 URL), `project_state.dart`(mp4+JSON 모델), `video_renderer.dart`(서버 클라이언트: 업로드→폴링→다운로드), `render_screen.dart`(picker 2개로 개편), `upload_screen.dart`(imagePath 참조 제거)
24. ✅ `lrc_parser.dart` — `parseLyrics()` 추가 (한국어/영어 ` / ` → `\n`)
25. ✅ `flutter analyze` error 0 — 발견·수정한 기존 버그: nav_shell `jumpTo`가 private state에 있어 호출 불가 → `NavShell`로 이동 / `theme.dart` `CardTheme`→`CardThemeData` (Flutter 3.41.9)
26. ✅ **Phase 3 완료** — `youtube_uploader.dart`: refresh token→access token→YouTube resumable 청크 업로드(8MB), http만, 진행률 추적, 성공 시 watch URL 반환

### ⚠️ 방향 전환 (2026-05-16) — PC 전용 로컬 웹 UI
**Flutter 모바일/APK 전면 중단** (사장님 결정). lib/ 코드는 참고용 보존, 미사용.
모든 작업을 PC에서: 브라우저 로컬 웹 UI.

- `server/public/index.html` — 드래그앤드롭(mp4+JSON) → 렌더 진행률 → 미리보기 → 메타 입력 → 유튜브 업로드
- `server/youtube.mjs` — Node 유튜브 resumable 업로드 (refresh token, 8MB 청크)
- `server/index.mjs` — express.static + POST /upload/:id
- `server/secrets.mjs` — Node OAuth 자격증명 (.gitignore)

### 사용법 (PC)
```powershell
cd D:\Claude_works\y_tube\server
node index.mjs
```
→ 브라우저 `http://localhost:4000` → mp4+JSON 끌어다 놓기 → 렌더 → 유튜브 업로드

### GitHub
- **github.com/elsa9598/y_tube** (private). musics/·secrets·.env 제외하고 코드만.

### 남은 것
- 로컬 웹 UI 실제 전과정(렌더→유튜브 업로드) 사장님 브라우저 검증 (업로드는 실제 채널 반영이라 사장님 직접)

---

## 🛠 빌드 가이드

### 사전 준비

1. **Flutter SDK 설치** (3.22+) — https://docs.flutter.dev/get-started/install
2. **Android Studio** (또는 Android SDK + cmdline-tools)
3. `flutter doctor` 실행 → 모든 항목 OK 확인

### Android 프로젝트 스캐폴딩 생성

이 폴더(`D:\Claude_works\y_tube`) 안에서:

```powershell
flutter create . --org com.elsa.ytube --project-name y_tube
```

→ `android/`, `ios/`, `web/` 등 기본 플랫폼 폴더가 자동 생성됨.
   기존 `lib/`, `pubspec.yaml`, `README.md`는 보존됨.

### 의존성 설치

```powershell
flutter pub get
```

### 권한 추가

`android/app/src/main/AndroidManifest.xml` 의 `<manifest>` 직속에 다음 추가:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_AUDIO" />
```

### 디버그 실행 (USB 폰 연결 또는 에뮬레이터)

```powershell
flutter run
```

### 릴리즈 APK 빌드

```powershell
flutter build apk --release
```

산출물: `build\app\outputs\flutter-apk\app-release.apk`

> 폰에 옮겨서 설치하면 동작합니다. 초기 설치 시 "출처를 알 수 없는 앱" 허용 필요.

### 서명 (Play Store 배포 시)

```powershell
keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

`android/key.properties`:
```
storePassword=...
keyPassword=...
keyAlias=upload
storeFile=../upload-keystore.jks
```

`android/app/build.gradle` 에서 `signingConfigs.release` 활성화 후 다시 `flutter build apk --release`.

---

## 📁 프로젝트 구조

```
y_tube/
├── pubspec.yaml
├── README.md (이 파일)
├── lib/
│   ├── main.dart                    엔트리 + Provider 설치
│   ├── theme.dart                   다크 테마 (스크린샷 컬러)
│   ├── models/
│   │   └── lrc_line.dart
│   ├── services/
│   │   ├── lrc_parser.dart          LRC 표준 파서 + 활성 라인 찾기
│   │   ├── project_state.dart       1→2→3 페이지 공유 상태
│   │   ├── video_renderer.dart      MP4 렌더링 (STUB)
│   │   └── youtube_uploader.dart    유튜브 업로드 (STUB)
│   ├── screens/
│   │   ├── home_screen.dart         1페이지 — 홈
│   │   ├── render_screen.dart       2페이지 — 리모션 렌더링
│   │   └── upload_screen.dart       3페이지 — 유튜브 업로드
│   └── widgets/
│       └── nav_shell.dart           바텀 네비 + 페이지 스위처
└── android/  (flutter create로 자동 생성)
```

---

## 🎵 LRC 포맷 예시

```
[ti:Midnight Horizons]
[ar:오둥이]
[00:12.34]I can see the stars aligning
[00:15.78]In the silence of the night
[00:19.42]Everything is changing colors
[00:23.11]Burning through the neon light
```

---

## 🐛 트러블슈팅

| 증상 | 해결 |
|------|------|
| `flutter: command not found` | Flutter SDK PATH 설정 |
| `Gradle build failed` | Android Studio 열어서 한 번 sync |
| 파일 피커가 안 열림 | 권한 추가 (위 AndroidManifest 섹션) |
| MP3 재생 안 됨 | 파일이 진짜 MP3인지 확인 / 다른 파일로 시도 |
| LRC 가사 안 뜸 | 인코딩 UTF-8 확인 / `[mm:ss.xx]` 형식 맞는지 |
| 렌더 결과 MP4가 빈 텍스트 | 현재 STUB. Phase 2에서 실제 렌더링 통합 예정 |
| 유튜브 업로드 가짜 성공 | 현재 STUB. Phase 3에서 OAuth 통합 예정 |

---

## 📞 다음 작업

1. `flutter create .` 후 한 번 빌드 성공 확인
2. 폰에 설치해서 3개 페이지 디자인·플로우 검증
3. UX 수정 사항 피드백
4. Phase 2: 실제 MP4 렌더링 통합 (가장 큰 작업)
5. Phase 3: 유튜브 실제 업로드 통합

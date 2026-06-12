# Image Tag Supporter

이미지 태깅 작업을 효율적으로 수행하기 위한 도구.

이미지를 하나씩 보면서 태그를 추가/삭제할 수 있으며, **Electron 데스크탑 앱**과 **Cloudflare 클라우드 웹 앱** 두 가지 모드를 지원합니다.

## Layout

```
┌──────────┬────────────────────────┬──────────────┐
│ 파일목록  │     이미지 표시 영역     │  전체 태그 목록 │
│ (좌측)   │                        │  (우측)       │
│          │   [이미지 미리보기]      │              │
│ file1.png│                        │  tag1        │
│ file2.png│ ─────────────────────  │  tag2        │
│ file3.png│  [tag1][tag2][tag3]... │  tag3        │
│ ...      │  [새 태그 입력 필드]    │  ...         │
└──────────┴────────────────────────┴──────────────┘
```

## Features

- **이미지 브라우징**: 좌측 파일 목록에서 이미지를 선택하여 미리보기
- **태그 편집**: 태그 클릭으로 삭제, 입력 필드로 새 태그 추가
- **전체 태그 목록**: 우측에 모든 파일에서 사용된 태그 표시, 클릭하면 현재 이미지에 추가
- **태그 검색**: 우측 태그 목록에서 검색 가능
- **자동 저장**: 태그 변경 시 즉시 반영 (debounce 300ms)
- **키보드 네비게이션**: 좌우 화살표 / A, D 키로 이미지 이동, G 갤러리, B 태그 가이드

### 태그 가이드 (클라우드 모드)

처음 보는 태그도 바로 이해할 수 있도록 내장 가이드를 제공합니다.

- **ⓘ 아이콘 / 우클릭**: 태그 칩이나 전체 태그 목록에서 가이드 모달 열기 — 한국어 설명, 키워드, Booru 표기 ↔ 자연어 표기, 관련 항목, Danbooru 위키 링크
- **가이드 브라우저** (📖 버튼 또는 `B`): 카메라 시선/앵글 · 카메라 무빙 · 렌즈/화각 · 프레이밍 · 조명 · 필름 종류/감성/기법 · 기본 Booru 태그 · 품질 태그를 카테고리별 카드로 탐색, 검색 후 클릭 한 번으로 현재 이미지에 추가
- 내장 가이드에 없는 태그는 Danbooru 위키/예시 검색 링크로 연결됩니다
- 가이드 데이터는 `public/guide-data.js` 에서 항목을 추가/수정할 수 있습니다

### 모델별 태그 구분 (클라우드 모드)

상단 **모델 선택**(Anima / SDXL / LTX Video / WAN / Grok Imagine / GPT-Image-2.0)에 따라:

- 가이드 브라우저 상단에 해당 모델의 **프롬프팅 팁** 표시 (예: LTX는 단락형 시네마틱 서술, Anima는 Danbooru 태그 나열)
- 우측 "가이드 추천" 탭과 가이드 브라우저가 해당 모델과 호환되는 태그만 표시
- 같은 개념이라도 모델에 맞는 표기로 추가됩니다 — booru 모델은 `from below`, 자연어 모델은 `low angle shot looking up at the subject`
- 모델 프로필은 `public/guide-data.js` 의 `models` 배열에서 추가/수정 가능

### 용도별 태그셋 — 이미지당 1:N (클라우드 모드)

하나의 이미지에 여러 태그셋을 만들고 용도/모델별로 전환합니다.

- **용도**: ✨ 추론(프롬프트 생성) / 🎨 학습·스타일(LoRA) / 👤 학습·캐릭터(LoRA)
- 태그 영역 상단의 **셋 탭**으로 전환, `+` 로 새 셋 생성(기존 셋에서 복사 가능), 활성 탭 재클릭으로 이름/용도/모델 변경·삭제
- 상단 **용도/모델 선택**에 맞는 셋이 이미지 이동 시 자동 선택되고, 없으면 한 번에 만들 수 있습니다
- **Export**: 용도(+모델)별로 이미지마다 매칭되는 셋을 골라 `이미지명.txt` zip(LoRA 학습 캡션) 또는 JSON으로 다운로드

> 태그 가이드 / 모델별 구분 / 1:N 태그셋 기능은 클라우드 웹 앱 기준입니다. Electron 모드는 기존 단일 `.txt` 태그 파일 흐름을 유지합니다.

## Mode 1: Electron Desktop App

로컬에서 직접 이미지 폴더와 태그 폴더를 지정하여 사용.

```bash
npm install
npm start
```

### Tag File Format

태그 파일은 이미지 파일명과 동일한 이름의 `.txt` 파일이며, 쉼표로 구분된 태그가 나열됩니다.

```
1girl, solo, smile, blonde_hair, blue_eyes,
```

## Mode 2: Cloudflare Cloud Web App

Cloudflare Pages + D1 + R2 기반 클라우드 웹 앱. 어디서든 브라우저로 접근 가능.

### Setup

1. **Cloudflare 계정 & wrangler 로그인**
   ```bash
   npx wrangler login
   ```

2. **D1 데이터베이스 생성 & 스키마 적용**
   ```bash
   npx wrangler d1 create tag-supporter-db
   npx wrangler d1 execute tag-supporter-db --remote --file=schema.sql
   ```

3. **R2 버킷 생성** (Cloudflare 대시보드에서 R2 활성화 필요)
   ```bash
   npx wrangler r2 bucket create tag-supporter-images
   ```

4. **wrangler.toml에 database_id 입력**

5. **기존 데이터 마이그레이션** (선택사항)
   ```bash
   npm install sharp  # 썸네일 생성용
   npm run migrate -- --images ./imgs/PJH --tags ./tags/PJH_tags
   ```

6. **로컬 개발**
   ```bash
   npm run dev
   ```

7. **배포**
   ```bash
   npm run deploy
   ```

### Cloud Architecture

```
Browser → Cloudflare Pages (static files)
       → Pages Functions (/api/*)
           ├── D1 (SQLite DB: images, tags)
           └── R2 (Object Storage: originals/, thumbs/)
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/images | 이미지 목록 |
| GET | /api/images/:id | 원본 이미지 serve |
| DELETE | /api/images/:id | 이미지 삭제 |
| GET | /api/images/:id/thumb | 썸네일 serve |
| GET | /api/images/:id/tags | 기본 태그셋 조회 (하위 호환) |
| PUT | /api/images/:id/tags | 기본 태그셋 업데이트 (하위 호환) |
| GET | /api/images/:id/tagsets | 이미지의 모든 태그셋 (태그 포함) |
| POST | /api/images/:id/tagsets | 태그셋 생성 (`purpose`, `model`, `copyFromSetId`) |
| GET/PUT/DELETE | /api/tagsets/:id | 태그셋 조회 / 수정 / 삭제 |
| GET | /api/tags | 전체 유니크 태그 (`?purpose=&model=` 필터) |
| GET | /api/export | 용도/모델별 이미지당 최적 태그셋 일괄 조회 |
| POST | /api/upload | 이미지 업로드 |
| POST | /api/init | 스키마 생성 + 레거시 태그 → 태그셋 마이그레이션 |

### 기존 데이터 마이그레이션 (v2 → 태그셋)

기존 `tags` 테이블 데이터는 자동으로 이미지별 기본 태그셋(`main`, 용도: 추론)으로 옮겨집니다.

```bash
# 스키마 반영 (CREATE IF NOT EXISTS 라 재실행 안전)
npx wrangler d1 execute tag-supporter-db --remote --file=schema.sql
# 일괄 마이그레이션 (선택 — 안 해도 이미지를 열 때 자동(lazy) 마이그레이션됨)
curl -X POST https://<your-app>.pages.dev/api/init
```

## Tech Stack

- **Desktop**: Electron + HTML/CSS/JS
- **Cloud**: Cloudflare Pages + D1 + R2 + Pages Functions

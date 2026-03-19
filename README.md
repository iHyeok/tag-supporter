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
- **키보드 네비게이션**: 좌우 화살표 / A, D 키로 이미지 이동

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
| GET | /api/images/:id/tags | 태그 조회 |
| PUT | /api/images/:id/tags | 태그 업데이트 |
| GET | /api/tags | 전체 유니크 태그 목록 |
| POST | /api/upload | 이미지 업로드 |

## Tech Stack

- **Desktop**: Electron + HTML/CSS/JS
- **Cloud**: Cloudflare Pages + D1 + R2 + Pages Functions

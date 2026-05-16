# HWPX / OWPML Cheatsheet (LLM 1차 참조용)

## 파일 구조 (핵심만)

HWPX = **ZIP 컨테이너** + 내부 **XML 파트들**. 핵심 규약:

- `mimetype` — **반드시 첫 번째 엔트리, 무압축 STORE**. 내용은 `application/hwp+zip`
- `version.xml` — HWPX 포맷 버전
- `settings.xml` — 앱 설정
- `Contents/content.hpf` — 매니페스트 (어떤 파일이 들어 있고 어떤 순서로 읽을지). EPUB OPF 차용
- `Contents/header.xml` — **글자·단락·테두리·스타일·폰트 ref 라이브러리**. 본문은 모두 ID로 여기 참조
- `Contents/section0.xml`, `section1.xml`, ... — 실제 본문(섹션별)
- `BinData/` — 본문이 참조하는 이미지/이진 자산
- `META-INF/manifest.xml`, `META-INF/container.xml` — ODF/EPUB 스타일 매니페스트
- `Preview/` (선택) — 미리보기 썸네일

## 네임스페이스 (실제 파일에서 본 prefix)

| prefix | 약자 의미 | 어디서 보이나 |
|---|---|---|
| `hs` | section | section0.xml 루트 |
| `hp` | paragraph | 본문 모델 전부 (p, run, t, tbl, pic, ...) |
| `hh` | head | header.xml 안 (charPr, paraPr, style, ...) |
| `hc` | core | 색·좌표·채움 (color, fillBrush, pt0, intent, ...) |
| `hpf` | package file | content.hpf |
| `hp10` | paragraph 2016 | switch/case 안에서 alternate 표현 |
| `opf`, `dc`, `odf`, `ocf` | EPUB/ODF 차용 | content.hpf, manifest.xml |

URI는 `http://www.hancom.co.kr/hwpml/2011/<part>` 형태(현행).
`2011`은 연도가 아니라 **현행 표준**. 자세히는 `namespaces.json`.

## Top 10 가장 자주 보이는 엘리먼트

1. `hp:t` — **텍스트 노드**. 실제 문자열. 빈 셀에도 존재.
2. `hp:run` — 동일 글자모양 인라인 묶음. `@charPrIDRef` → header의 `hh:charPr/@id`
3. `hp:p` — 단락. `@paraPrIDRef`, `@styleIDRef`로 모양 결정
4. `hp:linesegarray`/`hp:lineseg` — 단락 레이아웃 캐시(엔진 생성, 의미 편집 시 무시 가능)
5. `hp:tbl` / `hp:tr` / `hp:tc` — 표/행/셀
6. `hp:subList` — 셀·도형 텍스트 안에 단락 묶음을 담는 컨테이너
7. `hp:pic` + `hc:img` — 이미지(@binaryItemIDRef → BinData 파일)
8. `hh:charPr` / `hh:paraPr` / `hh:style` — header.xml의 모양/스타일 단위
9. `hh:borderFill` — 표·페이지·셀이 공유하는 테두리/채움
10. `hp:secPr` + `hp:pagePr` + `hp:margin` — 섹션 시작 단락 안의 페이지 속성

## 공통 단위와 ID 체계

- **HWPUNIT** = 1/7200 inch. width/height/margin 등 대부분의 길이 속성
- **HWPUNIT100** = pt × 100. `hh:charPr/@height` 같은 글자 크기에 사용 (예: 10pt → `1000`)
- **색상**: `#RRGGBB` 16진수
- **참조**: `paraPrIDRef`, `charPrIDRef`, `styleIDRef`, `borderFillIDRef`, `tabPrIDRef` 등 모두 **header.xml** 안 같은 종류 리스트의 `@id`로 들어감. **인라인 스타일은 없다** — 항상 ID 참조.
- 이미지: `hc:img/@binaryItemIDRef` → `content.hpf` 안 `opf:item/@id` → 그 `@href` 가 BinData 경로

## 자주 헷갈리는 점 (Gotchas)

- 한 단락의 텍스트는 보통 **하나의 `hp:t`** 안에 있지만, 같은 글자모양이면서 인라인 마크펜/탭/줄바꿈을 끼면 같은 `hp:run` 안에 여러 `hp:t`가 생길 수 있고, 다른 글자모양이면 `hp:run` 자체가 쪼개진다 → **본문 추출 시 paragraph 단위로 모든 후손 `hp:t` 텍스트를 모아야** 정확.
- `hp:t`는 **mixed content**: 직접 텍스트 + 자식 엘리먼트(`hp:tab`, `hp:lineBreak` 등) 이 섞임. `element.text` 만 보면 누락.
- **빈 표 셀도** `<hp:subList><hp:p><hp:run><hp:t/></hp:run></hp:p></hp:subList>` 가 들어있다. 비어있다고 셀이 없는 게 아님.
- `hp:secPr`는 **섹션의 첫 단락의 첫 run의 자식**으로 한 번만. 페이지 크기 바꿀 때 여기를 건드린다.
- `hp:linesegarray`는 텍스트를 바꿔도 굳이 다시 계산해 넣을 필요 없음. 한컴이 열 때 재계산하지만, **있긴 있어야** 호환성 안전.
- `hp:switch/hp:case/hp:default` 는 **markup compatibility** wrapper. 같은 의미를 namespace별로 두 번 적는 패턴 — XPath로 본문 추출할 때 빠뜨리면 데이터 누락.
- `hh:bold`, `hh:italic`은 자식 엘리먼트가 **있기만 하면 true** (속성 없음).
- `hp:p/@id`는 0부터 단조 증가가 일반적이지만 **유일하기만 하면 됨** (gap OK).
- `borderFill`의 `width` 속성은 숫자가 아니라 `"0.12 mm"` 같은 **문자열**.

## 본문 추출 XPath 패턴

(`ns` = namespaces 매핑 dict)

- 전체 텍스트: `.//hp:t` → 각 노드의 `itertext()` 모아 concat
- 단락 단위: `.//hp:p` → 각 p 안의 `.//hp:t` itertext
- 표 셀 내용: `.//hp:tbl//hp:tc//hp:p//hp:t`
- 이미지 경로: `.//hc:img/@binaryItemIDRef` → content.hpf의 `opf:item[@id=...]/@href`
- 스타일 정의: `header.xml`의 `//hh:style[@id=$idref]`

## 본문 수정 시 안전 체크리스트

- [ ] `hp:p/@id` 유일성
- [ ] 텍스트 길이 바뀌면 `hp:linesegarray` 안의 `hp:lineseg/@textpos`, `horzsize`는 **삭제 또는 그대로 두기** (한컴이 재계산)
- [ ] charPr/paraPr/style을 새로 만들 땐 `header.xml`의 해당 리스트 `@itemCnt`를 +1 하고 새 `@id` 부여
- [ ] 이미지 추가 시: `BinData/`에 파일 넣고 → `content.hpf`의 `opf:manifest`에 `opf:item` 추가 → 본문에서 `hc:img/@binaryItemIDRef`로 참조
- [ ] ZIP 재패킹 시 `mimetype` 첫 엔트리·STORE 유지

## 더 깊이 들어갈 때

- 정식 C++ 모델: https://github.com/hancom-io/hwpx-owpml-model
- `OWPML/Class/ClassID.h` — 모든 클래스의 정식 ID 목록 (300+)
- Python 파서 참고: https://airmang.github.io/python-hwpx/schema-overview.html
- 이 폴더의 `tags.json` — 본 프로젝트가 정리한 152개 태그 사전

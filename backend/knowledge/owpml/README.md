# OWPML / HWPX Knowledge Base

이 폴더는 LLM이 HWPX(한컴 한글 XML 포맷)를 이해하고 편집·생성할 때 1차 참조하는 구조화된 지식 베이스입니다.

## 원전 (upstream)

- **공식 C++ 레퍼런스 구현**: https://github.com/hancom-io/hwpx-owpml-model (Apache-2.0, Hancom 소유)
  - 본 자료는 위 저장소의 `OWPML/Class/*.h` 헤더와 `OWPML/Base/NamespacePrefix.{h,cpp}` 를 1차 출처로 사용
  - 실제 사용 양상은 `/Users/cholhohuh/Workspace/00_projects-and-labs/hwpx-tools/samples/*.hwpx` 의 unpacked XML로 교차 검증

## 파일 안내 (load order suggestion)

1. **`cheatsheet.md`** — 항상 먼저 읽기. 1페이지 요약: 파일 구조, top-10 태그, 단위, 함정. LLM 컨텍스트에 거의 무료로 들어감.
2. **`namespaces.json`** — 본문 파일 헤더의 `xmlns:*` 속성을 해석할 때. 2011(현행) ↔ 2024 매핑.
3. **`tags.json`** — 특정 엘리먼트의 속성/자식/부모를 정밀하게 알아야 할 때. 152개 엘리먼트 사전.
4. **`parent-child.json`** — "이 엘리먼트의 자식으로 어떤 게 들어갈 수 있나?"만 빠르게 검색할 때. tags.json의 children 필드만 따로 뽑은 인덱스.

## tags.json 커버리지

- **총 152개 엘리먼트** 문서화
- **카테고리별 자신감**:
  - ✅ 본문 핵심(섹션·단락·런·텍스트): 모두 커버 (`hs:sec`, `hp:p`, `hp:run`, `hp:t`, 인라인 제어 6종)
  - ✅ 표 모델: 완전 커버 (`hp:tbl`, `hp:tr`, `hp:tc`, `hp:cellAddr/Span/Sz/Margin`, `hp:subList`, `hp:caption`)
  - ✅ 이미지/도형: 주요 엘리먼트 커버 (`hp:pic`, `hc:img`, `hp:rect`, `hp:line`, `hp:ellipse`, 효과·변환행렬·좌표점)
  - ✅ 페이지/섹션 속성: 완전 커버 (`hp:secPr`, `hp:pagePr`, `hp:margin`, `hp:grid`, `hp:visibility`, 각주/미주 속성)
  - ✅ Header 정의 풀: 완전 커버 (`hh:charPr`, `hh:paraPr`, `hh:style`, `hh:borderFill`, `hh:fontfaces`, `hh:numbering`, `hh:bullet`)
  - ✅ 매니페스트(OPF): 커버 (`opf:package`, `opf:manifest`, `opf:item`, `opf:spine`, `opf:itemref`)
  - ⚠️ **갭** : 폼 컨트롤(`hp:btn`, `hp:comboBox`, `hp:listBox`, `hp:edit`, `hp:scrollBar`), 수식(`hp:equation`), OLE(`hp:ole`), 차트(`hp:chart`), 비디오(`hp:video`), 한글 객체(`hp:textart`, `hp:compose`, `hp:dutmal`) — 존재는 알려져 있고 hp:run 의 children 목록엔 들어있지만 속성 상세는 미문서화. 필요해지면 `OWPML/Class/Para/<Name>.h` 직접 참조.
  - ⚠️ **갭**: history(변경 이력), master-page, 보안/서명. 본 도구의 초기 목적(편집)엔 우선순위 낮음.

## 데이터 출처 신뢰도

| 정보 | 출처 | 신뢰도 |
|---|---|---|
| Tag 이름 + namespace | C++ 헤더의 `Set<Tag>()` 메서드 + 실제 sample XML | 매우 높음 |
| Attribute 이름·타입 | C++ 헤더의 `Get/Set<Attr>` 시그니처 + sample XML | 매우 높음 |
| Attribute purpose 한글 설명 | OWPML 스펙 추론 + sample 사용 양상 | 중간~높음 (대부분 검증) |
| 자식 엘리먼트 목록 | C++ 헤더 + sample XML 교차 | 높음 (실제 본 것 + 모델 둘 다 일치) |
| Enum 값 후보 | 헤더의 `enum`/`#define`, 일부는 추측 표기 | 중간 (정확한 enum 풀 값은 추가 검증 필요) |

## 갱신 방법

1. `OWPML/Class/Para/<Element>.h` 를 가져와 `Set<Name>()`, `Get<Attr>()` 시그니처 파싱
2. 실제 sample HWPX를 unzip → `Contents/section0.xml` 안에 그 엘리먼트가 어떻게 쓰이는지 확인
3. `tags.json`에 항목 추가 → `parent-child.json` 재생성 (단순 derivation)
4. 명백한 신규 카테고리면 `cheatsheet.md`도 업데이트

본 자료는 한컴 코드를 **참고**해서 구조 정보만 정리한 것으로, 코드 자체를 복사하지 않습니다.

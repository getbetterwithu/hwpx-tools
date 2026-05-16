# DVC (Hancom HWPX Document Validation Checker) — Integration Plan

Research source: https://github.com/hancom-io/dvc (default branch `main`,
license Apache-2.0, primary language C++). All findings below come from
reading the repo's `README.md`, `CommandParser.cpp`, `DVCDefine.h`,
`Source/JsonModel.h`, `export/ExportInterface.h`, `export/export.h`,
`Examples/windows/ExampleWindows/ExampleWindows.cpp`,
`sample/jsonFullSpec.json`, `sample/test.json`.

---

## TL;DR

- Build feasibility: **moderate-to-hard** (Windows-only build scripts shipped;
  Linux/macOS conceivable from `#ifdef OS_LINUX` paths but no Makefile/CMake).
- Pre-built binaries: **none** (`GET /releases` returns `[]`).
- dvc is a **policy/house-style conformance checker**, not a structural
  integrity validator. Misaligned with our actual need.
- **Recommendation: Option B — Python rewrite** of the structural checks we
  actually care about. Optionally bolt on dvc later (hybrid) for users who
  want house-style enforcement.

---

## 1. What dvc validates

From README + `Source/JsonModel.h` JID_* constants. dvc walks the parsed
OWPML tree and emits an error each time a property in the user-supplied
spec is violated. Categories implemented today:

| JID range | Category | Useful to us? |
|-----------|----------|---------------|
| 1000      | `charshape` (font, size, bold, color, underline, …) | **No** — policy |
| 2000      | `parashape` (alignment, margins, line spacing, tabs, …) | **No** — policy |
| 3000      | `table` (size, borders, position, captions, fills) | Partial — structural-ish |
| 3100      | `specialcharacter` (allowed code-point ranges) | Partial — could flag corruption |
| 3200      | `outlineshape` (numbering levels) | No |
| 3300      | `bullet` | No |
| 3400      | `paranumbullet` | No |
| 3500      | `style` (permission to use style types) | No |
| 4000      | `page` (paper size, margins, grid) | No |
| 5000      | `DocSummaryInfo` | No |
| 6000/6100 | `footnote` / `endnote` | No |
| 6200–6700 | `memo` / `chart` / `wordart` / `formula` / `ole` / `formobject` | No (just `permission: true/false`) |
| 6800      | `bookmark` | No |
| 6900      | `hyperlink` (whitelist of URLs) | No |
| 7000      | `macro` (permission flag) | No |

**The mismatch we must surface to the main agent:** dvc answers *"does this
document conform to our corporate template?"* — it does **not** answer
*"did our edit break the OWPML structure?"*. There is no
`broken-IDREF`, `orphan-run`, `malformed-cell-grid`, or schema-conformance
check. Reading `Source/OWPMLReader.cpp` would confirm, but already the
JID list above tells us the answer.

---

## 2. Build prerequisites

From README "개발 구성" + `update_oss.bat`:

- Toolchain: **MSVC, Visual Studio 2017 v15.9.41**, C++ (no standard version
  declared; uses `__interface` keyword — MSVC-specific).
- Build artifact: `DVCModel.dll` + `DVCModel.lib` (built via
  `DVCModel.sln`). No CLI executable is built directly; the demo
  `ExampleWindows.exe` links the DLL and exposes the CLI surface.
- Dependencies (must be cloned under `./opensource/`):
  1. `hancom-io/hwpx-owpml-model` (Apache-2.0) — Hancom's OWPML parser.
  2. `open-source-parsers/jsoncpp` (MIT) — built separately via CMake.
- Pre-built binaries on GitHub Releases: **NONE.**
  Verified via `GET https://api.github.com/repos/hancom-io/dvc/releases` → `[]`.
- Cross-platform status:
  - **Windows**: fully supported, `.sln`/`.vcxproj` shipped.
  - **Linux/macOS**: source contains `#ifdef OS_LINUX` branches in
    `CommandParser.cpp` and `DVCDefine.h` (uses `std::string` instead of
    `std::wstring`), but **no Makefile, CMakeLists, or build script for
    non-Windows is in the repo**. Porting requires writing one ourselves
    and dealing with `__interface` (replace with abstract class), `wmain`,
    `LPCWSTR`, etc.
  - Apple Silicon arm64: untested by Hancom. Would require the same Linux
    port plus arm64 toolchain.

Bottom line: **building dvc on macOS arm64 is a multi-day porting effort,
not a `brew install` away**.

---

## 3. CLI invocation

From `CommandParser.cpp` and the README demo line. The DLL is driven by
`IDVC::setCommand(argc, argv)` which accepts a Unix-style arg vector.

### Argument order

```
<program> [OPTIONS]... <spec.json> <target.hwpx>
```

`CommandParser::commandParsing` assigns the **first** non-option positional
arg to `m_dvcFilepath` (the spec) and the **second** to `m_targetFilepath`
(the document under test). Order matters; reversed = wrong file roles.

### Options (verified against `CommandParser::parsingShortOption` /
`parsingLongOption`)

| Short | Long | Meaning |
|-------|------|---------|
| `-j`  | `--format=json` | JSON output (default). |
| `-x`  | `--format=xml` | XML output — **stubbed out**, returns "NotYet". |
| `-c`  | `--console` | Print to stdout (default). |
|       | `--file=PATH` | Write result to PATH (overwrites). |
| `-s`  | `--simple` | Stop on first error. |
| `-a`  |              | Check everything in spec (default). |
| `-d`  | `--default` | Default output detail. |
| `-o`  | `--alloption` | Include every category. |
| `-t`  | `--table` | Table category only. |
| `-i`  | `--tabledetail` | Per-cell table detail. |
| `-p`  | `--shape` | Shape category. |
| `-y`  | `--style` | Style category. |
| `-k`  | `--hyperlink` | Hyperlink category. |
| `-h`  | `--help` | Help. |
| `-v`  | `--version` | Version (`0.01.2` per README). |

### Output JSON shape (from README example + `DVCDefine.h` field constants)

Array of error records. One record per violation. Fields:

```json
{
  "errorCode": 1005,          // JID_* + sub-offset; see Source/JsonModel.h
  "pageNo": 2,                // 1-based
  "lineNo": 4,
  "charIDRef": 6,             // index into <hh:charPr> table
  "paraPrIDRef": 0,           // index into <hh:paraPr> table
  "tableID": 0,
  "tableRow": 0,
  "tableCol": 0,
  "isInTable": false,
  "isInTableInTable": false,
  "text": "레벨1"             // surrounding text, often empty
}
```

Additional optional fields (defined in `DVCDefine.h`): `isInShape`,
`useHyperlink`, `useStyle`, `errorString`.

### Exit codes

The example in `ExampleWindows.cpp` never sets a non-zero `return`; it just
calls `doValidationCheck()` (returns bool — true = check ran, **not**
"document is valid") and prints. **The caller must parse the output JSON
and count records to decide pass/fail.** Empty array = pass.

---

## 4. A minimal spec for OUR use case

If we did adopt dvc, the spec must be as **permissive as possible**
because our goal is "did we accidentally break something?" not "does this
match our house style?". Most JID categories in `jsonFullSpec.json` are
useless to us — they force a single allowed font, size, color, etc.

The smallest spec that still drives some validation:

```json
{
    "specialcharacter": {
        "minimum": 32,
        "maximum": 1114111
    },

    "table": {
        "table-in-table": true
    },

    "style":     { "permission": true },
    "hyperlink": { "permission": true },
    "macro":     { "permission": true }
}
```

Notes on the choices:
- `specialcharacter` 32–0x10FFFF: legal Unicode scalar range minus C0
  controls. Any error emitted means dvc found a character outside legal
  Unicode — a strong signal of byte-level corruption.
- `table.table-in-table: true`: keeps nested tables legal (we don't want
  false positives if the user already had nested tables).
- The `permission: true` blocks declare we ALLOW styles/hyperlinks/macros
  so dvc won't flag their presence.
- **All `charshape` / `parashape` / `page` keys deliberately omitted** —
  any key absent from the spec is not checked. This is the inverse of how
  most validators work, and it is the reason dvc cannot be turned into a
  general structural checker by configuration alone.

**Honest verdict on this spec:** it will catch almost nothing we care about
(broken IDREFs, lost runs, malformed `<hp:tbl>` structures) because dvc
doesn't check those things at all. See §5.

---

## 5. Integration approach

### Option A — Subprocess CLI (build dvc, ship the binary)

- Pros: Hancom-blessed, future-proof if Hancom adds structural checks.
- Cons:
  - Multi-day port to macOS arm64 (no CMake, MSVC-isms in source).
  - On Windows we still need to bundle `DVCModel.dll` + `jsoncpp.dll` +
    OWPML DLL + the example exe, all built from sources by us.
  - Tauri bundling: the Windows installer would need to drop the
    `.exe` + DLLs into a sidecar dir and the backend would `subprocess.run`
    them. Cross-arch (x64 vs arm64 Windows) doubles the matrix.
  - **And after all that, dvc still doesn't validate what we need.**

### Option B — Python rewrite (recommended)

Implement the structural invariants we actually care about directly in
Python against the already-parsed OWPML XML. We already use `lxml` (or
`xml.etree`) in `hwpx_core/`; checks become a single visitor pass.

Concrete checks to implement:
1. **XSD / schema parse**: load Hancom's OWPML XSDs (separate task —
   extract from a HWP+ install or from `hwpx-owpml-model` repo) and run
   `lxml.etree.XMLSchema.validate()` against every part. First-line
   defence against well-formedness regressions.
2. **IDREF integrity**: for each `*IDRef` attribute in section XML,
   resolve it against the corresponding ID table in `header.xml`
   (charPr, paraPr, style, borderFill, …). Any unresolved reference is a
   blocking error.
3. **Run/paragraph balance**: every `<hp:p>` must contain at least one
   `<hp:run>`; every `<hp:run>` must have a `charPrIDRef`; text inside
   `<hp:t>` must be valid UTF-8 / valid XML chars.
4. **Table grid sanity**: declared `rowCnt`/`colCnt` must match actual
   `<hp:tr>` / `<hp:tc>` counts; row/col spans must sum correctly.
5. **Manifest / content-types parity**: every part listed in
   `META-INF/container.xml` exists; every part inside the zip is listed.
6. **Round-trip stability** (cheap but powerful): re-open the document we
   just wrote, walk it, compare extracted plain-text hash with the
   pre-write hash. If they differ unexpectedly, fail closed.

Pros:
- Targets the actual failure mode (our edits corrupting structure).
- Single language, no native build, ships inside the existing PyInstaller
  / Tauri sidecar trivially.
- Fast: pure-Python over an already-in-memory tree.

Cons:
- We have to maintain the rules ourselves.
- Doesn't catch issues outside our coverage (none of the deep
  CCharShape/CParaShape semantics).

### Option C — Hybrid

Python checks (Option B) as the always-on hard gate before download.
dvc subprocess as an *optional* "advanced policy lint" surfaced behind a
toggle, for users who want corporate-template conformance. We don't gate
download on it.

### Recommendation

**Option B now, Option C later if a user actually asks for house-style
enforcement.** Option A as a standalone gate is not worth the porting
cost given the semantic mismatch.

Packaging note for Tauri: with Option B there is no extra binary; the
Python sidecar already covers it. If/when we add dvc, the Windows
build of `ExampleWindows.exe` + DLLs goes under
`src-tauri/binaries/dvc/<target-triple>/` and is invoked via
`tauri::api::process::Command::new_sidecar`. macOS/Linux would lack the
sidecar and degrade to Option B only.

---

## 6. Concrete next steps for the main agent

Suggested implementation order. Each step has a clear verify-step.

1. Create `backend/app/validation.py` with a `ValidationReport`
   dataclass (`ok: bool`, `errors: list[ValidationError]`, where
   `ValidationError` carries `code`, `severity`, `message`, `location`).
   → verify: `pytest tests/test_validation_dataclass.py`.
2. In the same file add `validate_structure(doc: HwpxDocument) -> ValidationReport`
   implementing checks #2 (IDREF), #3 (run/para balance), #4 (table grid)
   from §5 Option B. Use the existing parsers in `backend/hwpx_core/document.py`.
   → verify: feed it a known-good fixture and a deliberately-mutilated
   fixture; expect `ok=True` and `ok=False` respectively.
3. Add `backend/tests/fixtures/broken/` with at least three breakage
   samples: (a) dangling `charPrIDRef`, (b) `<hp:tbl rowCnt="3">` with 2
   rows, (c) zero-run paragraph.
4. Add `validate_manifest(zip_path: Path) -> ValidationReport` (check #5).
   → verify: round-trip a fixture, delete one part from the zip in-memory,
   confirm validator flags it.
5. Wire the gate into `backend/app/main.py` at the `/download/{session_id}`
   route (currently around `main.py:151`). Before streaming bytes, call
   `validate_structure` + `validate_manifest` on the session's working
   doc. If `ok=False`, return HTTP 422 with the report serialized to JSON.
   → verify: integration test that POSTs `/upload`, applies a no-op edit,
   GETs `/download/{id}` → 200; then applies a corrupting edit → 422.
6. Add a `GET /validate/{session_id}` route that returns the report
   without consuming/downloading, so the frontend can show preview-time
   warnings.
7. (Optional, defer) Add `validate_schema` using `lxml.etree.XMLSchema`
   against vendored OWPML XSDs. Tracked as a follow-up; XSDs aren't in
   our tree yet.
8. (Optional) Stub `backend/app/dvc_runner.py` that shells out to a dvc
   binary if `settings.DVC_BIN` is set. Wire it as a non-blocking warning
   layer only. Skip until a user requests it.

---

## 7. Risks & open questions

- **Unverified**: I could not confirm whether `hwpx-owpml-model` (the
  parser dvc depends on) recognises 2024-vintage namespace updates
  (`hwpml-1.x` vs `hwpml-2.x`). If we ever go Option A or C, this needs
  a smoke test against a recent Hangul-saved file.
- **Unverified**: dvc's `doValidationCheck()` bool return semantics
  ("check executed" vs "doc passed") inferred from the example, not from
  documentation. If we adopt Option A we must read `Checker.cpp` (not
  fetched here) to confirm.
- **Unverified**: behaviour when the spec file omits a category — I
  inferred from `jsonFullSpec.json`'s comment ("필요한 옵션만 가지고
  와서 spec을 정의하면 됩니다") that omitted keys = unchecked. Worth a
  one-shot test before relying on it.
- **Vendored OWPML XSDs**: Option B step 7 assumes we can obtain them.
  The `hancom-io/hwpx-owpml-model` repo or the OWPML standard document
  (TTAK.KO-10.0124/R1) is the likely source — pending confirmation.
- **Round-trip stability check (Option B step #6 of §5)** is the cheapest
  catch-all and should arguably be implemented first as a safety net even
  before the structural checks land.
- **Licence**: Apache-2.0 is fine for either bundling (Option A/C) or
  inspiration-only (Option B). Attribution required if we bundle.

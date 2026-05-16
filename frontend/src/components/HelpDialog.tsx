import { useEffect, useRef } from 'react'

type Props = {
  open: boolean
  onClose: () => void
}

export function HelpDialog({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal help-modal"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="help-header">
          <h3>📄 hwpx 편집기 사용설명서</h3>
          <button className="help-close" onClick={onClose}>✕</button>
        </div>
        <div className="help-body">

          <section className="help-section">
            <h4>🗂 이 앱은 무엇인가요?</h4>
            <p>
              한글(HWPX) 문서를 열어서 텍스트만 빠르게 바꿔주는 편집기입니다.
              원본의 폰트, 표 구조, 이미지, 서식을 그대로 유지하면서 텍스트 내용만
              수정합니다. 수정이 끝나면 원본과 동일한 서식의 hwpx 파일로 다운로드할 수 있습니다.
            </p>
            <div className="help-note">
              ⚠ 표 추가/삭제, 이미지 삽입, 폰트·색상 변경은 지원하지 않습니다.
              텍스트 내용 변경에 특화된 도구입니다.
            </div>
          </section>

          <section className="help-section">
            <h4>📂 파일 열기</h4>
            <ul>
              <li>화면 중앙의 <b>파일 선택</b> 버튼을 클릭하거나</li>
              <li>hwpx 파일을 화면에 <b>끌어다 놓으세요</b> (드래그 앤 드롭)</li>
            </ul>
            <div className="help-note">
              암호화된 hwpx 파일은 열 수 없습니다.
            </div>
            <div className="help-tip">
              💡 처음 사용하신다면 아래 샘플 파일로 먼저 연습해 보세요.<br />
              <div className="help-samples">
                <a href="/samples/샘플1_공모전참가신청서.hwpx" download>📄 공모전 참가신청서</a>
                <a href="/samples/샘플2_운영계획(이미지포함).hwpx" download>📄 운영계획 (이미지 포함)</a>
                <a href="/samples/샘플3_머리말꼬리말_AI교육서비스안내.hwpx" download>📄 머리말·꼬리말 포함 공문</a>
                <a href="/samples/샘플4_다중섹션_지도강사서식.hwpx" download>📄 다중 섹션 서식</a>
                <a href="/samples/샘플5_연수참가모집공문.hwpx" download>📄 연수 참가 모집 공문</a>
                <a href="/samples/샘플6_다중섹션5개_복무규정.hwpx" download>📄 복무규정 (섹션 5개)</a>
              </div>
            </div>
          </section>

          <section className="help-section">
            <h4>✏ 직접 편집</h4>
            <ul>
              <li>미리보기(가운데 영역)에서 <b>수정하려는 텍스트를 클릭</b>하면 커서가 생깁니다</li>
              <li>원하는 내용을 입력한 뒤 <b>다른 곳을 클릭</b>하면 저장됩니다</li>
              <li>표 안의 셀도 동일한 방식으로 편집할 수 있습니다</li>
              <li>머리말·꼬리말 영역도 미리보기에 표시되며 직접 편집 가능합니다</li>
            </ul>
          </section>

          <section className="help-section">
            <h4>🔁 일괄 변경</h4>
            <ul>
              <li>상단의 <b>찾을 텍스트</b> → <b>바꿀 텍스트</b> 입력 후 <b>일괄 변경</b> 버튼 클릭</li>
              <li>본문·표·머리말·꼬리말·각주 등 문서 전체에서 찾아 바꿉니다</li>
              <li>바뀐 부분은 <b>노란 하이라이트</b>로 표시됩니다</li>
            </ul>
            <div className="help-tip">
              💡 연도 갱신 예시: "찾을 텍스트"에 <code>2025</code>, "바꿀 텍스트"에 <code>2026</code> 입력 후 일괄 변경
            </div>
          </section>

          <section className="help-section">
            <h4>🤖 AI 편집</h4>
            <ul>
              <li>왼쪽 채팅창에 자연어로 편집 요청을 입력합니다</li>
              <li>AI가 변경 목록을 생성하고 자동으로 문서에 적용합니다</li>
              <li>적용된 항목은 오른쪽 <b>변경 사항</b> 패널에 기록됩니다</li>
            </ul>
            <div className="help-tip">
              💡 요청 예시:<br />
              · "2025년을 2026년으로 모두 바꾸고 날짜의 요일도 갱신해줘"<br />
              · "기관명 '성북초'를 '강북초'로 바꿔줘"<br />
              · "'□ 동의'를 '☑ 동의'로 바꿔줘"
            </div>
            <div className="help-note">
              AI를 사용하려면 우상단 <b>⚙ AI 설정</b>에서 API 키를 먼저 입력하세요.
            </div>
            <div className="help-tip">
              💡 <b>API 키 발급 방법 (무료)</b><br />
              <ol className="help-api-steps">
                <li>
                  <b>Gemini</b> (기본 권장) —{' '}
                  Google AI Studio(<code>aistudio.google.com</code>)에 구글 계정으로 로그인
                  → 왼쪽 메뉴 <b>Get API key</b> → <b>Create API key</b> 클릭
                </li>
                <li>
                  <b>Claude</b> —{' '}
                  Anthropic Console(<code>console.anthropic.com</code>) 가입
                  → <b>API Keys</b> → <b>Create Key</b>
                  <span className="help-note-inline"> (유료, 소액 크레딧 필요)</span>
                </li>
                <li>
                  <b>ChatGPT</b> —{' '}
                  OpenAI Platform(<code>platform.openai.com</code>) 가입
                  → <b>API keys</b> → <b>Create new secret key</b>
                  <span className="help-note-inline"> (유료, 소액 크레딧 필요)</span>
                </li>
              </ol>
              발급받은 키를 복사해서 <b>⚙ AI 설정</b> 창의 해당 모델 입력란에 붙여 넣으면 됩니다.
            </div>
          </section>

          <section className="help-section">
            <h4>Ω 기호 삽입</h4>
            <ul>
              <li>상단 <b>Ω 기호</b> 버튼을 클릭하면 자주 쓰는 기호 팔레트가 열립니다</li>
              <li>미리보기에서 삽입할 위치를 먼저 클릭한 뒤 기호를 선택하면 해당 위치에 삽입됩니다</li>
              <li><b>체크박스</b> 카테고리에서는 문서 전체의 □를 ☑로 일괄 변환하는 버튼도 있습니다</li>
            </ul>
          </section>

          <section className="help-section">
            <h4>↶ 되돌리기 / ↷ 다시 실행</h4>
            <ul>
              <li>상단 버튼 또는 <b>⌘Z</b> (Mac) / <b>Ctrl+Z</b> (Windows)로 직전 변경을 취소합니다</li>
              <li><b>⇧⌘Z</b> (Mac) / <b>Ctrl+Shift+Z</b> (Windows)로 취소한 변경을 다시 실행합니다</li>
              <li>최대 100단계까지 되돌릴 수 있습니다</li>
            </ul>
          </section>

          <section className="help-section">
            <h4>📋 변경 사항 패널 (오른쪽)</h4>
            <ul>
              <li>모든 편집 내역이 오른쪽에 카드로 기록됩니다</li>
              <li><b>카드를 클릭</b>하면 미리보기가 해당 위치로 스크롤되고 빨간 하이라이트로 표시됩니다</li>
              <li><b>기록 비우기</b> 버튼으로 변경 기록을 초기화할 수 있습니다</li>
            </ul>
          </section>

          <section className="help-section">
            <h4>⬇ 다운로드</h4>
            <ul>
              <li>편집이 완료되면 상단 <b>⬇ 다운로드</b> 버튼을 클릭합니다</li>
              <li>원본과 동일한 서식의 hwpx 파일로 저장됩니다</li>
              <li>파일명에 ● 표시가 있으면 저장되지 않은 변경 사항이 있다는 의미입니다</li>
            </ul>
          </section>

          <section className="help-section">
            <h4>💡 자주 쓰이는 시나리오</h4>
            <div className="help-scenarios">
              <div className="help-scenario">
                <b>📅 작년 공문 → 올해 버전</b>
                <span>AI에게: "2025년을 2026년으로 바꾸고 날짜의 요일도 갱신해줘"</span>
              </div>
              <div className="help-scenario">
                <b>📝 빈칸 채우기 양식</b>
                <span>셀을 직접 클릭해서 이름·소속·날짜 등을 입력</span>
              </div>
              <div className="help-scenario">
                <b>☑ 체크박스 표시</b>
                <span>기호 팔레트 → 체크박스 → 일괄 토글, 또는 AI에게 특정 항목만 선택 요청</span>
              </div>
              <div className="help-scenario">
                <b>🏫 기관명·담당자 일괄 변경</b>
                <span>일괄 변경으로 기관명·담당자명·공문번호를 한 번에 갱신</span>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}

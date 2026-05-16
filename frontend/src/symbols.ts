// Curated symbol palette mirroring Hancom's Ctrl+F10 popular picks
// (ㅁ/ㅇ/ㅈ/ㄴ/ㄷ + 한자 sets that Korean office users hit most often).

export type SymbolCategory = {
  id: string
  label: string
  items: string[]
}

export const SYMBOL_CATEGORIES: SymbolCategory[] = [
  {
    id: 'checkbox',
    label: '체크박스',
    items: ['□', '☐', '☑', '☒', '■', '▢', '▣', '✓', '✔', '✗', '✘'],
  },
  {
    id: 'shape',
    label: '도형',
    items: [
      '○', '●', '◎', '◇', '◆', '◈',
      '△', '▲', '▽', '▼',
      '☆', '★',
      '♤', '♠', '♡', '♥', '♧', '♣', '♢', '♦',
    ],
  },
  {
    id: 'bullet',
    label: '단락머리·구분자',
    items: [
      '·', '•', '◦', '▪', '▫', '※', '＊',
      '—', '–', '…', '¶', '§', '†', '‡',
    ],
  },
  {
    id: 'arrow',
    label: '화살표',
    items: [
      '→', '←', '↑', '↓', '↔', '↕',
      '⇒', '⇐', '⇑', '⇓', '⇔', '⇕',
      '↗', '↘', '↙', '↖',
      '⇨', '⇦', '⇧', '⇩',
      '➜', '▶', '▷', '◀', '◁',
    ],
  },
  {
    id: 'bracket',
    label: '괄호·인용',
    items: ['「', '」', '『', '』', '【', '】', '〈', '〉', '《', '》', '〔', '〕', '“', '”', '‘', '’'],
  },
  {
    id: 'math',
    label: '수학·논리',
    items: [
      '±', '×', '÷', '√', '∑', '∏', '∫',
      '∞', '≠', '≤', '≥', '≈', '≡',
      '∴', '∵', '⊕', '⊖', '⊗', '⊙',
    ],
  },
  {
    id: 'unit',
    label: '단위',
    items: [
      '℃', '℉', '°', '′', '″', '%', '‰', '‱',
      '㎏', '㎜', '㎝', '㎞', '㎖', '㎗', '㎡', '㎥', '㏖', 'Å',
    ],
  },
  {
    id: 'currency',
    label: '통화',
    items: ['₩', '$', '€', '¥', '£', '¢', '₽', '₹'],
  },
  {
    id: 'circled-num',
    label: '원문자(숫자)',
    items: [
      '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
      '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳',
    ],
  },
  {
    id: 'paren-num',
    label: '괄호(숫자)',
    items: ['⑴', '⑵', '⑶', '⑷', '⑸', '⑹', '⑺', '⑻', '⑼', '⑽'],
  },
  {
    id: 'circled-jamo',
    label: '원문자(자음)',
    items: ['㉠', '㉡', '㉢', '㉣', '㉤', '㉥', '㉦', '㉧', '㉨', '㉩', '㉪', '㉫', '㉬', '㉭'],
  },
  {
    id: 'circled-kor',
    label: '원문자(가나다)',
    items: ['㉮', '㉯', '㉰', '㉱', '㉲', '㉳', '㉴', '㉵', '㉶', '㉷', '㉸', '㉹', '㉺', '㉻'],
  },
  {
    id: 'paren-jamo',
    label: '괄호(자음)',
    items: ['㈀', '㈁', '㈂', '㈃', '㈄', '㈅', '㈆', '㈇', '㈈', '㈉', '㈊', '㈋', '㈌', '㈍'],
  },
  {
    id: 'paren-kor',
    label: '괄호(가나다)',
    items: ['㈎', '㈏', '㈐', '㈑', '㈒', '㈓', '㈔', '㈕', '㈖', '㈗', '㈘', '㈙', '㈚', '㈛'],
  },
  {
    id: 'roman',
    label: '로마숫자',
    items: ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'ⅰ', 'ⅱ', 'ⅲ', 'ⅳ', 'ⅴ', 'ⅵ', 'ⅶ', 'ⅷ', 'ⅸ', 'ⅹ'],
  },
  {
    id: 'misc',
    label: '기타',
    items: ['©', '®', '™', '℠', '№', '☞', '☜', '☝', '★', '☆', '♩', '♪', '♬', '☀', '☁', '☂', '☃', '❄', '☔'],
  },
]

// Pairs that users want to toggle in bulk: { from -> to }.
export type CheckboxPair = { from: string; to: string; label: string }
export const CHECKBOX_PAIRS: CheckboxPair[] = [
  { from: '□', to: '☑', label: '□ → ☑' },
  { from: '☑', to: '□', label: '☑ → □' },
  { from: '□', to: '☒', label: '□ → ☒' },
  { from: '☐', to: '☑', label: '☐ → ☑' },
  { from: '☐', to: '☒', label: '☐ → ☒' },
  { from: '■', to: '□', label: '■ → □' },
  { from: '□', to: '■', label: '□ → ■' },
]

import { useState } from 'react'
import { joinAnswer, type AskQuestion } from '@shared/chat'

interface Props {
  questions: AskQuestion[]
  state: 'pending' | 'answered' | 'cancelled'
  answers?: Record<string, string>
  onAnswer(answers: Record<string, string> | null): void
}

/** Thẻ câu hỏi của tool AskUserQuestion: mỗi câu một nhóm nút chọn, kèm ô "Khác" để tự nhập. */
export function QuestionCard({ questions, state, answers, onAnswer }: Props) {
  const [picked, setPicked] = useState<string[][]>(() => questions.map(() => []))
  const [other, setOther] = useState<string[]>(() => questions.map(() => ''))

  if (state !== 'pending') {
    return (
      <div className="perm question">
        <div>❓ {questions.length > 1 ? `${questions.length} câu hỏi của agent` : 'Câu hỏi của agent'}</div>
        {questions.map((q) => (
          <div key={q.question} className="q-done">
            <span className="muted">{q.question}</span>
            <b>{state === 'answered' ? answers?.[q.question] || '—' : ''}</b>
          </div>
        ))}
        {state === 'cancelled' && <div className="muted small">Đã bỏ qua</div>}
      </div>
    )
  }

  const toggle = (qi: number, label: string) =>
    setPicked((cur) =>
      cur.map((list, i) => {
        if (i !== qi) return list
        if (!questions[qi].multiSelect) return list[0] === label ? [] : [label]
        return list.includes(label) ? list.filter((x) => x !== label) : [...list, label]
      })
    )

  const answerOf = (qi: number) => joinAnswer(picked[qi], other[qi])
  const ready = questions.every((_, i) => answerOf(i) !== '')

  const submit = () => {
    if (!ready) return
    onAnswer(Object.fromEntries(questions.map((q, i) => [q.question, answerOf(i)])))
  }

  // một câu hỏi, chọn một đáp án → bấm là gửi luôn
  const quick = questions.length === 1 && !questions[0].multiSelect

  return (
    <div className="perm question pending">
      {questions.map((q, qi) => (
        <div key={q.question} className="q-block">
          <div className="q-title">
            {q.header && <span className="q-chip">{q.header}</span>}
            <b>{q.question}</b>
            {q.multiSelect && <span className="muted small"> (chọn nhiều)</span>}
          </div>
          <div className="q-options">
            {q.options.map((o) => {
              const on = picked[qi].includes(o.label)
              return (
                <button
                  key={o.label}
                  className={'q-opt' + (on ? ' on' : '')}
                  title={o.preview || o.description}
                  onClick={() => (quick ? onAnswer({ [q.question]: o.label }) : toggle(qi, o.label))}
                >
                  <span className="q-label">
                    {q.multiSelect && <span className="q-check">{on ? '☑' : '☐'}</span>}
                    {o.label}
                  </span>
                  {o.description && <span className="muted small">{o.description}</span>}
                </button>
              )
            })}
          </div>
          <input
            className="q-other"
            placeholder="Khác… (tự nhập câu trả lời)"
            value={other[qi]}
            onChange={(e) => setOther((cur) => cur.map((v, i) => (i === qi ? e.target.value : v)))}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              if (quick && other[qi].trim()) onAnswer({ [q.question]: other[qi].trim() })
              else submit()
            }}
          />
        </div>
      ))}
      <div className="row">
        {!quick && (
          <button className="primary" disabled={!ready} onClick={submit}>
            Gửi câu trả lời
          </button>
        )}
        <button onClick={() => onAnswer(null)} title="Không trả lời, để agent tự quyết">
          Bỏ qua
        </button>
      </div>
    </div>
  )
}

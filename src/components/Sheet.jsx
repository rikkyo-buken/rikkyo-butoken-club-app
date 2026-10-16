import { useCallback, useEffect, useState } from 'react'

// 画面の下から出てくる入力パネル。閉じるときは下にすっと戻る
export default function Sheet({ title, onClose, children }) {
  const [closing, setClosing] = useState(false)

  const close = useCallback(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { onClose(); return }
    setClosing(true)
    setTimeout(onClose, 200)
  }, [onClose])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [close])

  return (
    <div className={`sheet-backdrop${closing ? ' closing' : ''}`} onClick={close}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 className="sheet-title grow">{title}</h2>
          <button type="button" className="btn btn-small btn-ghost" onClick={close}>閉じる</button>
        </div>
        {children}
      </div>
    </div>
  )
}

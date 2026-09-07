'use client'

type Props = {
  active: boolean
  pending?: boolean
  onClick: () => void
  size?: number
}

export default function FavoriteHeart({ active, pending, onClick, size = 20 }: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!pending) onClick()
      }}
      aria-label={active ? '찜 해제' : '찜하기'}
      aria-pressed={active}
      disabled={pending}
      style={{
        width: size + 20,
        height: size + 20,
        borderRadius: '50%',
        border: `1px solid ${active ? '#F2A93B' : '#D9E3EA'}`,
        background: active ? '#FEF6E9' : '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: pending ? 'default' : 'pointer',
        flexShrink: 0,
        opacity: pending ? 0.6 : 1,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill={active ? '#F2A93B' : 'none'}>
        <path
          d="M12 20.5c-.3 0-.6-.1-.8-.3C7.4 17 3.5 13.4 3.5 9.4 3.5 6.6 5.7 4.5 8.4 4.5c1.5 0 3 .7 3.9 1.9.9-1.2 2.4-1.9 3.9-1.9 2.7 0 4.9 2.1 4.9 4.9 0 4-3.9 7.6-7.7 10.8-.2.2-.5.3-.8.3Z"
          stroke={active ? '#F2A93B' : '#5B6B79'}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

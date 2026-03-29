interface AvatarProps {
  username: string
  avatar?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASSES = {
  xs: 'w-7 h-7 text-[9px] border',
  sm:  'w-9 h-9 text-xs border',
  md:  'w-12 h-12 text-sm border',
  lg:  'w-20 h-20 text-xl border-2',
}

export default function Avatar({ username, avatar, size = 'md', className = '' }: AvatarProps) {
  const sizeClass = SIZE_CLASSES[size]
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={username}
        className={`${sizeClass} rounded-full object-cover border-[#ff9066]/20 shrink-0 ${className}`}
      />
    )
  }
  return (
    <div className={`${sizeClass} rounded-full bg-[#2a2a2a] flex items-center justify-center border-[#ff9066]/20 shrink-0 ${className}`}>
      <span className="font-headline font-black text-[#ffb9a0]">{username.slice(0, 2).toUpperCase()}</span>
    </div>
  )
}

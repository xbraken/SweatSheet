import BottomNav from '@/components/BottomNav'

export default function AccountLoading() {
  return (
    <main className="px-5 pt-14 pb-32 space-y-6 animate-pulse">
      <div className="h-8 w-28 bg-surface-container rounded" />

      {/* Avatar + username */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-surface-container" />
        <div className="h-6 w-32 bg-surface-container rounded" />
      </div>

      {/* Unit preference */}
      <div className="h-14 rounded-xl bg-surface-container" />

      {/* Buttons */}
      <div className="space-y-3 mt-4">
        <div className="h-12 rounded-xl bg-surface-container" />
        <div className="h-12 rounded-xl bg-surface-container" />
      </div>

      <BottomNav />
    </main>
  )
}

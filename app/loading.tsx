import BottomNav from '@/components/BottomNav'

export default function HomeLoading() {
  return (
    <main className="px-5 pt-14 pb-32 md:pb-12 space-y-6 animate-pulse max-w-[390px] md:max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="h-4 w-24 bg-surface-container rounded" />
          <div className="h-8 w-48 bg-surface-container rounded mt-2" />
        </div>
        <div className="w-10 h-10 rounded-full bg-surface-container" />
      </div>

      {/* Week strip */}
      <div className="flex gap-2 justify-between">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="h-3 w-6 bg-surface-container rounded" />
            <div className="w-9 h-9 rounded-full bg-surface-container" />
          </div>
        ))}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-2xl bg-surface-container" />
        ))}
      </div>

      {/* Today section */}
      <div className="h-5 w-32 bg-surface-container rounded" />
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-2xl bg-surface-container" />
        ))}
      </div>

      <BottomNav />
    </main>
  )
}

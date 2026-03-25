import BottomNav from '@/components/BottomNav'

export default function ProgressLoading() {
  return (
    <main className="px-5 pt-14 pb-32 md:pb-12 space-y-5 animate-pulse max-w-[390px] md:max-w-3xl mx-auto">
      <div className="h-8 w-32 bg-surface-container rounded" />

      {/* Tab pills */}
      <div className="flex gap-2">
        <div className="h-9 w-20 rounded-full bg-surface-container" />
        <div className="h-9 w-20 rounded-full bg-surface-container" />
      </div>

      {/* Range pills */}
      <div className="flex gap-2">
        {['7D', '1M', '1Y', 'All'].map(r => (
          <div key={r} className="h-8 w-12 rounded-full bg-surface-container" />
        ))}
      </div>

      {/* Chart */}
      <div className="h-28 rounded-2xl bg-surface-container" />

      {/* Exercise selector */}
      <div className="h-12 rounded-xl bg-surface-container" />

      {/* History rows */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-14 rounded-xl bg-surface-container" />
        ))}
      </div>

      <BottomNav />
    </main>
  )
}

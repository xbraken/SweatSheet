import BottomNav from '@/components/BottomNav'

export default function LogLoading() {
  return (
    <main className="px-5 pt-14 pb-32 space-y-5 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-8 w-40 bg-surface-container rounded" />
        <div className="h-8 w-20 rounded-full bg-surface-container" />
      </div>

      {/* Rest timer / config bar */}
      <div className="h-10 rounded-xl bg-surface-container" />

      {/* Blocks */}
      {[1, 2].map(i => (
        <div key={i} className="rounded-2xl bg-surface-container p-4 space-y-3">
          <div className="h-5 w-32 bg-[#1a1a1a] rounded" />
          <div className="space-y-2">
            {[1, 2, 3].map(j => (
              <div key={j} className="flex items-center gap-3">
                <div className="h-10 flex-1 bg-[#1a1a1a] rounded-lg" />
                <div className="h-10 w-16 bg-[#1a1a1a] rounded-lg" />
              </div>
            ))}
          </div>
          <div className="h-12 rounded-xl bg-[#1a1a1a]" />
        </div>
      ))}

      <BottomNav />
    </main>
  )
}

import BottomNav from '@/components/BottomNav'

export default function ImportLoading() {
  return (
    <main className="px-5 pt-14 pb-32 space-y-5 animate-pulse">
      <div className="h-8 w-40 bg-surface-container rounded" />
      <div className="h-4 w-64 bg-surface-container rounded" />
      <div className="h-48 rounded-2xl bg-surface-container mt-4" />
      <BottomNav />
    </main>
  )
}

'use client'
import { RestSettingsBar } from '@/components/log/RestTimer'

/**
 * Shared frame for the lift / bodyweight / timed logging views:
 * sticky header (back, title, PR badges, history), routine progress, rest settings,
 * then the view's own body, then block notes + Skip/Save.
 */
export default function ExerciseShell({
  title, onBack, badges, headerRight, routineBar,
  restValue, onRestChange, unitLabel, onToggleUnit,
  blockNotes, onEditNotes,
  onSkip, onSave, saveDisabled, saveLabel,
  children, after,
}: {
  title: string
  onBack: () => void
  badges?: React.ReactNode
  headerRight?: React.ReactNode
  routineBar?: React.ReactNode
  restValue: number
  onRestChange: (v: number) => void
  unitLabel?: string
  onToggleUnit?: () => void
  blockNotes: string
  onEditNotes: () => void
  onSkip?: () => void
  onSave: () => void
  saveDisabled: boolean
  saveLabel: string
  children: React.ReactNode
  after?: React.ReactNode
}) {
  return (
    <main className="max-w-[390px] md:max-w-3xl mx-auto min-h-screen pb-32 md:pb-12 flex flex-col animate-fade-in-view">
      <div className="sticky top-0 z-40 px-4 py-4 flex flex-col gap-3 bg-surface-container-lowest/90 backdrop-blur-md border-b border-surface-container">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-1 text-outline w-16">
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            <span className="text-sm font-bold">Back</span>
          </button>
          <div className="flex flex-col items-center gap-1 min-w-0">
            <h2 className="font-headline font-bold text-on-surface text-center">{title}</h2>
            {badges}
          </div>
          {headerRight ?? <div className="w-16" />}
        </div>
        {routineBar}
        <RestSettingsBar value={restValue} onChange={onRestChange} unitLabel={unitLabel} onToggleUnit={onToggleUnit} />
      </div>

      <div className="flex-grow px-4 pt-6 space-y-2">
        {children}
      </div>

      <div className="px-4 pb-8 pt-4">
        <button
          type="button"
          onClick={onEditNotes}
          className="w-full mb-3 bg-surface-container rounded-xl px-4 py-2.5 text-left flex items-start gap-3 hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-outline text-base shrink-0 mt-0.5">{blockNotes ? 'sticky_note_2' : 'add_notes'}</span>
          {blockNotes ? (
            <p className="text-sm text-on-surface-variant italic flex-1 line-clamp-2 whitespace-pre-wrap">{blockNotes}</p>
          ) : (
            <span className="text-sm text-outline-variant flex-1">Notes about this workout…</span>
          )}
          <span className="material-symbols-outlined text-outline-variant text-base shrink-0 mt-0.5">edit</span>
        </button>
        <div className="flex gap-2">
          {onSkip && (
            <button
              onClick={onSkip}
              className="px-5 py-4 bg-surface-container text-outline rounded-2xl font-headline font-bold text-base active:scale-95 transition-all hover:bg-surface-container-high"
            >
              Skip
            </button>
          )}
          <button
            onClick={onSave}
            disabled={saveDisabled}
            className="flex-1 py-4 bg-surface-container text-on-surface rounded-2xl font-headline font-bold text-base active:scale-95 transition-all disabled:opacity-30 hover:bg-surface-container-high"
          >
            {saveLabel}
          </button>
        </div>
      </div>

      {after}
    </main>
  )
}

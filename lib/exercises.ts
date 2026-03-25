export type ExerciseCategory =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Legs'
  | 'Arms'
  | 'Core'
  | 'Full Body'
  | 'Olympic'

export type Exercise = {
  name: string
  category: ExerciseCategory
}

export const EXERCISES: Exercise[] = [
  // ── Chest ────────────────────────────────────────
  { name: 'Bench Press', category: 'Chest' },
  { name: 'Incline Bench Press', category: 'Chest' },
  { name: 'Decline Bench Press', category: 'Chest' },
  { name: 'Dumbbell Bench Press', category: 'Chest' },
  { name: 'Incline Dumbbell Press', category: 'Chest' },
  { name: 'Dumbbell Fly', category: 'Chest' },
  { name: 'Cable Fly', category: 'Chest' },
  { name: 'Cable Crossover', category: 'Chest' },
  { name: 'Chest Dip', category: 'Chest' },
  { name: 'Machine Chest Press', category: 'Chest' },
  { name: 'Pec Deck', category: 'Chest' },
  { name: 'Push-up', category: 'Chest' },

  // ── Back ─────────────────────────────────────────
  { name: 'Deadlift', category: 'Back' },
  { name: 'Barbell Row', category: 'Back' },
  { name: 'Dumbbell Row', category: 'Back' },
  { name: 'Pull-up', category: 'Back' },
  { name: 'Chin-up', category: 'Back' },
  { name: 'Lat Pulldown', category: 'Back' },
  { name: 'Seated Cable Row', category: 'Back' },
  { name: 'T-Bar Row', category: 'Back' },
  { name: 'Face Pull', category: 'Back' },
  { name: 'Shrug', category: 'Back' },
  { name: 'Rack Pull', category: 'Back' },
  { name: 'Pendlay Row', category: 'Back' },
  { name: 'Straight Arm Pulldown', category: 'Back' },
  { name: 'Hyperextension', category: 'Back' },

  // ── Shoulders ────────────────────────────────────
  { name: 'Overhead Press', category: 'Shoulders' },
  { name: 'Dumbbell Shoulder Press', category: 'Shoulders' },
  { name: 'Arnold Press', category: 'Shoulders' },
  { name: 'Lateral Raise', category: 'Shoulders' },
  { name: 'Cable Lateral Raise', category: 'Shoulders' },
  { name: 'Front Raise', category: 'Shoulders' },
  { name: 'Reverse Fly', category: 'Shoulders' },
  { name: 'Upright Row', category: 'Shoulders' },
  { name: 'Machine Shoulder Press', category: 'Shoulders' },

  // ── Legs ─────────────────────────────────────────
  { name: 'Squat', category: 'Legs' },
  { name: 'Front Squat', category: 'Legs' },
  { name: 'Goblet Squat', category: 'Legs' },
  { name: 'Leg Press', category: 'Legs' },
  { name: 'Hack Squat', category: 'Legs' },
  { name: 'Romanian Deadlift', category: 'Legs' },
  { name: 'Stiff Leg Deadlift', category: 'Legs' },
  { name: 'Bulgarian Split Squat', category: 'Legs' },
  { name: 'Lunge', category: 'Legs' },
  { name: 'Walking Lunge', category: 'Legs' },
  { name: 'Leg Extension', category: 'Legs' },
  { name: 'Leg Curl', category: 'Legs' },
  { name: 'Seated Leg Curl', category: 'Legs' },
  { name: 'Hip Thrust', category: 'Legs' },
  { name: 'Calf Raise', category: 'Legs' },
  { name: 'Seated Calf Raise', category: 'Legs' },
  { name: 'Glute Bridge', category: 'Legs' },
  { name: 'Step Up', category: 'Legs' },
  { name: 'Sumo Deadlift', category: 'Legs' },

  // ── Arms ─────────────────────────────────────────
  { name: 'Barbell Curl', category: 'Arms' },
  { name: 'Dumbbell Curl', category: 'Arms' },
  { name: 'Hammer Curl', category: 'Arms' },
  { name: 'Preacher Curl', category: 'Arms' },
  { name: 'Cable Curl', category: 'Arms' },
  { name: 'Concentration Curl', category: 'Arms' },
  { name: 'EZ Bar Curl', category: 'Arms' },
  { name: 'Tricep Pushdown', category: 'Arms' },
  { name: 'Overhead Tricep Extension', category: 'Arms' },
  { name: 'Skull Crusher', category: 'Arms' },
  { name: 'Close Grip Bench Press', category: 'Arms' },
  { name: 'Dumbbell Tricep Kickback', category: 'Arms' },
  { name: 'Dip', category: 'Arms' },
  { name: 'Wrist Curl', category: 'Arms' },

  // ── Core ─────────────────────────────────────────
  { name: 'Plank', category: 'Core' },
  { name: 'Crunch', category: 'Core' },
  { name: 'Cable Crunch', category: 'Core' },
  { name: 'Hanging Leg Raise', category: 'Core' },
  { name: 'Ab Wheel Rollout', category: 'Core' },
  { name: 'Russian Twist', category: 'Core' },
  { name: 'Side Plank', category: 'Core' },
  { name: 'Woodchop', category: 'Core' },

  // ── Full Body ────────────────────────────────────
  { name: 'Burpee', category: 'Full Body' },
  { name: 'Kettlebell Swing', category: 'Full Body' },
  { name: 'Turkish Get-Up', category: 'Full Body' },
  { name: 'Farmers Walk', category: 'Full Body' },
  { name: 'Battle Ropes', category: 'Full Body' },

  // ── Olympic ──────────────────────────────────────
  { name: 'Clean and Jerk', category: 'Olympic' },
  { name: 'Snatch', category: 'Olympic' },
  { name: 'Power Clean', category: 'Olympic' },
  { name: 'Clean Pull', category: 'Olympic' },
  { name: 'Push Press', category: 'Olympic' },
]

export const CATEGORIES: ExerciseCategory[] = [
  'Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Core', 'Full Body', 'Olympic',
]

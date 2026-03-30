export type ExerciseCategory =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Legs'
  | 'Arms'
  | 'Core'
  | 'Full Body'
  | 'Olympic'

export type ExerciseType = 'weights' | 'bodyweight' | 'timed'

export type Exercise = {
  name: string
  category: ExerciseCategory
  type: ExerciseType
}

export const EXERCISES: Exercise[] = [
  // ── Chest ────────────────────────────────────────
  { name: 'Bench Press', category: 'Chest', type: 'weights' },
  { name: 'Incline Bench Press', category: 'Chest', type: 'weights' },
  { name: 'Decline Bench Press', category: 'Chest', type: 'weights' },
  { name: 'Dumbbell Bench Press', category: 'Chest', type: 'weights' },
  { name: 'Incline Dumbbell Press', category: 'Chest', type: 'weights' },
  { name: 'Dumbbell Fly', category: 'Chest', type: 'weights' },
  { name: 'Cable Fly', category: 'Chest', type: 'weights' },
  { name: 'Cable Crossover', category: 'Chest', type: 'weights' },
  { name: 'Chest Dip', category: 'Chest', type: 'bodyweight' },
  { name: 'Machine Chest Press', category: 'Chest', type: 'weights' },
  { name: 'Pec Deck', category: 'Chest', type: 'weights' },
  { name: 'Push-up', category: 'Chest', type: 'bodyweight' },

  // ── Back ─────────────────────────────────────────
  { name: 'Deadlift', category: 'Back', type: 'weights' },
  { name: 'Barbell Row', category: 'Back', type: 'weights' },
  { name: 'Dumbbell Row', category: 'Back', type: 'weights' },
  { name: 'Pull-up', category: 'Back', type: 'bodyweight' },
  { name: 'Chin-up', category: 'Back', type: 'bodyweight' },
  { name: 'Lat Pulldown', category: 'Back', type: 'weights' },
  { name: 'Seated Cable Row', category: 'Back', type: 'weights' },
  { name: 'T-Bar Row', category: 'Back', type: 'weights' },
  { name: 'Face Pull', category: 'Back', type: 'weights' },
  { name: 'Shrug', category: 'Back', type: 'weights' },
  { name: 'Rack Pull', category: 'Back', type: 'weights' },
  { name: 'Pendlay Row', category: 'Back', type: 'weights' },
  { name: 'Straight Arm Pulldown', category: 'Back', type: 'weights' },
  { name: 'Hyperextension', category: 'Back', type: 'bodyweight' },

  // ── Shoulders ────────────────────────────────────
  { name: 'Overhead Press', category: 'Shoulders', type: 'weights' },
  { name: 'Dumbbell Shoulder Press', category: 'Shoulders', type: 'weights' },
  { name: 'Arnold Press', category: 'Shoulders', type: 'weights' },
  { name: 'Lateral Raise', category: 'Shoulders', type: 'weights' },
  { name: 'Cable Lateral Raise', category: 'Shoulders', type: 'weights' },
  { name: 'Front Raise', category: 'Shoulders', type: 'weights' },
  { name: 'Reverse Fly', category: 'Shoulders', type: 'weights' },
  { name: 'Upright Row', category: 'Shoulders', type: 'weights' },
  { name: 'Machine Shoulder Press', category: 'Shoulders', type: 'weights' },

  // ── Legs ─────────────────────────────────────────
  { name: 'Squat', category: 'Legs', type: 'weights' },
  { name: 'Front Squat', category: 'Legs', type: 'weights' },
  { name: 'Goblet Squat', category: 'Legs', type: 'weights' },
  { name: 'Leg Press', category: 'Legs', type: 'weights' },
  { name: 'Hack Squat', category: 'Legs', type: 'weights' },
  { name: 'Romanian Deadlift', category: 'Legs', type: 'weights' },
  { name: 'Stiff Leg Deadlift', category: 'Legs', type: 'weights' },
  { name: 'Bulgarian Split Squat', category: 'Legs', type: 'weights' },
  { name: 'Lunge', category: 'Legs', type: 'weights' },
  { name: 'Walking Lunge', category: 'Legs', type: 'weights' },
  { name: 'Leg Extension', category: 'Legs', type: 'weights' },
  { name: 'Leg Curl', category: 'Legs', type: 'weights' },
  { name: 'Seated Leg Curl', category: 'Legs', type: 'weights' },
  { name: 'Hip Thrust', category: 'Legs', type: 'weights' },
  { name: 'Calf Raise', category: 'Legs', type: 'weights' },
  { name: 'Seated Calf Raise', category: 'Legs', type: 'weights' },
  { name: 'Glute Bridge', category: 'Legs', type: 'bodyweight' },
  { name: 'Step Up', category: 'Legs', type: 'bodyweight' },
  { name: 'Sumo Deadlift', category: 'Legs', type: 'weights' },
  { name: 'Wall Sit', category: 'Legs', type: 'timed' },

  // ── Arms ─────────────────────────────────────────
  { name: 'Barbell Curl', category: 'Arms', type: 'weights' },
  { name: 'Dumbbell Curl', category: 'Arms', type: 'weights' },
  { name: 'Hammer Curl', category: 'Arms', type: 'weights' },
  { name: 'Preacher Curl', category: 'Arms', type: 'weights' },
  { name: 'Cable Curl', category: 'Arms', type: 'weights' },
  { name: 'Concentration Curl', category: 'Arms', type: 'weights' },
  { name: 'EZ Bar Curl', category: 'Arms', type: 'weights' },
  { name: 'Tricep Pushdown', category: 'Arms', type: 'weights' },
  { name: 'Overhead Tricep Extension', category: 'Arms', type: 'weights' },
  { name: 'Skull Crusher', category: 'Arms', type: 'weights' },
  { name: 'Close Grip Bench Press', category: 'Arms', type: 'weights' },
  { name: 'Dumbbell Tricep Kickback', category: 'Arms', type: 'weights' },
  { name: 'Dip', category: 'Arms', type: 'weights' },
  { name: 'Wrist Curl', category: 'Arms', type: 'weights' },

  // ── Core ─────────────────────────────────────────
  { name: 'Plank', category: 'Core', type: 'timed' },
  { name: 'Crunch', category: 'Core', type: 'bodyweight' },
  { name: 'Cable Crunch', category: 'Core', type: 'weights' },
  { name: 'Hanging Leg Raise', category: 'Core', type: 'bodyweight' },
  { name: 'Ab Wheel Rollout', category: 'Core', type: 'bodyweight' },
  { name: 'Russian Twist', category: 'Core', type: 'bodyweight' },
  { name: 'Side Plank', category: 'Core', type: 'timed' },
  { name: 'Woodchop', category: 'Core', type: 'weights' },

  // ── Full Body ────────────────────────────────────
  { name: 'Burpee', category: 'Full Body', type: 'bodyweight' },
  { name: 'Kettlebell Swing', category: 'Full Body', type: 'weights' },
  { name: 'Turkish Get-Up', category: 'Full Body', type: 'weights' },
  { name: 'Farmers Walk', category: 'Full Body', type: 'timed' },
  { name: 'Battle Ropes', category: 'Full Body', type: 'timed' },

  // ── Olympic ──────────────────────────────────────
  { name: 'Clean and Jerk', category: 'Olympic', type: 'weights' },
  { name: 'Snatch', category: 'Olympic', type: 'weights' },
  { name: 'Power Clean', category: 'Olympic', type: 'weights' },
  { name: 'Clean Pull', category: 'Olympic', type: 'weights' },
  { name: 'Push Press', category: 'Olympic', type: 'weights' },
]

export const CATEGORIES: ExerciseCategory[] = [
  'Chest', 'Back', 'Shoulders', 'Legs', 'Arms', 'Core', 'Full Body', 'Olympic',
]

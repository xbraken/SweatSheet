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

// Secondary muscles trained by each exercise (gets 0.5× credit on the heatmap).
// Only listed where the secondary engagement is meaningful.
export const SECONDARY_MUSCLES: Record<string, ExerciseCategory[]> = {
  // Chest pushes — triceps + front delts
  'Bench Press': ['Shoulders', 'Arms'],
  'Incline Bench Press': ['Shoulders', 'Arms'],
  'Decline Bench Press': ['Shoulders', 'Arms'],
  'Dumbbell Bench Press': ['Shoulders', 'Arms'],
  'Incline Dumbbell Press': ['Shoulders', 'Arms'],
  'Machine Chest Press': ['Shoulders', 'Arms'],
  'Chest Dip': ['Shoulders', 'Arms'],
  'Push-up': ['Shoulders', 'Arms', 'Core'],
  'Cable Fly': ['Shoulders'],
  'Cable Crossover': ['Shoulders'],
  'Dumbbell Fly': ['Shoulders'],
  'Pec Deck': ['Shoulders'],

  // Back pulls — biceps + core (esp. deadlifts)
  'Deadlift': ['Legs', 'Core'],
  'Rack Pull': ['Legs', 'Core'],
  'Sumo Deadlift': ['Back', 'Core'],
  'Romanian Deadlift': ['Back', 'Core'],
  'Stiff Leg Deadlift': ['Back', 'Core'],
  'Barbell Row': ['Arms', 'Core'],
  'Pendlay Row': ['Arms', 'Core'],
  'Dumbbell Row': ['Arms', 'Core'],
  'T-Bar Row': ['Arms', 'Core'],
  'Seated Cable Row': ['Arms'],
  'Pull-up': ['Arms', 'Core'],
  'Chin-up': ['Arms', 'Core'],
  'Lat Pulldown': ['Arms'],
  'Straight Arm Pulldown': ['Arms'],
  'Hyperextension': ['Core'],

  // Shoulders — triceps + core for OHP
  'Overhead Press': ['Arms', 'Core'],
  'Dumbbell Shoulder Press': ['Arms', 'Core'],
  'Machine Shoulder Press': ['Arms'],
  'Arnold Press': ['Arms', 'Core'],
  'Upright Row': ['Arms'],

  // Legs — core + back for compounds
  'Squat': ['Core'],
  'Front Squat': ['Core', 'Shoulders'],
  'Goblet Squat': ['Core', 'Arms'],
  'Hack Squat': ['Core'],
  'Leg Press': ['Core'],
  'Bulgarian Split Squat': ['Core'],
  'Lunge': ['Core'],
  'Walking Lunge': ['Core'],
  'Hip Thrust': ['Core'],
  'Glute Bridge': ['Core'],
  'Step Up': ['Core'],

  // Arms — pushdowns/curls relatively isolated
  'Close Grip Bench Press': ['Chest', 'Shoulders'],
  'Skull Crusher': ['Shoulders'],
  'Overhead Tricep Extension': ['Shoulders'],
  'Dip': ['Chest', 'Shoulders'],

  // Core — ab work that hits other groups
  'Plank': ['Shoulders', 'Arms'],
  'Side Plank': ['Shoulders', 'Core'],
  'Hanging Leg Raise': ['Arms', 'Back'],
  'Ab Wheel Rollout': ['Shoulders', 'Arms'],

  // Full body — broad engagement
  'Burpee': ['Chest', 'Shoulders', 'Arms', 'Legs', 'Core'],
  'Kettlebell Swing': ['Back', 'Legs', 'Core', 'Shoulders'],
  'Turkish Get-Up': ['Shoulders', 'Core', 'Legs'],
  'Farmers Walk': ['Back', 'Arms', 'Core', 'Legs'],
  'Battle Ropes': ['Shoulders', 'Arms', 'Core', 'Back'],

  // Olympic — almost everything
  'Clean and Jerk': ['Back', 'Legs', 'Shoulders', 'Arms', 'Core'],
  'Snatch': ['Back', 'Legs', 'Shoulders', 'Arms', 'Core'],
  'Power Clean': ['Back', 'Legs', 'Shoulders', 'Core'],
  'Clean Pull': ['Back', 'Legs', 'Core'],
  'Push Press': ['Shoulders', 'Arms', 'Legs', 'Core'],
}

export const SECONDARY_WEIGHT = 0.5

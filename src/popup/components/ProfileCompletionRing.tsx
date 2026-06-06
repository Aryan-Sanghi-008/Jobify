interface ProfileCompletionRingProps {
  score: number;
}

function getRingColor(score: number): string {
  if (score <= 40) {
    return '#dc2626';
  }

  if (score <= 70) {
    return '#d97706';
  }

  return '#16a34a';
}

const RING_SIZE = 64;
const STROKE_WIDTH = 6;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function ProfileCompletionRing({ score }: ProfileCompletionRingProps) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const offset = CIRCUMFERENCE - (clampedScore / 100) * CIRCUMFERENCE;
  const color = getRingColor(clampedScore);
  const isComplete = clampedScore === 100;

  return (
    <div className="flex items-center gap-3">
      <div
        className="relative shrink-0"
        role="img"
        aria-label={
          isComplete
            ? 'Profile complete'
            : `Profile completion: ${clampedScore} percent`
        }
      >
        <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={STROKE_WIDTH}
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {isComplete ? (
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 text-green-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <span className="text-sm font-semibold text-gray-900">{clampedScore}</span>
          )}
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">
          {isComplete ? 'Profile complete!' : 'Profile completion'}
        </p>
        <p className="text-xs text-gray-500">
          {isComplete
            ? 'You are ready to auto-fill applications.'
            : `${clampedScore}% filled — complete key fields for better matches.`}
        </p>
      </div>
    </div>
  );
}

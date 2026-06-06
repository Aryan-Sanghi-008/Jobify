interface ProfileEmptyStateProps {
  onGoToProfile: () => void;
}

export default function ProfileEmptyState({ onGoToProfile }: ProfileEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-semibold text-gray-900">Complete your profile first</p>
      <p className="mt-2 text-xs text-gray-500">
        Add your email and details in Profile before using this section.
      </p>
      <button
        type="button"
        onClick={onGoToProfile}
        className="mt-6 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Go to Profile
      </button>
    </div>
  );
}

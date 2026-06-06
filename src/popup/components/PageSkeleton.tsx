export default function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4 px-4 py-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="h-14 rounded-lg bg-gray-200" />
        <div className="h-14 rounded-lg bg-gray-200" />
        <div className="h-14 rounded-lg bg-gray-200" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2">
            <div className="h-3 w-24 rounded bg-gray-200" />
            <div className="h-9 w-full rounded-md bg-gray-200" />
          </div>
        ))}
      </div>

      <div className="h-10 w-full rounded-lg bg-gray-200" />
    </div>
  );
}

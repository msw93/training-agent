export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-gradient-to-r from-indigo-100 to-purple-100">
            <th className="px-4 py-3 font-semibold text-gray-700">Title</th>
            <th className="px-4 py-3 font-semibold text-gray-700">Start</th>
            <th className="px-4 py-3 font-semibold text-gray-700">End</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, idx) => (
            <tr key={idx} className={`border-b ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
              <td className="px-4 py-3">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
              </td>
              <td className="px-4 py-3">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-5/6"></div>
              </td>
              <td className="px-4 py-3">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-5/6"></div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProposalSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="flex items-start gap-4 p-5 bg-white border border-gray-200 rounded-xl">
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded animate-pulse w-full"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-4/5"></div>
          </div>
          <div className="shrink-0 h-10 w-24 bg-gray-200 rounded-lg animate-pulse"></div>
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-6 border border-indigo-100">
      <div className="h-6 bg-gray-200 rounded animate-pulse w-1/3 mb-4"></div>
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 rounded animate-pulse w-full"></div>
        <div className="h-4 bg-gray-200 rounded animate-pulse w-5/6"></div>
        <div className="h-4 bg-gray-200 rounded animate-pulse w-4/5"></div>
      </div>
    </div>
  );
}


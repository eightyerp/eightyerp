export default function CustomersLoading() {
  return (
    <div className="space-y-6" aria-label="고객 목록 로딩 중" aria-busy="true">
      <div className="h-16 animate-pulse rounded-xl bg-gray-100" />
      <div className="dashboard-card grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="h-10 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
      <div className="dashboard-card overflow-hidden">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="h-14 animate-pulse border-b border-gray-100 bg-white last:border-0"
          />
        ))}
      </div>
    </div>
  );
}

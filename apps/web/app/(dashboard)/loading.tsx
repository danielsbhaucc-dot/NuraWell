export default function DashboardLoading() {
  return (
    <div>
      {/* Purple hero skeleton */}
      <div className="-mt-16 pt-16 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #047857 0%, #059669 50%, #10b981 80%, #34d399 100%)' }}>
        <div style={{ padding: '12px 20px 40px' }}>
          <div className="flex items-end gap-3.5">
            <div className="flex-shrink-0 w-[82px] h-[82px] rounded-full animate-pulse" style={{ background: 'rgba(255,255,255,0.15)' }} />
            <div className="flex-1 rounded-[18px] h-[70px] animate-pulse" style={{ background: 'rgba(255,255,255,0.10)' }} />
          </div>
        </div>
      </div>

      {/* White body skeleton */}
      <div style={{
        background: '#EDF5F0', borderRadius: '26px 26px 0 0', marginTop: '-18px',
        padding: '22px 16px 20px', position: 'relative', zIndex: 3, minHeight: '55vh',
      }}>
        {/* Progress card skeleton */}
        <div className="flex gap-3.5 items-center mb-3.5 p-4 animate-pulse"
          style={{ background: 'rgba(255,255,255,0.92)', borderRadius: '22px', border: '1px solid rgba(255,255,255,0.8)', boxShadow: '0 4px 20px rgba(6,78,59,0.08)' }}>
          <div className="w-[58px] h-[58px] rounded-[18px]" style={{ background: 'linear-gradient(145deg, #047857, #10b981)' }} />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 rounded-lg" style={{ background: 'rgba(6,78,59,0.12)' }} />
            <div className="h-3 w-40 rounded-md" style={{ background: 'rgba(6,78,59,0.07)' }} />
            <div className="flex gap-1">
              {[0,1,2,3,4,5].map(i => <div key={i} className="h-1.5 flex-1 rounded-full" style={{ background: 'rgba(6,78,59,0.08)' }} />)}
            </div>
          </div>
        </div>

        {/* Badge skeleton */}
        <div className="flex items-center gap-3.5 mb-4 p-3.5 px-4 animate-pulse"
          style={{ background: '#FFF8E7', borderRadius: '20px', border: '1.5px solid rgba(245,166,35,0.2)' }}>
          <div className="w-[50px] h-[50px] rounded-[16px]" style={{ background: 'rgba(245,166,35,0.3)' }} />
          <div className="space-y-1.5 flex-1">
            <div className="h-3.5 w-28 rounded-lg" style={{ background: 'rgba(245,166,35,0.15)' }} />
            <div className="h-3 w-36 rounded-md" style={{ background: 'rgba(245,166,35,0.10)' }} />
          </div>
        </div>

        {/* Section label skeleton */}
        <div className="h-3 w-16 rounded-md mt-4 mb-3 ml-0.5 animate-pulse" style={{ background: 'rgba(6,78,59,0.10)' }} />

        {/* Lesson-card skeletons */}
        {[0, 1, 2].map((i) => (
          <div key={i} className="mb-3.5 overflow-hidden animate-pulse"
            style={{ borderRadius: '22px', boxShadow: '0 4px 20px rgba(6,78,59,0.12)', animationDelay: `${i * 100}ms` }}>
            <div style={{ background: 'linear-gradient(145deg, #047857, #059669, #10b981)', padding: '18px 16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div className="w-12 h-12 rounded-[15px]" style={{ background: 'rgba(255,255,255,0.15)' }} />
              <div className="flex-1 space-y-1.5">
                <div className="h-2.5 w-20 rounded-md" style={{ background: 'rgba(255,255,255,0.15)' }} />
                <div className="h-4 w-40 rounded-lg" style={{ background: 'rgba(255,255,255,0.2)' }} />
              </div>
              <div className="w-[42px] h-[42px] rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
            </div>
            <div style={{ background: 'rgba(255,255,255,0.97)', padding: '12px 16px' }}>
              <div className="h-3 w-full rounded-md mb-2" style={{ background: 'rgba(6,78,59,0.07)' }} />
              <div className="flex justify-between items-center">
                <div className="h-3 w-20 rounded-md" style={{ background: 'rgba(6,78,59,0.08)' }} />
                <div className="h-5 w-20 rounded-full" style={{ background: 'rgba(13,189,184,0.1)' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

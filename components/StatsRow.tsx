interface Stat {
  label: string;
  value: string;
  accent: string;
  hint: string;
}

export default function StatsRow({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-card border border-line bg-white px-4 py-3.5 shadow-card"
        >
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: stat.accent }}
            />
            <span className="truncate text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
              {stat.label}
            </span>
          </div>
          <p className="mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em]">
            {stat.value}
          </p>
          <p className="mt-1.5 text-[11.5px] text-muted">{stat.hint}</p>
        </div>
      ))}
    </div>
  );
}

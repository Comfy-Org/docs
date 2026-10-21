// Charts for the Rankings page. Everything is drawn as plain SVG with React so
// the page needs no chart library. The data comes from rankings-data.jsx and
// holds shares and times only.

export const RANKING_COLORS = ["#4E79A7", "#F28E2B", "#59A14F", "#E15759", "#B07AA1", "#76B7B2", "#EDC948", "#FF9DA7"];
export const RANKING_OPACITY = [1, 0.72, 0.5, 0.34, 0.22, 0.14, 0.09];

export const rankingColor = (i) => [RANKING_COLORS[i % 8], RANKING_OPACITY[Math.min(RANKING_OPACITY.length - 1, Math.floor(i / 8))]];

export const fmtPct = (v) => (v == null || isNaN(v) ? "–" : v > 0 && v < 0.0005 ? "<0.1%" : (100 * v).toFixed(1) + "%");

export const fmtPts = (v) => (Math.abs(v) < 0.05 ? "0.0" : (v > 0 ? "+" : "") + v.toFixed(1));

export const fmtTime = (v) => {
  if (v == null || isNaN(v)) return "–";
  if (v === 0) return "0";
  if (v < 10) return v.toFixed(1) + "s";
  if (v < 60) return Math.round(v) + "s";
  const m = Math.floor(v / 60);
  const s = Math.round(v - m * 60);
  return s === 60 ? m + 1 + "m" : s === 0 ? m + "m" : m + "m " + s + "s";
};

export const RANKING_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const fmtDay = (iso) => RANKING_MONTHS[+iso.slice(5, 7) - 1] + " " + +iso.slice(8, 10);

export const fmtMonthName = (iso) => ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][+iso.slice(5, 7) - 1];

// A period that runs past the snapshot's last day is partial: label it with its cutoff.
export const isPartial = (iso, through) => !!through && iso.slice(0, 7) === through.slice(0, 7) && +through.slice(8, 10) < 28;

export const fmtMonth = (iso, short) => RANKING_MONTHS[+iso.slice(5, 7) - 1] + " " + (short ? "'" + iso.slice(2, 4) : iso.slice(0, 4));

// Rough label width for 12px text, so long names can be clipped to fit.
export const textWidth = (s) => s.length * 6.4;

export const clipText = (s, max) => {
  if (textWidth(s) <= max) return s;
  const n = Math.max(0, Math.floor(max / 6.4) - 1);
  return n > 2 ? s.slice(0, n) + "…" : "";
};

export const useRankingWidth = () => {
  const ref = useRef(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    if (!ref.current) return;
    const update = () => ref.current && setWidth(Math.max(280, ref.current.clientWidth));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
};

export const RankingSeg = ({ label, options, value, onChange }) => (
  <div className="mr-ctrl">
    <span className="mr-ctrl-label">{label}</span>
    <div className="mr-seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  </div>
);

export const RankingTip = ({ tip }) => {
  if (!tip) return null;
  return (
    <div className="mr-tip" style={{ left: tip.x, top: tip.y }}>
      <div className="mr-tip-h">{tip.head}</div>
      {tip.lines.map(([color, name, val], i) => (
        <div className="mr-tip-r" key={i}>
          {color ? <span className="mr-sw" style={{ background: color[0], opacity: color[1] }} /> : null}
          <span>{name}</span>
          <b>{val}</b>
        </div>
      ))}
    </div>
  );
};

// Tooltip position relative to the chart box, kept inside it.
export const useRankingTip = () => {
  const [tip, setTip] = useState(null);
  const show = (ev, head, lines) => {
    const box = ev.currentTarget.closest(".mr-chart");
    if (!box) return;
    const b = box.getBoundingClientRect();
    let x = ev.clientX - b.left + 14;
    let y = ev.clientY - b.top + 14;
    if (x + 240 > b.width) x = Math.max(0, ev.clientX - b.left - 254);
    if (y + 90 > b.height) y = Math.max(0, ev.clientY - b.top - 100);
    setTip({ x, y, head, lines });
  };
  return [tip, show, () => setTip(null)];
};

export const RankingMore = ({ total, open, onToggle, noun }) =>
  total <= 10 ? null : (
    <button type="button" className="mr-more" aria-expanded={open} onClick={onToggle}>
      {open ? "Show top 10 only" : "Show all " + total + (noun ? " " + noun : "")}
    </button>
  );

export const ShareTable = ({ rows, cols, colorOf }) => (
  <div className="mr-tbox">
    <table className="mr-table">
      <thead>
        <tr>
          {cols.map((c, i) => (
            <th key={i} className={i ? "num" : ""}>
              {c[0]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            {cols.map((c, i) => {
              const v = c[1](r);
              const cls = c[2] ? c[2](r) : "";
              if (i === 0) {
                const k = colorOf ? colorOf(r) : null;
                return (
                  <td key={i}>
                    {k ? <span className="mr-sw" style={{ background: k[0], opacity: k[1] }} /> : null}
                    {v}
                  </td>
                );
              }
              return (
                <td key={i} className={"num " + cls}>
                  {v}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const changeClass = (r) => (Math.abs(r.change) < 0.05 ? "" : r.change > 0 ? "mr-up" : "mr-down");

// 100% stacked bars, one per period. `series` is [{name, color, s: [share per period]}].
export const StackedShareBars = ({ periods, series, label, axisLabel, shortLabel, tipHead, tipName }) => {
  const [ref, W] = useRankingWidth();
  const [tip, show, hide] = useRankingTip();
  const H = 340;
  const mb = 22;
  const ml = 40;
  const n = periods.length;
  const step = (W - 4 - ml) / n;
  const bw = step * (n > 20 ? 0.85 : 0.78);
  const y = (v) => H - mb - v * (H - mb - 6);
  const useShort = shortLabel && periods.some((p) => textWidth(axisLabel(p)) + 8 > step);
  const tick = useShort ? shortLabel : axisLabel;
  const every = Math.max(1, Math.ceil((Math.max(...periods.map((p) => textWidth(tick(p)))) + 12) / step));
  return (
    <div className="mr-chart" ref={ref} onMouseLeave={hide}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={ml} x2={W - 4} y1={y(t)} y2={y(t)} className="mr-grid" />
            <text x={ml - 8} y={y(t)} dy="0.35em" textAnchor="end">
              {Math.round(t * 100) + "%"}
            </text>
          </g>
        ))}
        {periods.map((p, pi) => {
          const x = ml + pi * step + (step - bw) / 2;
          let acc = 0;
          return (
            <g key={p}>
              {series.map((sr) => {
                const s = sr.s[pi] || 0;
                if (!s) return null;
                const y0 = y(acc);
                acc += s;
                return (
                  <rect
                    key={sr.name}
                    x={x}
                    width={bw}
                    y={y(acc)}
                    height={Math.max(0, y0 - y(acc))}
                    fill={sr.color[0]}
                    fillOpacity={sr.color[1]}
                    className="mr-bar"
                    onMouseMove={(ev) => show(ev, sr.name + " · " + tipHead(p), [[sr.color, tipName, fmtPct(s)]])}
                  />
                );
              })}
              {(n - 1 - pi) % every === 0 ? (
                <text x={Math.min(x + bw / 2, W - 2 - textWidth(tick(p)) / 2)} y={H - 4} textAnchor="middle">
                  {tick(p)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <RankingTip tip={tip} />
    </div>
  );
};

// Section 1: weekly rank by share of spend, per use case.
export const UseCaseRankings = ({ data }) => {
  const [u, setU] = useState(data.cases[0].name);
  const [all, setAll] = useState(false);
  const [ref, W] = useRankingWidth();
  const [tip, show, hide] = useRankingTip();
  const weeks = data.weeks;
  const last = weeks.length - 1;
  const uc = data.cases.find((c) => c.name === u) || data.cases[0];
  // The data holds weekly ranks only (1 = most spend), never the spend or its shares.
  const rank = new Map();
  uc.models.forEach((m) => m.r.forEach((r, wi) => r && rank.set(wi + "|" + m.m, r)));
  const ranked = uc.models
    .filter((m) => m.r[last])
    .map((m) => ({ name: m.m }))
    .sort((a, b) => rank.get(last + "|" + a.name) - rank.get(last + "|" + b.name));
  const color = new Map(ranked.map((r, i) => [r.name, rankingColor(i)]));
  const top = ranked.slice(0, 30);
  const N = top.length;
  let maxSeen = N;
  top.forEach((m) => weeks.forEach((w, wi) => (maxSeen = Math.max(maxSeen, rank.get(wi + "|" + m.name) || 0))));
  const maxRank = Math.max(1, Math.min(N + 2, maxSeen));
  const rowH = maxRank > 15 ? 22 : 30;
  const H = maxRank * rowH + 30;
  const ml = 36;
  const mr = Math.min(W * (W < 560 ? 0.36 : 0.42), Math.max(...top.map((m) => textWidth(m.name)), 40) + 40);
  const x = (i) => ml + 8 + (weeks.length > 1 ? (i * (W - mr - ml - 8)) / (weeks.length - 1) : 0);
  const y = (r) => 12 + ((r - 1) * (H - 42)) / Math.max(1, maxRank - 1);
  const [hover, setHover] = useState(null);
  const weekEvery = Math.max(1, Math.ceil(52 / Math.max(1, (W - mr - ml - 8) / Math.max(1, last))));
  const rankRows = ranked.map((r) => {
    const now = rank.get(last + "|" + r.name);
    const before = rank.get(last - 1 + "|" + r.name);
    return { name: r.name, now, before, change: before ? before - now : null };
  });
  const shown = all ? rankRows : rankRows.slice(0, 10);
  const lastWeek = fmtDay(weeks[last]);

  return (
    <section className="mr-sec" id="top-models-by-use-case">
      <h2>Top models by use case</h2>
      <p className="mr-lead">Models ranked by share of spend within each use case, week by week.</p>
      <div className="mr-ctrls">
        <RankingSeg
          label="Use case"
          options={data.cases.map((c) => [c.name, c.name])}
          value={u}
          onChange={(v) => {
            setU(v);
            setAll(false);
          }}
        />
      </div>
      <div className="mr-card">
        <h3>
          Weekly rank<span className="mr-sub">: {u}, by share of spend, top {Math.min(30, N)} models this week</span>
        </h3>
        <div className="mr-chart" ref={ref} onMouseLeave={hide}>
          {N ? (
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={"Weekly rank by share of spend for " + u}>
              {Array.from({ length: maxRank }, (_, i) => i + 1).map((r) => (
                <g key={r}>
                  <line x1={ml} x2={W - mr} y1={y(r)} y2={y(r)} className="mr-grid" />
                  <text x={ml - 6} y={y(r)} dy="0.35em" textAnchor="end">
                    {"#" + r}
                  </text>
                </g>
              ))}
              {weeks.map((w, i) =>
                (last - i) % weekEvery !== 0 ? null : (
                <text key={w} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}>
                  {fmtDay(w)}
                </text>
                )
              )}
              {top
                .slice()
                .reverse()
                .map((m) => {
                  const k = color.get(m.name);
                  const pts = weeks.map((w, wi) => ({ wi, r: rank.get(wi + "|" + m.name) }));
                  let d = "";
                  let pen = false;
                  pts.forEach((p) => {
                    if (p.r && p.r <= maxRank) {
                      d += (pen ? "L" : "M") + x(p.wi) + "," + y(p.r);
                      pen = true;
                    } else pen = false;
                  });
                  const end = pts[last];
                  const dim = hover && hover !== m.name;
                  return (
                    <g key={m.name} style={{ opacity: dim ? 0.15 : 1 }} onMouseEnter={() => setHover(m.name)} onMouseLeave={() => setHover(null)}>
                      <path d={d} fill="none" stroke={k[0]} strokeOpacity={Math.max(0.35, k[1])} strokeWidth={maxRank > 15 ? 2.5 : 3} strokeLinecap="round" strokeLinejoin="round" />
                      {pts
                        .filter((p) => p.r && p.r <= maxRank)
                        .map((p) => (
                          <circle
                            key={p.wi}
                            cx={x(p.wi)}
                            cy={y(p.r)}
                            r={maxRank > 15 ? 4 : 5}
                            fill={k[0]}
                            fillOpacity={Math.max(0.35, k[1])}
                            className="mr-dot"
                            onMouseMove={(ev) => show(ev, m.name + " · week of " + fmtDay(weeks[p.wi]), [[k, "Rank", "#" + p.r]])}
                          />
                        ))}
                      {end.r && end.r <= maxRank ? (
                        <text className="mr-lab" x={x(last) + 10} y={y(end.r)} dy="0.35em">
                          {clipText(m.name, mr - 14)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
            </svg>
          ) : null}
          <RankingTip tip={tip} />
        </div>
      </div>
      <div className="mr-card">
        <h3>
          Top models<span className="mr-sub">: {u}, week of {lastWeek}</span>
        </h3>
        <ShareTable
          rows={shown}
          colorOf={(r) => color.get(r.name)}
          cols={[
            ["Model", (r) => r.name],
            ["Rank, week of " + lastWeek, (r) => "#" + r.now],
            ["Week before", (r) => (r.before ? "#" + r.before : "–")],
            ["Change", (r) => (r.change == null ? "New" : r.change === 0 ? "0" : (r.change > 0 ? "+" : "−") + Math.abs(r.change)), (r) => (r.change ? (r.change > 0 ? "mr-up" : "mr-down") : "")],
          ]}
        />
        <RankingMore total={rankRows.length} open={all} onToggle={() => setAll(!all)} noun="models" />
      </div>
      <p className="mr-note">
        Spend is the Comfy credits charged for each call to an API model. Use case comes from each call's request (its endpoint, video mode, or whether an input image was sent) for 92% of spend, and from the model name for the rest. Text to video is mostly inferred from the model name, so some of it may be image to video. Models with fewer than 200 calls over 8 weeks are grouped as Other models, which is left out of the ranking. Weeks are Monday-start UTC weeks from Aug 24 to Oct 18, 2026.
      </p>
    </section>
  );
};

// Section 2: share of each month's Desktop installs by hardware.
export const HardwareRankings = ({ data, through }) => {
  const [g, setG] = useState(data.groups[0].name);
  const [all, setAll] = useState(false);
  const OTHER = "Other GPUs";
  const KEEP = {
    VRAM: ["<6GB", "6-8GB", "8-12GB", "12-16GB", "16-24GB", "24-48GB", "48+GB", "Apple (shared memory)", "Unknown"],
    "System RAM": ["<=8GB", "8-16GB", "16-32GB", "32-64GB", "64-128GB", "128+GB"],
  };
  const months = data.months;
  const last = months.length - 1;
  const grp = data.groups.find((x) => x.name === g) || data.groups[0];
  const ranked = grp.items
    .filter((i) => i.i !== OTHER)
    .map((i) => ({ name: i.i, s: i.s, last: i.s[last], prev: i.s[last - 1], change: 100 * (i.s[last] - i.s[last - 1]) }))
    .sort((a, b) => b.last - a.last);
  const color = new Map(ranked.map((r, i) => [r.name, rankingColor(i)]));
  const order = KEEP[g] ? KEEP[g].filter((n) => ranked.some((r) => r.name === n)) : ranked.map((r) => r.name);
  const series = order.map((n) => {
    const r = ranked.find((x) => x.name === n);
    return { name: n, color: color.get(n), s: r.s };
  });
  const monthLabel = (iso) => fmtMonth(iso) + (isPartial(iso, through) ? " (to " + fmtDay(through) + ")" : "");
  const colLabel = (iso) => (isPartial(iso, through) ? RANKING_MONTHS[+iso.slice(5, 7) - 1] + " 1–" + +through.slice(8, 10) : fmtMonthName(iso));
  const shown = all ? ranked : ranked.slice(0, 10);

  return (
    <section className="mr-sec" id="hardware-setups">
      <h2>Hardware setup breakdown</h2>
      <p className="mr-lead">What hardware ComfyUI Desktop users run, month by month. Each bar shows the share of that month's active Desktop installs, so all figures are percentages.</p>
      <div className="mr-ctrls">
        <RankingSeg
          label="Breakdown"
          options={data.groups.map((x) => [x.name, x.name])}
          value={g}
          onChange={(v) => {
            setG(v);
            setAll(false);
          }}
        />
      </div>
      <div className="mr-card">
        <h3>
          Monthly share<span className="mr-sub">: {g}, share of each month's installs</span>
        </h3>
        {g === "GPU model" ? <p className="mr-note">GPU models beyond the top 30 removed.</p> : null}
        <StackedShareBars
          periods={months}
          series={series}
          label={"Monthly share of installs for " + g}
          axisLabel={monthLabel}
          shortLabel={(iso) => fmtMonth(iso, true)}
          tipHead={monthLabel}
          tipName={"Share of " + g + " installs"}
        />
      </div>
      <div className="mr-card">
        <h3>
          Values<span className="mr-sub">: {g}, share of installs, {colLabel(months[last])} vs {colLabel(months[last - 1])}</span>
        </h3>
        <ShareTable
          rows={shown}
          colorOf={(r) => color.get(r.name)}
          cols={[
            ["Setup", (r) => r.name],
            [colLabel(months[last]), (r) => fmtPct(r.last)],
            [colLabel(months[last - 1]), (r) => fmtPct(r.prev)],
            ["Change (pts)", (r) => fmtPts(r.change), changeClass],
          ]}
        />
        <RankingMore total={ranked.length} open={all} onToggle={() => setAll(!all)} />
      </div>
      <p className="mr-note">
        Source: ComfyUI Desktop app telemetry, one count per install per calendar month (UTC), using its latest report that month. October runs to Oct 18. June is left out: the early app often reported a virtual display adapter instead of the real GPU, and no VRAM. July counts are inflated by install IDs that changed during the month, so compare shares, not totals. Portable, manual-install and Cloud users don't send this, so Linux and multi-GPU setups are likely undercounted. Intel and AMD integrated graphics land in under 6GB. Macs share memory between CPU and GPU, so they have their own VRAM bucket. VRAM buckets include their upper bound (an 8GB card is in 6-8GB). GPU names are cleaned up, laptop chips are kept separate, and GPUs outside the top 30 are left out.
      </p>
    </section>
  );
};

// Section 3: median to 90th percentile time per Cloud model, log scale.
export const SpeedRankings = ({ data }) => {
  const TYPES = ["Image", "Video", "Image tools", "Audio", "3D"];
  const ML = { gen: "generation time", wait: "latency" };
  const [k, setK] = useState("Original");
  const [m, setM] = useState("gen");
  const [t, setT] = useState("Image");
  const [allA, setAllA] = useState(false);
  const [allV, setAllV] = useState(false);
  const [ref, W] = useRankingWidth();
  const [tip, show, hide] = useRankingTip();
  const rowsAll = data.map((d) => ({ type: d[0], kind: d[1], model: d[2], p50_wait: d[3], p90_wait: d[4], p50_gen: d[5], p90_gen: d[6], share: d[7] }));
  const kr = rowsAll.filter((r) => r.kind === k);
  const have = TYPES.filter((x) => kr.some((r) => r.type === x));
  const type = have.includes(t) ? t : have[0];
  const lo50 = "p50_" + m;
  const hi90 = "p90_" + m;
  const rows = kr.filter((r) => r.type === type && r[lo50] != null).sort((a, b) => b.share - a.share);
  const showRows = allA ? rows : rows.slice(0, 10);
  const rowH = 26;
  const lw = Math.min(W * 0.38, Math.max(...showRows.map((r) => textWidth(r.model)), 40) + 14);
  const mr = textWidth("00m 00s – 00m 00s") + 12;
  const H = showRows.length * rowH + 22;
  const valid = rows.filter((r) => r[lo50] != null && r[hi90] != null);
  const lo = valid.length ? Math.max(0.5, Math.min(...valid.map((r) => r[lo50])) * 0.8) : 1;
  const hi = valid.length ? Math.max(lo * 2, Math.max(...valid.map((r) => r[hi90])) * 1.15) : 60;
  const x = (v) => lw + ((Math.log(Math.min(hi, Math.max(lo, v))) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (W - mr - lw);
  const ticks = [1, 2, 5, 10, 20, 30, 60, 120, 300, 600, 1200].filter((v) => v >= lo && v <= hi);
  const reset = () => {
    setAllA(false);
    setAllV(false);
  };
  const other = m === "gen" ? "wait" : "gen";

  return (
    <section className="mr-sec" id="fastest-models">
      <h2>Fastest models based on Comfy usage</h2>
      <p className="mr-lead">How fast open models run on Comfy Cloud, from real jobs between Aug 24 and Oct 18, 2026. Times are medians (the typical job) and 90th percentiles (a slow job).</p>
      <div className="mr-ctrls">
        <RankingSeg label="Models" options={[["Original", "Original models"], ["Community", "Community fine-tunes"]]} value={k} onChange={(v) => (setK(v), reset())} />
        <RankingSeg label="Measure" options={[["gen", "Generation time"], ["wait", "Latency"]]} value={m} onChange={(v) => (setM(v), reset())} />
        <RankingSeg label="Output type" options={have.map((x) => [x, x])} value={type} onChange={(v) => (setT(v), reset())} />
      </div>
      <div className="mr-card">
        <h3>
          Speed range<span className="mr-sub">: median to 90th-percentile {ML[m]}, most popular (share of credits) first</span>
        </h3>
        <div className="mr-legend">
          <span>
            <i className="mr-sw mr-round" style={{ background: RANKING_COLORS[0] }} />
            Median (typical run)
          </span>
          <span>
            <i className="mr-sw mr-round" style={{ background: "var(--mr-muted)" }} />
            90th percentile (slow run)
          </span>
        </div>
        <div className="mr-chart" ref={ref} onMouseLeave={hide}>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={"Median and 90th percentile " + ML[m] + " per model on Comfy Cloud, " + type}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={x(v)} x2={x(v)} y1={0} y2={H - 22} className="mr-grid" />
                <text x={x(v)} y={H - 8} textAnchor="middle">
                  {fmtTime(v)}
                </text>
              </g>
            ))}
            {showRows.map((r, i) => {
              const lines = [
                [[RANKING_COLORS[0], 1], "Median " + ML[m], fmtTime(r[lo50])],
                [["var(--mr-muted)", 1], "90th percentile", fmtTime(r[hi90])],
                [null, "Median " + ML[other], fmtTime(r["p50_" + other])],
                [null, "Share of Cloud credits", fmtPct(r.share)],
              ];
              const cy = i * rowH + rowH / 2;
              const ok = r[lo50] != null && r[hi90] != null;
              return (
                <g key={r.model}>
                  <rect className="mr-hit" x={0} width={W} y={i * rowH + 1} height={rowH - 2} rx={4} onMouseMove={(ev) => show(ev, r.model, lines)} />
                  <text className="mr-lab" x={lw - 10} y={cy} dy="0.35em" textAnchor="end" pointerEvents="none">
                    {clipText(r.model, lw - 12)}
                  </text>
                  {ok ? (
                    <g pointerEvents="none">
                      <line x1={x(r[lo50])} x2={x(r[hi90])} y1={cy} y2={cy} stroke="var(--mr-muted)" strokeWidth={4} strokeLinecap="round" />
                      <circle cx={x(r[hi90])} cy={cy} r={4.5} fill="var(--mr-muted)" />
                      <circle cx={x(r[lo50])} cy={cy} r={5.5} fill={RANKING_COLORS[0]} className="mr-dot" />
                      <text className="mr-lab" x={x(r[hi90]) + 9} y={cy} dy="0.35em">
                        {fmtTime(r[lo50]) + " – " + fmtTime(r[hi90])}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </svg>
          <RankingTip tip={tip} />
        </div>
        <RankingMore total={rows.length} open={allA} onToggle={() => setAllA(!allA)} />
      </div>
      <div className="mr-card">
        <h3>Fastest models</h3>
        <ShareTable
          rows={allV ? rows : rows.slice(0, 10)}
          cols={[
            ["Model", (r) => r.model],
            ["Share of Cloud credits", (r) => fmtPct(r.share)],
            ["Median latency", (r) => fmtTime(r.p50_wait)],
            ["90th pct latency", (r) => fmtTime(r.p90_wait)],
            ["Median generation", (r) => fmtTime(r.p50_gen)],
            ["90th pct generation", (r) => fmtTime(r.p90_gen)],
          ]}
        />
        <RankingMore total={rows.length} open={allV} onToggle={() => setAllV(!allV)} />
      </div>
      <p className="mr-note">
        Source: Comfy Cloud job records, successful jobs only. Latency is the wait from when a job is submitted to when it starts running. Generation time is from start to finish of the run, including loading the model onto the GPU and every other step in the workflow, so it varies with steps, resolution and video length as well as the model. Each job is matched to its main diffusion model, which works for about 69% of jobs. Every model with at least 100 jobs since Aug 24 is shown. Original models are the official releases from the model makers (including Comfy's repackaged and quantized copies). Community fine-tunes are checkpoints and merges trained on top of them. When the same file is stored under several names, the most used copy is shown. Checkpoints with explicit names are left out. Every job ran on the same GPU (RTX Pro 6000). API (partner) models are left out because their timing mixes latency and generation time. Models are ranked by popularity, as share of Cloud credits: Cloud charges credits per second of GPU time and every job ran on the same GPU, so each model's share of metered GPU time is its share of credits. GPU time is metered for about 92% of the jobs shown.
      </p>
    </section>
  );
};

// Section 4: share of Comfy-Org Hugging Face downloads within each output type.
export const DownloadRankings = ({ data, through }) => {
  const TOPN = 15;
  const OTHER = "Other models";
  const [t, setT] = useState("Image");
  const [g, setG] = useState("Weekly");
  const [all, setAll] = useState(false);
  const grain = data[g];
  const types = grain.types.map((x) => x.name);
  const type = types.includes(t) ? t : types[0];
  const tp = grain.types.find((x) => x.name === type);
  const ps = grain.periods;
  const last = ps.length - 1;
  const ranked = tp.models
    .map((mm) => ({ name: mm.m, s: mm.s, last: mm.s[last], prev: mm.s[last - 1], change: 100 * (mm.s[last] - mm.s[last - 1]) }))
    .filter((r) => r.last > 0)
    .sort((a, b) => b.last - a.last);
  const color = new Map(ranked.map((r, i) => [r.name, rankingColor(i)]));
  const topNames = ranked.slice(0, TOPN).map((r) => r.name);
  const otherS = ps.map((_, pi) => tp.models.filter((mm) => !topNames.includes(mm.m)).reduce((a, mm) => a + (mm.s[pi] || 0), 0));
  const series = ranked
    .slice(0, TOPN)
    .map((r) => ({ name: r.name, color: color.get(r.name), s: r.s }))
    .concat([{ name: OTHER, color: ["var(--mr-muted)", 1], s: otherS }]);
  const unit = g === "Weekly" ? "week" : "month";
  const pLabel = (p) => (g === "Weekly" ? fmtDay(p) + ", " + p.slice(0, 4) : fmtMonth(p) + (isPartial(p, through) ? " (to " + fmtDay(through) + ")" : ""));
  const axLabel = (p) => (g === "Weekly" ? fmtDay(p) : fmtMonth(p, true));
  const shown = all ? ranked : ranked.slice(0, 10);

  return (
    <section className="mr-sec" id="top-open-source-downloads">
      <h2>Top open source model downloads</h2>
      <p className="mr-lead">Share of downloads of Comfy-Org's open model repos on Hugging Face, by week or month.</p>
      <div className="mr-ctrls">
        <RankingSeg label="Output type" options={types.map((x) => [x, x])} value={type} onChange={(v) => (setT(v), setAll(false))} />
        <RankingSeg label="Period" options={[["Weekly", "Weekly"], ["Monthly", "Monthly"]]} value={g} onChange={(v) => (setG(v), setAll(false))} />
      </div>
      <div className="mr-card">
        <h3>
          Share of downloads<span className="mr-sub">: {type}, share of each {unit}, top {TOPN} in the latest {unit}</span>
        </h3>
        <StackedShareBars periods={ps} series={series} label={g + " share of downloads by model, Comfy-Org Hugging Face repos"} axisLabel={axLabel} tipHead={pLabel} tipName={"Share of " + type + " downloads"} />
      </div>
      <div className="mr-card">
        <h3>
          Values<span className="mr-sub">: {type}, {g === "Weekly" ? "week of " : ""}{pLabel(ps[last])} vs the {unit} before</span>
        </h3>
        <ShareTable
          rows={shown}
          colorOf={(r) => color.get(r.name)}
          cols={[
            ["Model", (r) => r.name],
            ["Share, latest " + unit, (r) => fmtPct(r.last)],
            ["Share, " + unit + " before", (r) => fmtPct(r.prev)],
            ["Change (pts)", (r) => fmtPts(r.change), changeClass],
          ]}
        />
        <RankingMore total={ranked.length} open={all} onToggle={() => setAll(!all)} />
      </div>
      <p className="mr-note">
        Source: Hugging Face publisher analytics for the Comfy-Org organization (88 model repos), daily downloads exported Oct 21, 2026. Weeks are Monday-start UTC weeks from Jul 7, 2025 to Oct 18, 2026. Months run from August 2025, and October 2026 only covers Oct 1 to 18. Each repo is one model family and can hold several files (precisions, text encoders, VAEs). A download is one file fetched, so a workflow that pulls three files counts three times. Models published by other organizations, or by their own labs, aren't in this data. Shares are within each output type, which is set by hand from the repo name. Text encoders and VAEs are support files other models load (the Flux Klein VAE and text encoder repos, Qwen3-VL, Gemma 4, SigCLIP).
      </p>
    </section>
  );
};

export const ModelRankings = ({ data }) => (
  <div className="mr">
    <style>{`
      .mr { --mr-fg: #18181b; --mr-muted-fg: #71717a; --mr-border: #e4e4e7; --mr-panel: #ffffff; --mr-grid: #f0f0f2; --mr-muted: #b4b4bb; --mr-ok: #15803d; --mr-bad: #b91c1c;
        display: flex; flex-direction: column; gap: 2.5rem; color: var(--mr-fg); }
      .dark .mr { --mr-fg: #f4f4f5; --mr-muted-fg: #a1a1aa; --mr-border: #3f3f46; --mr-panel: #18181b; --mr-grid: #27272a; --mr-muted: #63636b; --mr-ok: #4ade80; --mr-bad: #f87171; }
      .mr-toc { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 0.875rem; }
      .mr-toc a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
      .mr-sec { display: flex; flex-direction: column; gap: 1rem; scroll-margin-top: 7rem; }
      .mr-sec + .mr-sec { border-top: 1px solid var(--mr-border); padding-top: 2.5rem; }
      .mr-sec h2 { margin: 0; font-size: 1.5rem; font-weight: 600; }
      .mr-lead { margin: 0; color: var(--mr-muted-fg); max-width: 72ch; }
      .mr-ctrls { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; }
      .mr-ctrl { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; font-size: 0.8125rem; color: var(--mr-muted-fg); }
      .mr-seg { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 2px; border: 1px solid var(--mr-border); border-radius: 14px; }
      .mr-seg button { font: inherit; font-size: 0.8125rem; border: 0; background: transparent; color: var(--mr-muted-fg); padding: 3px 10px; border-radius: 12px; cursor: pointer; }
      .mr-seg button:hover { color: var(--mr-fg); }
      .mr-seg button[aria-pressed="true"] { background: var(--mr-fg); color: var(--mr-panel); }
      .mr-seg button:focus-visible, .mr-more:focus-visible { outline: 2px solid var(--mr-fg); outline-offset: 1px; }
      .mr-card { display: flex; flex-direction: column; gap: 0.75rem; min-width: 0; padding: 1rem 1.25rem; border: 1px solid var(--mr-border); border-radius: 12px; background: var(--mr-panel); }
      .mr-card h3 { margin: 0; font-size: 1rem; font-weight: 600; }
      .mr-sub { font-weight: 400; color: var(--mr-muted-fg); }
      .mr-chart { position: relative; min-height: 120px; }
      .mr-chart svg { display: block; overflow: visible; }
      .mr svg text { font-size: 12px; fill: var(--mr-muted-fg); font-variant-numeric: tabular-nums; }
      .mr svg text.mr-lab { fill: var(--mr-fg); }
      .mr-grid { stroke: var(--mr-grid); }
      .mr-bar { stroke: var(--mr-panel); stroke-width: 0.5; }
      .mr-dot { stroke: var(--mr-panel); stroke-width: 1.5; }
      .mr-hit { fill: transparent; }
      .mr-hit:hover { fill: var(--mr-grid); }
      .mr-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 0.8125rem; color: var(--mr-muted-fg); }
      .mr-legend span { display: inline-flex; align-items: center; gap: 6px; }
      .mr-sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; flex: none; margin-right: 6px; vertical-align: -1px; }
      .mr-legend .mr-sw { margin-right: 0; }
      .mr-round { border-radius: 50%; }
      .mr-tip { position: absolute; z-index: 5; pointer-events: none; min-width: 150px; max-width: 260px; padding: 6px 10px; font-size: 0.8125rem; font-variant-numeric: tabular-nums;
        background: var(--mr-panel); border: 1px solid var(--mr-border); border-radius: 8px; box-shadow: 0 4px 16px #0002; }
      .mr-tip-h { color: var(--mr-muted-fg); margin-bottom: 2px; }
      .mr-tip-r { display: flex; align-items: center; gap: 6px; }
      .mr-tip-r .mr-sw { margin-right: 0; }
      .mr-tip-r b { margin-left: auto; padding-left: 12px; font-weight: 600; }
      .mr-tbox { overflow: auto; max-height: 420px; border: 1px solid var(--mr-border); border-radius: 8px; }
      .mr-table { width: 100%; margin: 0; border-collapse: collapse; font-size: 0.8125rem; font-variant-numeric: tabular-nums; display: table; }
      .mr-table th { position: sticky; top: 0; z-index: 1; background: var(--mr-panel); text-align: left; font-weight: 500; color: var(--mr-muted-fg); padding: 6px 8px; border-bottom: 1px solid var(--mr-border); white-space: nowrap; }
      .mr-table td { padding: 5px 8px; border-bottom: 1px solid var(--mr-border); white-space: nowrap; }
      .mr-table tr:last-child td { border-bottom: 0; }
      .mr-table .num { text-align: right; }
      .mr-table tbody tr:hover td { background: var(--mr-grid); }
      .mr-up { color: var(--mr-ok); }
      .mr-down { color: var(--mr-bad); }
      .mr-more { align-self: flex-start; font: inherit; font-size: 0.8125rem; padding: 4px 12px; border: 1px solid var(--mr-border); border-radius: 14px; background: transparent; color: var(--mr-fg); cursor: pointer; }
      .mr-more:hover { background: var(--mr-grid); }
      .mr-note { margin: 0; font-size: 0.8125rem; color: var(--mr-muted-fg); max-width: 85ch; }
    `}</style>
    <nav className="mr-toc" aria-label="Rankings sections">
      <a href="#top-models-by-use-case">Top models by use case</a>
      <a href="#hardware-setups">Hardware setups</a>
      <a href="#fastest-models">Fastest models</a>
      <a href="#top-open-source-downloads">Top open source downloads</a>
    </nav>
    <UseCaseRankings data={data.usecase} />
    <HardwareRankings data={data.hardware} through={data.through} />
    <SpeedRankings data={data.speed} />
    <DownloadRankings data={data.downloads} through={data.through} />
  </div>
);

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

export const fmtDate = (iso) => fmtDay(iso) + ", " + iso.slice(0, 4);

export const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

export const fmtMonthName = (iso) => ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][+iso.slice(5, 7) - 1];

// A period that runs past the snapshot's last day is partial: label it with its cutoff.
export const isPartial = (iso, through) =>
  !!through && iso.slice(0, 7) === through.slice(0, 7) && +through.slice(8, 10) < new Date(Date.UTC(+through.slice(0, 4), +through.slice(5, 7), 0)).getUTCDate();

export const fmtQuarter = (iso) => "Q" + (Math.floor((+iso.slice(5, 7) - 1) / 3) + 1) + " " + iso.slice(0, 4);

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

// Model pages on comfy.org. A row's `h` is its page path under the hub, or a
// comfy.org path starting with / for launch pages outside the hub.
export const HUB_URL = "https://comfy.org/hub/models/";

export const modelUrl = (h) => (h.startsWith("/") ? "https://comfy.org" + h : HUB_URL + h + "/");

export const ModelName = ({ name, h }) =>
  h ? (
    <a className="mr-link" href={modelUrl(h)} target="_blank" rel="noopener noreferrer">
      {name}
    </a>
  ) : (
    name
  );

// Source and method notes, collapsed by default.
export const Methodology = ({ children }) => (
  <details className="mr-method">
    <summary>Learn more about our methodology</summary>
    <p className="mr-note">{children}</p>
  </details>
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
                    <ModelName name={v} h={r.h} />
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

// Section 1: share of each output type's generations by week or month, top 50 models plus Other.
export const TopModels = ({ data }) => {
  const TOPN = 50;
  const OTHER = "Other models";
  const [t, setT] = useState(data.types[0].name);
  const [g, setG] = useState("week");
  const [all, setAll] = useState(false);
  const ps = g === "week" ? data.weeks : data.months;
  const last = ps.length - 1;
  const unit = g === "week" ? "week" : "month";
  const pName = (p) => (g === "week" ? "week of " + fmtDate(p) : fmtMonthName(p) + " " + p.slice(0, 4));
  const tp = data.types.find((x) => x.name === t) || data.types[0];
  const named = tp.models.filter((mm) => mm.m !== OTHER);
  // The chart breaks out the 50 models with the most share over the whole range.
  const byRange = named.map((mm) => ({ mm, sum: mm[g].reduce((a, v) => a + v, 0) })).sort((a, b) => b.sum - a.sum);
  const color = new Map(byRange.map((r, i) => [r.mm.m, i < TOPN ? rankingColor(i) : ["var(--mr-muted)", 1]]));
  const top = byRange.slice(0, TOPN).map((r) => r.mm);
  const topNames = new Set(top.map((mm) => mm.m));
  const otherS = ps.map((_, pi) => tp.models.filter((mm) => !topNames.has(mm.m)).reduce((a, mm) => a + (mm[g][pi] || 0), 0));
  const series = top.map((mm) => ({ name: mm.m, color: color.get(mm.m), s: mm[g] })).concat([{ name: OTHER, color: ["var(--mr-muted)", 1], s: otherS }]);
  const ranked = named
    .map((mm) => ({ name: mm.m, h: mm.h, provider: mm.p, last: mm[g][last], change: 100 * (mm[g][last] - mm[g][last - 1]) }))
    .filter((r) => r.last > 0)
    .sort((a, b) => b.last - a.last);
  const shown = all ? ranked : ranked.slice(0, 10);
  const colName = g === "week" ? "week of " + fmtDay(ps[last]) : fmtMonth(ps[last]);

  return (
    <section className="mr-sec" id="top-models">
      <h2>Top Models</h2>
      <p className="mr-lead">Share of generations by model over the last year, within each output type.</p>
      <div className="mr-ctrls">
        <RankingSeg label="Output type" options={data.types.map((x) => [x.name, x.name])} value={tp.name} onChange={(v) => (setT(v), setAll(false))} />
        <RankingSeg label="Period" options={[["week", "By week"], ["month", "By month"]]} value={g} onChange={(v) => (setG(v), setAll(false))} />
      </div>
      <div className="mr-card">
        <h3>
          {g === "week" ? "Weekly" : "Monthly"} Share of Generations<span className="mr-sub">: {tp.name}, top {Math.min(TOPN, top.length)} models</span>
        </h3>
        <StackedShareBars
          periods={ps}
          series={series}
          label={(g === "week" ? "Weekly" : "Monthly") + " share of " + tp.name + " generations by model"}
          axisLabel={g === "week" ? fmtDay : (p) => fmtMonth(p, true)}
          tipHead={pName}
          tipName={"Share of " + tp.name + " generations"}
        />
      </div>
      <div className="mr-card">
        <h3>
          Top Models<span className="mr-sub">: {tp.name}, {pName(ps[last])}</span>
        </h3>
        <ShareTable
          rows={shown}
          colorOf={(r) => color.get(r.name)}
          cols={[
            ["Model", (r) => r.name],
            ["Provider", (r) => r.provider || ""],
            ["Share, " + colName, (r) => fmtPct(r.last)],
            ["Change vs " + unit + " before (pts)", (r) => fmtPts(r.change), changeClass],
          ]}
        />
        <RankingMore total={ranked.length} open={all} onToggle={() => setAll(!all)} noun="models" />
      </div>
      <Methodology>
        Source: Comfy API usage (Comfy Router and partner API nodes, on Cloud and local installs), Monday-start UTC weeks from {fmtDate(data.weeks[0])} to {fmtDate(addDays(data.weeks[data.weeks.length - 1], 6))}. A month is the set of weeks whose Thursday falls in it, so every week counts toward exactly one month, and only months with all their weeks in the data are shown. A generation is one call, or the number of outputs when a call asks for several images (under 1% of calls). Shares are within each output type. The chart breaks out the top {TOPN} models over the year (by summed share); the rest are grouped as Other models. The table ranks every model by its share in the latest {unit}. Output type comes from the model, and for new models from the call's request. Calls with no model name (about 3%, mostly Kling, Recraft, Freepik and Vidu) aren't included, and models renamed from a preview name are merged with their final name. Models with fewer than 200 calls over the year are grouped as Other models. Language models and sound effects are left out.
      </Methodology>
    </section>
  );
};

// Section 2: change in generations from the period before, from shares and the type's own change.
export const TopMovers = ({ data }) => {
  const FLOOR = 0.005;
  const GRAINS = { week: ["Week", "week"], month: ["Month", "month"], quarter: ["Quarter", "quarter"] };
  const [t, setT] = useState(data.types[0].name);
  const [g, setG] = useState("week");
  const [dir, setDir] = useState("up");
  const [ref, W] = useRankingWidth();
  const [tip, show, hide] = useRankingTip();
  const ps = { week: data.weeks, month: data.months, quarter: data.quarters }[g];
  const last = ps.length - 1;
  const unit = GRAINS[g][1];
  const tp = data.types.find((x) => x.name === t) || data.types[0];
  const tg = tp.g[g];
  // A model's growth = its share change times the type's own change.
  const rows = tp.models
    .filter((mm) => mm.m !== "Other models")
    .map((mm) => {
      const prev = mm[g][last - 1] || 0;
      const now = mm[g][last] || 0;
      return { name: mm.m, h: mm.h, prev, now, growth: prev >= FLOOR && tg != null ? (now / prev) * (1 + tg) - 1 : null, isNew: prev < FLOOR && now >= FLOOR };
    });
  const ranked = rows.filter((r) => r.growth != null);
  const list = ranked.sort((a, b) => (dir === "up" ? b.growth - a.growth : a.growth - b.growth)).slice(0, 10);
  const fresh = rows.filter((r) => r.isNew).sort((a, b) => b.now - a.now);
  const fmtG = (v) => (v > 0.005 ? "+" : v < -0.005 ? "\u2212" : "") + Math.round(Math.abs(v) * 100) + "%";
  const pName = (p) => (g === "week" ? "week of " + fmtDate(p) : g === "month" ? fmtMonth(p) : fmtQuarter(p));
  const rowH = 32;
  const H = list.length * rowH + 4;
  const numW = textWidth("10.") + 8;
  const labW = Math.min(W * 0.42, Math.max(40, ...list.map((r) => textWidth(r.name))) + 12);
  const valW = Math.max(30, ...list.map((r) => textWidth(fmtG(r.growth)))) + 8;
  const lo = Math.min(0, ...list.map((r) => r.growth));
  const hi = Math.max(0, ...list.map((r) => r.growth));
  const x0 = numW + labW + (lo < 0 ? valW : 0);
  const x1 = W - (hi > 0 ? valW : 0);
  const x = (v) => (hi === lo ? x0 : x0 + ((v - lo) / (hi - lo)) * (x1 - x0));

  return (
    <section className="mr-sec" id="top-movers">
      <h2>Top Movers</h2>
      <div className="mr-ctrls">
        <RankingSeg label="Output type" options={data.types.map((x) => [x.name, x.name])} value={tp.name} onChange={setT} />
        <RankingSeg label="Sort by" options={Object.entries(GRAINS).map(([k, v]) => [k, v[0]])} value={g} onChange={setG} />
        <RankingSeg label="Direction" options={[["up", "Biggest gains"], ["down", "Biggest drops"]]} value={dir} onChange={setDir} />
      </div>
      <div className="mr-card">
        <h3>
          {dir === "up" ? "Top 10 Growing Models" : "Top 10 Shrinking Models"}
          <span className="mr-sub">: percent change in generations from the {unit} before</span>
        </h3>
        <div className="mr-chart" ref={ref} onMouseLeave={hide}>
          {list.length ? (
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={"Change in generations from the " + unit + " before, " + tp.name}>
              <line x1={x(0)} x2={x(0)} y1={0} y2={H} stroke="var(--mr-muted)" />
              {list.map((r, i) => {
                const cy = i * rowH + 2 + rowH / 2;
                const up = r.growth >= 0;
                const label = (
                  <text className={"mr-lab" + (r.h ? " mr-svglink" : "")} x={numW} y={cy} dy="0.35em">
                    {clipText(r.name, labW - 12)}
                  </text>
                );
                return (
                  <g key={r.name} onMouseMove={(ev) => show(ev, r.name, [[null, "Generations, " + pName(ps[last]) + " vs " + unit + " before", fmtG(r.growth)], [null, "Share of " + tp.name, fmtPct(r.prev) + " \u2192 " + fmtPct(r.now)]])}>
                    <rect className="mr-hit" x={0} width={W} y={i * rowH + 2} height={rowH} rx={4} />
                    <text x={numW - 8} y={cy} dy="0.35em" textAnchor="end">
                      {i + 1 + "."}
                    </text>
                    {r.h ? (
                      <a href={modelUrl(r.h)} target="_blank" rel="noopener noreferrer">
                        {label}
                      </a>
                    ) : (
                      label
                    )}
                    <rect x={Math.min(x(0), x(r.growth))} width={Math.max(2, Math.abs(x(r.growth) - x(0)))} y={cy - (rowH - 12) / 2} height={rowH - 12} rx={4} fill={up ? RANKING_COLORS[0] : "var(--mr-muted)"} pointerEvents="none" />
                    <text x={up ? x(r.growth) + 6 : x(r.growth) - 6} y={cy} dy="0.35em" textAnchor={up ? "start" : "end"} pointerEvents="none">
                      {fmtG(r.growth)}
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : (
            <p className="mr-note">No models above the 0.5% floor in this period.</p>
          )}
          <RankingTip tip={tip} />
        </div>
        <p className="mr-note">
          {tp.name} overall: <b>{tg == null ? "–" : fmtG(tg)}</b> generations per week from the {unit} before.
        </p>
        {fresh.length ? (
          <p className="mr-note">
            New arrivals, from under 0.5% to:{" "}
            {fresh.map((r, i) => (
              <span key={r.name}>
                {i ? ", " : ""}
                <b>
                  <ModelName name={r.name} h={r.h} />
                </b>{" "}
                ({fmtPct(r.now)} of {tp.name})
              </span>
            ))}
          </p>
        ) : null}
      </div>
      <Methodology>
        Growth is the percent change in a model's generations per week from one period to the one before, from the same Comfy API usage as Top models. Week compares the latest full Monday-start UTC week with the week before. Month and Quarter compare the latest full month or quarter with the one before, where a week counts toward the month that holds its Thursday; comparing generations per week keeps 4- and 5-week months fair. Only percentages are shown, never generation counts. To keep tiny models from topping the list with huge jumps, a model is ranked only if it had at least 0.5% of its type's generations in the earlier period. Models that crossed 0.5% from below are listed as new arrivals under the chart. The type's overall change is shown for context, since a model can grow just because its whole type grew. Models renamed from a preview name are merged with their final name. Other models, language models and sound effects are left out.
      </Methodology>
    </section>
  );
};

// Section 3: share of each week's Desktop installs by hardware, for the current
// Desktop app (v2) or the legacy one (v1).
export const HardwareRankings = ({ data: byApp }) => {
  const [ver, setVer] = useState("v2");
  const data = byApp[ver];
  const [gSel, setG] = useState(data.groups[0].name);
  const g = data.groups.some((x) => x.name === gSel) ? gSel : data.groups[0].name;
  const [all, setAll] = useState(false);
  const OTHER = "Other GPUs";
  const KEEP = {
    VRAM: ["<6GB", "6-8GB", "8-12GB", "12-16GB", "16-24GB", "24-48GB", "48+GB", "Apple (shared memory)", "Unknown"],
    "System RAM": ["<=8GB", "8-16GB", "16-32GB", "32-64GB", "64-128GB", "128+GB"],
  };
  const weeks = data.weeks;
  const last = weeks.length - 1;
  const grp = data.groups.find((x) => x.name === g) || data.groups[0];
  const ranked = grp.items
    .filter((i) => i.i !== OTHER)
    .map((i) => ({ name: i.i, s: i.s, last: i.s[last], prev: i.s[last - 1], change: 100 * (i.s[last] - i.s[last - 1]) }))
    .sort((a, b) => b.last - a.last);
  const color = new Map(ranked.map((r, i) => [r.name, rankingColor(i)]));
  const order = KEEP[g] ? KEEP[g].filter((n) => ranked.some((r) => r.name === n)) : ranked.map((r) => r.name);
  const other = grp.items.find((i) => i.i === OTHER);
  // Other GPUs sits at the bottom of each bar, next to the axis.
  const series = (other ? [{ name: OTHER, color: ["var(--mr-muted)", 1], s: other.s }] : []).concat(
    order.map((n) => {
      const r = ranked.find((x) => x.name === n);
      return { name: n, color: color.get(n), s: r.s };
    })
  );
  const shown = all ? ranked : ranked.slice(0, 10);

  return (
    <section className="mr-sec" id="hardware-setups">
      <h2>Hardware Setup Breakdown</h2>
      <p className="mr-lead">What hardware ComfyUI Desktop users run, week by week. Each bar shows the share of that week's active Desktop installs, so all figures are percentages. Desktop v2 is the current app; Desktop v1 is the legacy app, whose data ends in May 2026.</p>
      <div className="mr-ctrls">
        <RankingSeg label="App" options={[["v2", "Desktop v2"], ["v1", "Desktop v1"]]} value={ver} onChange={(v) => (setVer(v), setAll(false))} />
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
          Weekly Share<span className="mr-sub">: Desktop {ver}, {g}, share of each week's installs{other ? ", top 30 plus Other GPUs" : ""}</span>
        </h3>
        <StackedShareBars
          periods={weeks}
          series={series}
          label={"Weekly share of Desktop " + ver + " installs for " + g}
          axisLabel={fmtDay}
          tipHead={(w) => "week of " + fmtDate(w)}
          tipName={"Share of " + g + " installs"}
        />
      </div>
      <div className="mr-card">
        <h3>
          Values<span className="mr-sub">: {g}, share of installs</span>
        </h3>
        <ShareTable
          rows={shown}
          colorOf={(r) => color.get(r.name)}
          cols={[
            ["Setup", (r) => r.name],
            ["Week of " + fmtDay(weeks[last]), (r) => fmtPct(r.last)],
            ["Week of " + fmtDay(weeks[last - 1]), (r) => fmtPct(r.prev)],
            ["Change (pts)", (r) => fmtPts(r.change), changeClass],
          ]}
        />
        <RankingMore total={ranked.length} open={all} onToggle={() => setAll(!all)} />
      </div>
      <Methodology>
        {ver === "v2" ? (
          <>
            Source: ComfyUI Desktop v2 app telemetry, one count per install per Monday-start UTC week, using its latest report that week, from {fmtDate(weeks[0])} to {fmtDate(addDays(weeks[last], 6))}. Desktop v2 only started sending hardware reports in June 2026, so there isn't a full year yet. June is left out: the early app often reported a virtual display adapter instead of the real GPU, and no VRAM. Portable, manual-install and Cloud users don't send this, so Linux and multi-GPU setups are likely undercounted.
          </>
        ) : (
          <>
            Source: the legacy ComfyUI Desktop v1 app's opt-in telemetry, one count per install active in each Monday-start UTC week, from {fmtDate(weeks[0])} to {fmtDate(addDays(weeks[last], 6))}. Its data stops at the end of May 2026, when Desktop v2 replaced it; the last weeks of May are left out because they are partial or have incomplete hardware records. Each install's hardware is its latest profile, not what it had that week, and the main GPU is the one with the most VRAM. System RAM isn't recorded, and installs with no platform land in Other. AMD's share jumps in early January 2026, which may be a change in how the app reported AMD GPUs rather than real growth.
          </>
        )}{" "}
        Intel and AMD integrated graphics land in under 6GB. Macs share memory between CPU and GPU, so they have their own VRAM bucket. VRAM buckets include their upper bound (an 8GB card is in 6-8GB). GPU names are cleaned up, laptop chips are kept separate, and GPUs outside the 30 most common over the whole range are grouped as Other GPUs (for Desktop v1 this includes installs with no GPU recorded).
      </Methodology>
    </section>
  );
};

// Section 4: median to 90th percentile time per Cloud model, log scale.
export const SpeedRankings = ({ data, from, through }) => {
  const TYPES = ["Image", "Video", "Image tools", "Audio", "3D"];
  const ML = { gen: "generation time", wait: "latency" };
  const [k, setK] = useState("Original");
  const [m, setM] = useState("gen");
  const [t, setT] = useState("Image");
  const [sort, setSort] = useState("usage");
  const [allA, setAllA] = useState(false);
  const [allV, setAllV] = useState(false);
  const [ref, W] = useRankingWidth();
  const [tip, show, hide] = useRankingTip();
  const rowsAll = data.map((d) => ({ type: d[0], kind: d[1], model: d[2], p50_wait: d[3], p90_wait: d[4], p50_gen: d[5], p90_gen: d[6], usage: d[7], h: d[8] }));
  const kr = rowsAll.filter((r) => r.kind === k);
  const have = TYPES.filter((x) => kr.some((r) => r.type === x));
  const type = have.includes(t) ? t : have[0];
  const lo50 = "p50_" + m;
  const hi90 = "p90_" + m;
  // "Usage" orders by share of Cloud credits (rank 1 = most); "Fastest" by the median of the chosen measure.
  const rows = kr.filter((r) => r.type === type && r[lo50] != null).sort((a, b) => (sort === "fast" ? a[lo50] - b[lo50] : a.usage - b.usage));
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
      <h2>Fastest Models</h2>
      <div className="mr-ctrls">
        <RankingSeg label="Models" options={[["Original", "Original models"], ["Community", "LoRAs"]]} value={k} onChange={(v) => (setK(v), reset())} />
        <RankingSeg label="Measure" options={[["gen", "Generation time"], ["wait", "Latency"]]} value={m} onChange={(v) => (setM(v), reset())} />
        <RankingSeg label="Output type" options={have.map((x) => [x, x])} value={type} onChange={(v) => (setT(v), reset())} />
        <RankingSeg label="Sort by" options={[["usage", "Usage"], ["fast", "Fastest"]]} value={sort} onChange={(v) => (setSort(v), reset())} />
      </div>
      <div className="mr-card">
        <h3>
          Speed Range<span className="mr-sub">: median to 90th-percentile {ML[m]}, {sort === "fast" ? "fastest median first" : "most used first"}</span>
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
        <h3>Times by Model</h3>
        <ShareTable
          rows={allV ? rows : rows.slice(0, 10)}
          cols={[
            ["Model", (r) => r.model],
            ["Median latency", (r) => fmtTime(r.p50_wait)],
            ["90th pct latency", (r) => fmtTime(r.p90_wait)],
            ["Median generation", (r) => fmtTime(r.p50_gen)],
            ["90th pct generation", (r) => fmtTime(r.p90_gen)],
          ]}
        />
        <RankingMore total={rows.length} open={allV} onToggle={() => setAllV(!allV)} />
      </div>
      <Methodology>
        Source: Comfy Cloud job records, successful jobs from {fmtDate(from)} to {fmtDate(through)}. Times are medians (the typical job) and 90th percentiles (a slow job). Latency is the wait from when a job is submitted to when it starts running. Generation time is from start to finish of the run, including loading the model onto the GPU and every other step in the workflow, so it varies with steps, resolution and video length as well as the model. Each job is matched to its main diffusion model, which works for about 69% of jobs. Every model with at least 100 jobs since {fmtDate(from)} is shown. Original models are the official releases from the model makers (including Comfy's repackaged and quantized copies). LoRAs are the community fine-tunes: checkpoints and merges trained on top of the original models. When the same file is stored under several names, the most used copy is shown. Checkpoints with explicit names are left out. Every job ran on the same GPU (RTX Pro 6000). API (partner) models are left out because their timing mixes latency and generation time. Sort by Usage puts the models with the most Cloud usage first, measured as share of Cloud credits: Cloud charges credits per second of GPU time and every job ran on the same GPU, so each model's share of metered GPU time is its share of credits (metered for about 92% of the jobs shown). Sort by Fastest puts the lowest median first.
      </Methodology>
    </section>
  );
};

// Section 5: share of Comfy-Org Hugging Face downloads within each output type.
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
  // The page shows the last year: 52 weeks or 12 months.
  const cut = Math.max(0, grain.periods.length - (g === "Weekly" ? 52 : 12));
  const ps = grain.periods.slice(cut);
  const last = ps.length - 1;
  const ranked = tp.models
    .map((mm) => ({ s: mm.s.slice(cut), mm }))
    .map(({ s, mm }) => ({ name: mm.m, h: mm.h, s, last: s[last], prev: s[last - 1], change: 100 * (s[last] - s[last - 1]) }))
    .filter((r) => r.last > 0)
    .sort((a, b) => b.last - a.last);
  const color = new Map(ranked.map((r, i) => [r.name, rankingColor(i)]));
  const topNames = ranked.slice(0, TOPN).map((r) => r.name);
  const otherS = ps.map((_, pi) => tp.models.filter((mm) => !topNames.includes(mm.m)).reduce((a, mm) => a + (mm.s[cut + pi] || 0), 0));
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
      <h2>Top Open Source Model Downloads</h2>
      <p className="mr-lead">Share of downloads of Comfy-Org's open model repos on Hugging Face over the last year, by week or month.</p>
      <div className="mr-ctrls">
        <RankingSeg label="Output type" options={types.map((x) => [x, x])} value={type} onChange={(v) => (setT(v), setAll(false))} />
        <RankingSeg label="Period" options={[["Weekly", "Weekly"], ["Monthly", "Monthly"]]} value={g} onChange={(v) => (setG(v), setAll(false))} />
      </div>
      <div className="mr-card">
        <h3>
          Share of Downloads<span className="mr-sub">: {type}, share of each {unit}, top {TOPN} in the latest {unit}</span>
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
      <Methodology>
        Source: Hugging Face downloads of the Comfy-Org organization's model repos. Up to Oct 18, 2026 the counts come from Hugging Face's publisher analytics. After that they come from the change in each repo's public download total, recorded every morning, so a period is only shown once a recording exists near its start. Weeks are Monday-start UTC weeks and the latest period runs to {fmtDate(through)}. Each repo is one model family and can hold several files (precisions, text encoders, VAEs). A download is one file fetched, so a workflow that pulls three files counts three times. Models published by other organizations, or by their own labs, aren't in this data. Shares are within each output type, which is set by hand from the repo name. Text encoders and VAEs are support files other models load (the Flux Klein VAE and text encoder repos, Qwen3-VL, Gemma 4, SigCLIP).
      </Methodology>
    </section>
  );
};

// Mintlify shows the page description as plain text under the title. This
// turns one phrase in it into a link once the page has rendered.
export const SubtitleLink = ({ phrase, href }) => {
  useEffect(() => {
    const link = () => {
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walk.nextNode(); node; node = walk.nextNode()) {
        const i = node.nodeValue.indexOf(phrase);
        if (i < 0 || node.parentElement.closest("a, h1, nav, aside, script, style, .mr")) continue;
        const a = document.createElement("a");
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = phrase;
        a.style.textDecoration = "underline";
        a.style.textUnderlineOffset = "3px";
        const rest = node.splitText(i);
        rest.nodeValue = rest.nodeValue.slice(phrase.length);
        node.parentNode.insertBefore(a, rest);
        return true;
      }
      return false;
    };
    if (link()) return;
    const timer = setInterval(() => link() && clearInterval(timer), 250);
    const stop = setTimeout(() => clearInterval(timer), 5000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [phrase, href]);
  return null;
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
      .mr-link { color: inherit; text-decoration: underline; text-decoration-color: var(--mr-muted); text-underline-offset: 2px; }
      .mr-link:hover { text-decoration-color: currentColor; }
      .mr svg text.mr-svglink { text-decoration: underline; text-decoration-color: var(--mr-muted); cursor: pointer; }
      .mr svg a:hover text.mr-svglink { text-decoration-color: currentColor; }
      .mr-method summary { cursor: pointer; width: fit-content; font-size: 0.8125rem; color: var(--mr-fg); }
      .mr-method summary:focus-visible { outline: 2px solid var(--mr-fg); outline-offset: 1px; }
      .mr-method[open] summary { margin-bottom: 0.5rem; }
      .mr-note { margin: 0; font-size: 0.8125rem; color: var(--mr-muted-fg); max-width: 85ch; }
    `}</style>
    <nav className="mr-toc" aria-label="Rankings sections">
      <a href="#top-models">Top Models</a>
      <a href="#top-movers">Top Movers</a>
      <a href="#hardware-setups">Hardware Setups</a>
      <a href="#fastest-models">Fastest Models</a>
      <a href="#top-open-source-downloads">Top Open Source Downloads</a>
    </nav>
    <TopModels data={data.generations} />
    <TopMovers data={data.generations} />
    <HardwareRankings data={data.hardware} />
    <SpeedRankings data={data.speed} from={data.speedFrom || "2026-08-24"} through={data.through} />
    <DownloadRankings data={data.downloads} through={data.through} />
  </div>
);

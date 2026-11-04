import React from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { moneyK } from './util';

// Categorical hues are assigned in this fixed order and follow the entity, never the rank.
export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
const tick = { fill: 'var(--ink-3)', fontSize: 12 };
const hover = { fill: 'var(--surface-3)', opacity: 0.5 };

function Tip({ active, payload, label, format }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      {label != null && <div className="strong" style={{ marginBottom: 3 }}>{label}</div>}
      {payload.map((p) => (
        <div key={p.dataKey ?? p.name} className="row" style={{ gap: 6 }}>
          <i style={{ width: 8, height: 8, borderRadius: 2, background: p.payload?.fill || p.color }} />
          <span className="muted">{p.name}</span><span className="strong num" style={{ marginInlineStart: 'auto', paddingInlineStart: 12 }}>{format(p.value)}</span>
        </div>
      ))}
    </div>
  );
}
const Keys = ({ series }) => series.length > 1 && (
  <Legend verticalAlign="top" align="left" iconType="square" iconSize={10} height={28} wrapperStyle={{ fontSize: 12.5 }} formatter={(v) => <span style={{ color: 'var(--ink-2)' }}>{v}</span>} />
);

export function Bars({ data, x = 'label', series, format = moneyK, height = 260, horizontal, stacked }) {
  const size = data.length > 8 ? undefined : 28;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 4, right: 12, left: horizontal ? 12 : 0, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={!!horizontal} horizontal={!horizontal} stroke="var(--line)" />
        {horizontal
          ? <><XAxis type="number" tick={tick} tickFormatter={format} axisLine={false} tickLine={false} /><YAxis type="category" dataKey={x} tick={tick} width={120} axisLine={false} tickLine={false} /></>
          : <><XAxis dataKey={x} tick={tick} axisLine={{ stroke: 'var(--line-strong)' }} tickLine={false} interval="preserveStartEnd" /><YAxis tick={tick} tickFormatter={format} width={58} axisLine={false} tickLine={false} /></>}
        <Tooltip cursor={hover} content={<Tip format={format} />} />
        {Keys({ series })}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId={stacked ? 'a' : undefined} fill={s.color || SERIES[i]} maxBarSize={size || 26} isAnimationActive={false} stroke="var(--surface)" strokeWidth={stacked ? 2 : 0}
            radius={stacked ? (i === series.length - 1 ? [4, 4, 0, 0] : 0) : (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0])} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
export function Trend({ data, x = 'label', series, format = moneyK, height = 260, area }) {
  const Chart = area ? AreaChart : LineChart;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey={x} tick={tick} axisLine={{ stroke: 'var(--line-strong)' }} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={tick} tickFormatter={format} width={58} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ stroke: 'var(--line-strong)' }} content={<Tip format={format} />} />
        {Keys({ series })}
        {series.map((s, i) => (area
          ? <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color || SERIES[i]} strokeWidth={2} fill={s.color || SERIES[i]} fillOpacity={0.12} isAnimationActive={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />
          : <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color || SERIES[i]} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />))}
      </Chart>
    </ResponsiveContainer>
  );
}
export function Donut({ data, format = (v) => v, height = 200, center, centerLabel }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div>
      <div style={{ position: 'relative' }}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Tooltip content={<Tip format={format} />} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="94%" paddingAngle={1} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
          <div><div className="kpi-value">{center ?? format(total)}</div><div className="small muted">{centerLabel}</div></div>
        </div>
      </div>
      <div className="stack-s" style={{ marginTop: 10 }}>
        {data.map((d) => (
          <div key={d.name} className="row between small">
            <span className="row"><i style={{ width: 10, height: 10, borderRadius: 3, background: d.color, display: 'inline-block' }} /><span className="sub">{d.name}</span></span>
            <span className="num strong">{format(d.value)}<span className="muted" style={{ fontWeight: 400 }}> · {total ? Math.round((d.value / total) * 100) : 0}%</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
export const Spark = ({ data, color = 'var(--s1)', height = 36 }) => (
  <ResponsiveContainer width="100%" height={height}>
    <AreaChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
      <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.12} isAnimationActive={false} />
    </AreaChart>
  </ResponsiveContainer>
);

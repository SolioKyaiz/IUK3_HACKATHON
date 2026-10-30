// Flat crop pictures drawn for SuuPlan, one consistent style (48×48, 2–3 colours each).
const GRAIN = "#E8B33A", GRAIN_DARK = "#B7791F";
const LEAF = "#4CAF50", LEAF_DARK = "#2E7D32";

function Ear({ color, dark, awns }) {
  // A cereal ear: stem, three pairs of grains and a top grain; barley adds long awns.
  const rows = [15, 22, 29];
  return (
    <>
      <path d="M24 45V12" stroke={dark} strokeWidth="2.5" strokeLinecap="round" />
      {rows.map((y, i) => (
        <g key={i}>
          <ellipse cx="19.6" cy={y} rx="3.2" ry="5.6" fill={color} stroke={dark} strokeWidth="1" transform={`rotate(-32 19.6 ${y})`} />
          <ellipse cx="28.4" cy={y} rx="3.2" ry="5.6" fill={color} stroke={dark} strokeWidth="1" transform={`rotate(32 28.4 ${y})`} />
          {awns && <path d={`M17 ${y - 4} L10 ${y - 13} M31 ${y - 4} L38 ${y - 13}`} stroke={dark} strokeWidth="1.2" strokeLinecap="round" />}
        </g>
      ))}
      <ellipse cx="24" cy="8.5" rx="3" ry="5.2" fill={color} stroke={dark} strokeWidth="1" />
      {awns && <path d="M24 3.5V-2" stroke={dark} strokeWidth="1.2" strokeLinecap="round" />}
    </>
  );
}

const DRAW = {
  wheat: () => <Ear color={GRAIN} dark={GRAIN_DARK} />,
  barley: () => <Ear color="#D8C25C" dark="#9C8424" awns />,
  maize: () => (
    <>
      <ellipse cx="24" cy="20" rx="7.5" ry="13.5" fill="#F6C833" stroke="#D99A00" strokeWidth="1" />
      <path d="M24 7v26M18.5 12h11M17 17h14M16.8 22h14.4M17.4 27h13.2" stroke="#D99A00" strokeWidth="1" opacity=".7" />
      <path d="M24 45C14 40 11 28 15.5 15c1 11 3.5 21 8.5 30z" fill={LEAF} />
      <path d="M24 45c10-5 13-17 8.5-30-1 11-3.5 21-8.5 30z" fill={LEAF_DARK} />
    </>
  ),
  potato: () => (
    <>
      <path d="M8 26c0-10 10-15 19-13 9 2 13 9 11 18-2 8-11 10-19 8C12 37 8 32 8 26z" fill="#C99A5B" stroke="#9A6E35" strokeWidth="1.5" />
      <path d="M14 22c2-4 6-6 10-6" stroke="#E3C08C" strokeWidth="2" strokeLinecap="round" fill="none" />
      {[[17, 26], [27, 21], [30, 31], [21, 33]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="1.6" ry="1.1" fill="#7E5527" />)}
    </>
  ),
  beans: () => (
    <>
      {[[18, 19, -28], [30, 31, 22]].map(([x, y, r], i) => (
        <g key={i} transform={`rotate(${r} ${x} ${y})`}>
          <ellipse cx={x} cy={y} rx="10" ry="6.6" fill="#A23B3B" stroke="#6E2222" strokeWidth="1" />
          <ellipse cx={x - 3} cy={y - 2.4} rx="4" ry="1.5" fill="#D06A6A" opacity=".8" />
          <path d={`M${x - 2} ${y + 5.2}q2 -2 4 0`} stroke="#F3E3D3" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
      ))}
    </>
  ),
  sugar_beet: () => (
    <>
      <path d="M24 17c-3-6-9-10-13-9 0 5 5 9 13 9z" fill={LEAF} />
      <path d="M24 17c3-6 9-10 13-9 0 5-5 9-13 9z" fill={LEAF_DARK} />
      <path d="M24 17c-2-5-1-11 0-14 1 3 2 9 0 14z" fill={LEAF} />
      <path d="M24 46c-4-6-11-11-11-19 0-6 5-10 11-10s11 4 11 10c0 8-7 13-11 19z" fill="#9C2B63" stroke="#6D1A43" strokeWidth="1" />
      <path d="M18 25c1-3 3-4 6-4.5" stroke="#C9578F" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>
  ),
  sunflower: () => (
    <>
      <path d="M24 32v14" stroke={LEAF_DARK} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 41c-3-4-8-5-11-3 3 3 7 4 11 3z" fill={LEAF} />
      {Array.from({ length: 12 }, (_, i) => (
        <ellipse key={i} cx="24" cy="10.5" rx="3.2" ry="6.5" fill="#F7B500" stroke="#D99500" strokeWidth=".8" transform={`rotate(${i * 30} 24 20)`} />
      ))}
      <circle cx="24" cy="20" r="7" fill="#6B3E1E" />
      {[[21.5, 18], [26, 17.5], [24, 21.5], [20.5, 22], [27, 22]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1" fill="#A0673A" />)}
    </>
  ),
  cotton: () => (
    <>
      <path d="M24 34v12" stroke="#7A5230" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M14 30l10 6 10-6-4 7h-12z" fill="#8B5A2B" />
      {[[16.5, 21, 7], [31.5, 21, 7], [24, 13, 7.5], [24, 25, 8]].map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="#FBFCFD" stroke="#B9C3CC" strokeWidth="1.2" />
      ))}
      <path d="M20 13c1-2 3-3 5-3" stroke="#DCE3E8" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </>
  ),
  alfalfa: () => (
    <>
      <path d="M24 26v20" stroke={LEAF_DARK} strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="24" cy="14" rx="6" ry="8.5" fill={LEAF} />
      <ellipse cx="14.5" cy="27" rx="6" ry="8.5" fill={LEAF} transform="rotate(-62 14.5 27)" />
      <ellipse cx="33.5" cy="27" rx="6" ry="8.5" fill={LEAF_DARK} transform="rotate(62 33.5 27)" />
      <path d="M24 26V8M24 26l-15 5M24 26l15 5" stroke="#A5D6A7" strokeWidth="1" />
      {[[38, 9], [41.5, 12.5], [36, 13.5]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.6" fill="#8E6CC9" />)}
    </>
  ),
  rice: () => (
    <>
      <path d="M14 46c1-14 6-27 20-36" stroke={LEAF_DARK} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <path d="M15 40c-5-6-6-12-4-18 3 6 4 12 4 18z" fill={LEAF} />
      {[[33, 11, 30], [29, 15, 40], [26, 20, 50], [37.5, 15, 70], [34, 20, 75], [30, 25, 80]].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx="2" ry="4" fill="#F3E7B8" stroke="#C7B06A" strokeWidth=".9" transform={`rotate(${r} ${x} ${y})`} />
      ))}
    </>
  ),
  onion: () => (
    <>
      <path d="M21 14c-1-4-1-8 0-11M27 14c1-4 1-8 0-11M24 14V2" stroke={LEAF} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 14c-9 3-14 10-12 18 2 7 8 10 12 13 4-3 10-6 12-13 2-8-3-15-12-18z" fill="#D9A441" stroke="#A8741C" strokeWidth="1.2" />
      <path d="M24 16c-4 4-5 12-2 26M24 16c4 4 5 12 2 26" stroke="#B9862A" strokeWidth="1" fill="none" />
      <path d="M20 44c1.5 1.5 6.5 1.5 8 0" stroke="#7E5527" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </>
  ),
  carrot: () => (
    <>
      <path d="M24 15c-3-5-8-8-12-8 1 5 6 8 12 8zM24 15c3-5 8-8 12-8-1 5-6 8-12 8zM24 15c-1-5 0-10 0-13 1 3 2 8 0 13z" fill={LEAF} />
      <path d="M17 15h14c0 10-3 22-7 31-4-9-7-21-7-31z" fill="#F08A24" stroke="#C4661A" strokeWidth="1" />
      <path d="M19 21h4M21 27h4M20 33h3M24 23h4" stroke="#C4661A" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  tomato: () => (
    <>
      <circle cx="24" cy="27" r="15" fill="#E2412F" stroke="#B02A1C" strokeWidth="1" />
      <ellipse cx="18" cy="22" rx="4" ry="2.5" fill="#F07A6B" opacity=".8" transform="rotate(-30 18 22)" />
      <path d="M24 14l3-4 1 5 5-1-3 4 4 2-6 1-4 3-4-3-6-1 4-2-3-4 5 1 1-5z" fill={LEAF_DARK} />
      <path d="M24 12V6" stroke={LEAF_DARK} strokeWidth="2.2" strokeLinecap="round" />
    </>
  ),
  cabbage: () => (
    <>
      <circle cx="24" cy="26" r="17" fill="#8BC34A" stroke="#558B2F" strokeWidth="1.2" />
      <path d="M24 9c-8 6-9 22 0 34M24 9c8 6 9 22 0 34" stroke="#558B2F" strokeWidth="1.2" fill="none" />
      <circle cx="24" cy="26" r="9" fill="#C5E1A5" stroke="#7CB342" strokeWidth="1" />
      <path d="M24 18v16M18 24c3 2 9 2 12 0" stroke="#7CB342" strokeWidth="1" fill="none" />
    </>
  ),
  melon: () => (
    <>
      <ellipse cx="24" cy="27" rx="18" ry="14" fill="#E9C46A" stroke="#B8902F" strokeWidth="1.2" />
      <path d="M9 22c10 6 20 6 30 0M8 29c10 5 22 5 32 0M14 16c4 8 4 18 0 24M24 13c3 9 3 19 0 28M34 16c-4 8-4 18 0 24" stroke="#C9A445" strokeWidth="1" fill="none" />
      <path d="M24 13c0-4 2-7 5-8" stroke="#7A5230" strokeWidth="2" strokeLinecap="round" fill="none" />
    </>
  ),
  tobacco: () => (
    <>
      <path d="M24 46V8" stroke={LEAF_DARK} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 40c-12 0-18-7-18-14 7-1 15 3 18 14z" fill={LEAF} />
      <path d="M24 40c12 0 18-7 18-14-7-1-15 3-18 14z" fill={LEAF_DARK} />
      <path d="M24 24c-9 0-14-6-14-12 6-1 12 3 14 12z" fill="#7CB342" />
      <path d="M24 24c9 0 14-6 14-12-6-1-12 3-14 12z" fill={LEAF} />
      {[[24, 5], [20.5, 7.5], [27.5, 7.5]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" fill="#F48FB1" />)}
    </>
  ),
  chickpea: () => (
    <>
      {[[17, 18], [29, 17], [23, 28], [12, 30], [34, 29], [23, 39]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="6.2" fill="#E8C98E" stroke="#B8955A" strokeWidth="1" />
          <path d={`M${x - 1} ${y - 4.5}c1.5 1 2 2.5 1.5 4`} stroke="#B8955A" strokeWidth="1.1" fill="none" strokeLinecap="round" />
        </g>
      ))}
    </>
  ),
  soybean: () => (
    <>
      <path d="M9 36C11 20 22 9 39 9c-1 15-12 28-30 27z" fill="#8BC34A" stroke="#558B2F" strokeWidth="1.2" />
      {[[16, 28], [23, 21], [30, 15]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="4.2" ry="3.6" fill="#C5E1A5" stroke="#7CB342" strokeWidth="1" />)}
      <path d="M9 36l-3 6" stroke="#558B2F" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  none: () => (
    <>
      <rect x="9" y="12" width="30" height="26" rx="5" fill="none" stroke="#9AA5A0" strokeWidth="2" strokeDasharray="4 3" />
      <path d="M17 25h14" stroke="#9AA5A0" strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
};

export default function CropIcon({ id, size = 28, className = "" }) {
  const draw = DRAW[id] || DRAW.none;
  return (
    <svg className={`crop-icon ${className}`} width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {draw()}
    </svg>
  );
}

export const CROP_IDS = Object.keys(DRAW).filter((k) => k !== "none");

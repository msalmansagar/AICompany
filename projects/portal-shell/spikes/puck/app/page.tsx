import Link from 'next/link';

const LINKS = [
  ['F1 — Render runtime, RTL', '/view?dir=rtl'],
  ['F1 — Render runtime, LTR (control)', '/view?dir=ltr'],
  ['F2/M — Editor, RTL, iframe ON (default)', '/edit?dir=rtl&iframe=1'],
  ['Editor, LTR, iframe ON (control)', '/edit?dir=ltr&iframe=1'],
  ['Escape hatch — Editor, RTL, iframe OFF', '/edit?dir=rtl&iframe=0'],
  ['Forced — Editor, RTL, iframe ON + dir injected', '/edit?dir=rtl&iframe=1&force=1'],
];

export default function Home() {
  return (
    <main style={{ padding: 32, maxWidth: 720 }}>
      <h1>Puck RTL Spike</h1>
      <p>Next 14.2 + React 18 + @puckeditor/core 0.22.4</p>
      <ul style={{ lineHeight: 2 }}>
        {LINKS.map(([label, href]) => (
          <li key={href}>
            <Link href={href}>{label}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

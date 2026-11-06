import styles from './forecast-review.module.css';

export const isForecastReview = (heading: string | undefined) =>
  ['Обещали — вышло', 'Чего не было в докладах', 'Доклад — результат'].includes(heading ?? '');

/** Строки хранятся в прежнем forecasts; карточки не добавляют полей в сохранение. */
export default function ForecastReview({ lines }: { lines: string[] }) {
  if (lines.length < 2) return null;
  const people = new Map<string, { text: string; verdict: string }[]>();
  for (const line of lines.slice(1)) {
    const divider = line.indexOf(' · ');
    const name = divider < 0 ? '' : line.slice(0, divider);
    const text = divider < 0 ? line : line.slice(divider + 3);
    const verdict = text.match(/ — (промах|почти|точно)\.$/)?.[1] ?? '';
    const rows = people.get(name) ?? [];
    rows.push({ text: verdict ? text.replace(/ — (промах|почти|точно)\.$/, '') : text, verdict });
    people.set(name, rows);
  }
  return <section className={styles.review} aria-label={lines[0]} data-forecast-review>
    <h3>{lines[0]}</h3>
    {[...people].map(([name, rows]) => <article key={name} className={styles.card}>
      <strong>{name}</strong>
      {rows.map((row, index) => <div key={index} className={styles.row}><span>{row.text}</span>
        {row.verdict && <b className={row.verdict === 'промах' ? styles.miss : row.verdict === 'почти' ? styles.almost : styles.exact}>
          {row.verdict}</b>}</div>)}
    </article>)}
    <p>Записано в досье советников.</p>
  </section>;
}

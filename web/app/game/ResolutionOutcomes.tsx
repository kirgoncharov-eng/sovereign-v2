import { choiceOutcomes } from '@/lib/client/choice-outcomes.ts';
import { RESOURCE_KEYS } from '@/lib/game/data.ts';
import { quarterDeadline } from '@/lib/client/initiative-note.ts';
import { RESOURCE_TITLE } from '@/lib/content/resource-names.ts';
import { advisorOutlook, OUTLOOK_QUALITY, signedEstimate } from '@/lib/client/advisor-outlook.ts';
import type { Choice, GameState } from '@/lib/game/types.ts';
import styles from './resolution-outcomes.module.css';

const signed = (value: number) => value === 0 ? '0' : `${value < 0 ? '−' : '+'}${Math.abs(value)}`;

/** Одна справка после выбора варианта: ожидаемая польза, невозвратная цена и конкретный срыв. */
export default function ResolutionOutcomes({ game, choice }: { game: GameState; choice: Choice }) {
  const forecast = choiceOutcomes(game, choice);
  if (!forecast) return null;
  const outlook = advisorOutlook(game, choice, forecast);
  const camps = (entries: { name: string; delta: number }[]) => entries.map(entry => `${entry.name} ${signed(entry.delta)}`).join('; ');
  const estimatedCamps = (entries: NonNullable<typeof outlook>['success']['camps']) =>
    entries.map(entry => `${entry.name} ${entry.estimate.text} (${entry.source.name})`).join('; ');
  return <div className={styles.forecast} role="group" aria-label="Последствия выбранного решения" data-choice-id={choice.id}>
    <p className={styles.title}>{outlook ? 'Оценка советников' : 'Расчёт канцелярии'}</p>
    <p>{outlook?.risk.text ?? `Риск срыва исполнения: ${forecast.failurePercent}%.`}</p>
    {outlook && forecast.failure && <p className={styles.note}>{outlook.risk.source.name} · {OUTLOOK_QUALITY[outlook.risk.source.skill]}.</p>}
    {forecast.failure && forecast.reason && <p className={styles.risk}>{forecast.reason}</p>}
    {outlook?.payment != null && <p>Денежное условие сделки: казна {signedEstimate(outlook.payment)} при исполнении. Уже учтено в оценке ниже.</p>}
    <table>
      <caption>{outlook ? 'Ожидаемое прямое действие резолюции' : 'Прямое действие вашей резолюции'}</caption>
      <thead><tr><th scope="col">Опора</th><th scope="col">Исполнят</th>{forecast.failure && <th scope="col">Срыв</th>}</tr></thead>
      <tbody>{RESOURCE_KEYS.map(key => <tr key={key}>
        <th scope="row">{RESOURCE_TITLE[key]}{outlook && <small className={styles.source}
          title={`${outlook.sources[key].name}: ${OUTLOOK_QUALITY[outlook.sources[key].skill]}`}>
          {key === 'personalResource' && (forecast.success.resources[key] ?? 0) <= 0
            && (forecast.failure?.resources[key] ?? 0) <= 0 ? 'прямые затраты'
            : outlook.sources[key].skill ? `${outlook.sources[key].name.split(' ').at(-1)} · ${'★'.repeat(outlook.sources[key].skill)}` : 'нет специалиста'}
        </small>}</th>
        <td>{outlook?.success.resources[key].text ?? signed(forecast.success.resources[key] ?? 0)}</td>
        {forecast.failure && <td>{outlook?.failure?.resources[key].text ?? signed(forecast.failure.resources[key] ?? 0)}</td>}
      </tr>)}</tbody>
    </table>
    <details className={styles.camps}>
      <summary>Отношения с лагерями</summary>
      <p>При исполнении: {(outlook ? estimatedCamps(outlook.success.camps) : camps(forecast.success.camps)) || 'без перемены'}.</p>
      {forecast.failure && <p>При срыве: {(outlook?.failure ? estimatedCamps(outlook.failure.camps) : camps(forecast.failure.camps)) || 'без перемены'}.</p>}
    </details>
    {forecast.later.length > 0 && <div role="group" aria-label="Будущие последствия резолюции">
      <p className={styles.title}>Будущие последствия</p>
      {forecast.later.map((effect, index) => <p key={index} className={styles.note}>
        «{effect.label}»: {RESOURCE_KEYS.filter(key => effect.res[key]).map(key =>
          `${RESOURCE_TITLE[key]} ${outlook?.later[index].resources[key]?.text ?? signed(effect.res[key]!)}`).join('; ')}.
        {' '}Срок: {quarterDeadline(game, effect.due)}.
        {forecast.failure && (effect.onFailure ? ' Сохраняется и при срыве исполнения.' : ' Только если резолюцию исполнят.')}
      </p>)}
    </div>}
    {outlook && <p className={styles.note}>Диапазоны — округлённая оценка, а не гарантия. Больше ★ — уже диапазон.
      {' '}Личные затраты и денежные условия сделки указаны точно.</p>}
    <p className={styles.note}>Прежние долги и другие события квартала изменят общий итог отдельно.</p>
  </div>;
}

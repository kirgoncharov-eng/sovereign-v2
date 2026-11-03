import { choiceOutcomes } from '@/lib/client/choice-outcomes.ts';
import { RESOURCE_KEYS } from '@/lib/game/data.ts';
import { plural } from '@/lib/game/engine.ts';
import { RESOURCE_TITLE } from '@/lib/content/resource-names.ts';
import type { Choice, GameState } from '@/lib/game/types.ts';
import styles from './resolution-outcomes.module.css';

const signed = (value: number) => value === 0 ? '0' : `${value < 0 ? '−' : '+'}${Math.abs(value)}`;

/** Одна справка после выбора варианта: ожидаемая польза, невозвратная цена и конкретный срыв. */
export default function ResolutionOutcomes({ game, choice }: { game: GameState; choice: Choice }) {
  const forecast = choiceOutcomes(game, choice);
  if (!forecast) return null;
  const camps = (entries: { name: string; delta: number }[]) => entries.map(entry => `${entry.name} ${signed(entry.delta)}`).join('; ');
  return <div className={styles.forecast} role="group" aria-label="Последствия выбранного решения" data-choice-id={choice.id}>
    <p className={styles.title}>Расчёт канцелярии</p>
    <p>Риск срыва исполнения: {forecast.failurePercent}%.</p>
    {forecast.failure && forecast.reason && <p className={styles.risk}>{forecast.reason}</p>}
    <table>
      <caption>Прямое действие вашей резолюции</caption>
      <thead><tr><th scope="col">Опора</th><th scope="col">Исполнят</th>{forecast.failure && <th scope="col">Срыв</th>}</tr></thead>
      <tbody>{RESOURCE_KEYS.map(key => <tr key={key}>
        <th scope="row">{RESOURCE_TITLE[key]}</th>
        <td>{signed(forecast.success.resources[key] ?? 0)}</td>
        {forecast.failure && <td>{signed(forecast.failure.resources[key] ?? 0)}</td>}
      </tr>)}</tbody>
    </table>
    <details className={styles.camps}>
      <summary>Отношения с лагерями</summary>
      <p>При исполнении: {camps(forecast.success.camps) || 'без перемены'}.</p>
      {forecast.failure && <p>При срыве: {camps(forecast.failure.camps) || 'без перемены'}.</p>}
    </details>
    {forecast.later && <p className={styles.note}>
      Если исполнят — «{forecast.later.label}» через {plural(forecast.later.turns, 'квартал', 'квартала', 'кварталов')}:
      {' '}{RESOURCE_KEYS.filter(key => forecast.later!.res[key]).map(key =>
        `${RESOURCE_TITLE[key]} ${signed(forecast.later!.res[key]!)}`).join('; ')}.
      {forecast.failure && ' При срыве это условие не вступит в силу.'}
    </p>}
    <p className={styles.note}>Прежние долги и другие события квартала изменят общий итог отдельно.</p>
  </div>;
}

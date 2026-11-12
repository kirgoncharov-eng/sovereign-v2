import { useId, useState } from 'react';
import ResIcon from './ResourceIcon.jsx';
import { advisorOutlook, resolutionOptions, hardOutlook, signedEstimate, type Estimate, type OutlookSource } from '@/lib/client/advisor-outlook.ts';
import { FOLLOW_UP_CONDITION } from '@/lib/client/choice-outcomes.ts';
import type { AdvisorDialogue } from '@/lib/content/advisor-dialogue.ts';
import { advisorDialogue } from '@/lib/client/advisor-dialogue.ts';
import { quarterDeadline } from '@/lib/client/initiative-note.ts';
import { promiseWarning, type PromiseWarning } from '@/lib/client/promise-warning.ts';
import { RESOURCE_TITLE } from '@/lib/content/resource-names.ts';
import type { Choice, GameState, ResourceKey } from '@/lib/game/types.ts';
import styles from './resolution-choices.module.css';

type Forecast = NonNullable<ReturnType<typeof advisorOutlook>>;
function Source({ source, hard }: { source: OutlookSource; hard: boolean }) {
  return <span className={styles.source}>{source.name}{!hard && source.skill > 0 && <span> {'★'.repeat(source.skill)}</span>}
    {source.loyalty && <small> · лояльность {source.loyalty}</small>}</span>;
}
// `named` — в раскрытом варианте рядом со значком стоит название опоры: значок без слова приходилось сверять с шапкой (#425).
function Resources({ estimates, named = false }: { estimates: Partial<Record<ResourceKey, Estimate>>; named?: boolean }) {
  const entries = Object.entries(estimates).filter(([, estimate]) => estimate!.value !== 0);
  if (!entries.length) return <span className={styles.neutral}>без перемены</span>;
  return <span className={styles.resources}>{entries.map(([key, estimate]) => {
    const { text, source, value } = estimate!;
    return <span className={styles.resource} key={key} title={`${RESOURCE_TITLE[key as ResourceKey]} · ${source.name}`}
      aria-label={`${RESOURCE_TITLE[key as ResourceKey]}: ${text}, ${source.name}`}>
      <ResIcon k={key} size={17} />{named && <span className={styles.name}>{RESOURCE_TITLE[key as ResourceKey]}</span>}
      <span className={value < 0 ? styles.loss : styles.gain}>{text}</span>
    </span>;
  })}</span>;
}
function Later({ game, forecast, compact = false }: { game: GameState; forecast: Forecast; compact?: boolean }) {
  return <>{forecast.later.map((effect, index) => <div className={styles.line} key={index}>
    <span>{compact ? quarterDeadline(game, effect.due) : `Позже · ${quarterDeadline(game, effect.due)}`}
      {compact && effect.when === 'failure' && ' · при срыве'}</span>
    <Resources estimates={effect.resources} named={!compact} />
    {!compact && <small>«{effect.label}». {FOLLOW_UP_CONDITION[effect.when]}</small>}
  </div>)}</>;
}
/** Предвыборное слово: что эта подпись перечеркнёт и к чему сделает шаг. В свёрнутом варианте — только нарушение. */
function Pledges({ warning, compact = false }: { warning: PromiseWarning; compact?: boolean }) {
  if (!warning.breaks.length && (compact || !warning.advances.length)) return null;
  return <div className={styles.pledges} data-promise-warning>
    {warning.breaks.map(title => <div key={title} className={styles.loss}>Нарушит обещание «{title}»{!compact && ' — сразу, даже при срыве'}</div>)}
    {!compact && warning.advances.map(({ title, progress, count }) =>
      <div key={title} className={styles.gain}>Шаг к обещанию «{title}»: {Math.min(progress, count)} из {count}, если исполнят</div>)}
  </div>;
}
function Risk({ forecast, hard }: { forecast: Forecast; hard: boolean }) {
  return <div className={styles.risk}>Риск: <strong>{forecast.risk.text}</strong><span> · <Source source={forecast.risk.source} hard={hard} /></span></div>;
}

/** Одно раскрытие на документ: сравнение всех вариантов доступно до первого касания. */
export default function ResolutionChoices({ game, busy, onSign, dialogue }: {
  game: GameState; busy: boolean; onSign: (choice: Choice) => void; dialogue?: AdvisorDialogue;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const groupId = useId();
  const hard = hardOutlook(game);
  return <div className={styles.choices} data-resolution-choices>
    {resolutionOptions(game).map((choice, index) => {
      const forecast = advisorOutlook(game, choice)!;
      const pledges = promiseWarning(game, choice);
      const expanded = selected === choice.id;
      const speeches = expanded ? advisorDialogue(game, choice, dialogue) : [];
      const experts = [...new Map([...Object.values(forecast.sources), forecast.risk.source].map(source => [source.id, source])).values()];
      const detailId = `${groupId}-${index}`;
      return <section key={choice.id} className={`${styles.option}${expanded ? ` ${styles.selected}` : ''}`} data-choice-id={choice.id}>
        <button id={`opt-${index + 1}`} type="button" className={`sv-choice-row ${styles.pick}`} aria-expanded={expanded} aria-controls={detailId}
          disabled={busy} onClick={() => setSelected(expanded ? null : choice.id)}>
          <strong className={styles.title}><span>{choice.text}</span></strong>
          {forecast.people.proponent && <span className={styles.people}>Предлагает {forecast.people.proponent.name}
            {forecast.people.critic && ` · возражает ${forecast.people.critic.name}`}</span>}
          {!expanded && <><span className={styles.line}><span>Сейчас</span><Resources estimates={forecast.success.resources} /></span>
            <Later game={game} forecast={forecast} compact /><Pledges warning={pledges} compact /><Risk forecast={forecast} hard={hard} /></>}
        </button>
        {expanded && <div id={detailId} className={styles.detail} role="group" aria-label="Последствия выбранного решения" data-choice-id={choice.id}>
          {speeches.map((line, n) => <blockquote key={n}>
            <span className={styles.portrait} aria-hidden="true">{line.source.name.split(' ').at(-1)?.[0]}</span>
            <div><cite><Source source={line.source} hard={hard} /></cite><p>«{line.text}»</p>
              {line.correction && <p>«{line.correction}»</p>}</div></blockquote>)}
          <div className={styles.line}><strong>Исполнят</strong><Resources estimates={forecast.success.resources} named /></div>
          {forecast.failure && <div className={styles.line}><strong>Срыв</strong>
            {forecast.failureOmitted ? <span>не обсуждали</span> : <Resources estimates={forecast.failure.resources} named />}
          </div>}
          <Later game={game} forecast={forecast} />
          <Pledges warning={pledges} />
          {forecast.payment !== null && <p>По договору: казна {signedEstimate(forecast.payment)}.</p>}
          <Risk forecast={forecast} hard={hard} />
          {forecast.risk.reason && <p className={styles.reason}>{forecast.risk.reason}</p>}
          <details className={styles.experts}><summary>Кто считал</summary>
            {experts.map(source => <div key={source.id}><Source source={source} hard={hard} /> · {source.role}</div>)}
            <div className={styles.camps}>
              <strong>Лагеря при исполнении</strong>
              {forecast.success.camps.map(camp => <span key={camp.name}>{camp.name} {camp.estimate.text}</span>)}
              {forecast.failure && !forecast.failureOmitted && <><strong>Лагеря при срыве</strong>
                {forecast.failure.camps.map(camp => <span key={camp.name}>{camp.name} {camp.estimate.text}</span>)}</>}
            </div>
          </details>
          <button type="button" className={styles.sign} disabled={busy} onClick={() => onSign(choice)}>Подписать</button>
        </div>}
      </section>;
    })}
  </div>;
}

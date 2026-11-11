'use client';
import { useEffect, useRef, useState } from 'react';
import { ADVISOR_ROLES, RESOURCE_KEYS } from '@/lib/game/data.ts';
import { advisorProfile } from '@/lib/game/advisors.ts';
import { cabinetCandidates, cabinetEnabled, cabinetPreview, type CabinetAction } from '@/lib/game/cabinet.ts';
import { knowsAdvisorSkill } from '@/lib/client/advisor-outlook.ts';
import { RESOURCE_TITLE } from '@/lib/content/resource-names.ts';
import type { GameState, ResourceDelta } from '@/lib/game/types.ts';
import styles from './cabinet.module.css';

const signed = (n: number) => n > 0 ? `+${n}` : `−${Math.abs(n)}`;
const price = (cost: ResourceDelta) => RESOURCE_KEYS.filter(key => cost[key])
  .map(key => `${RESOURCE_TITLE[key]} ${signed(cost[key]!)}`).join(' · ');
const stars = (skill: number) => '★'.repeat(skill) + '☆'.repeat(3 - skill);

/** Родитель применяет указ к актуальному состоянию и сохраняет его тем же commit, что остальные решения. */
export default function CabinetPanel({ game, onAction }: { game: GameState; onAction: (action: CabinetAction) => void }) {
  const [seat, setSeat] = useState('economist');
  const [pending, setPending] = useState<CabinetAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (pending) confirmation.current?.focus();
  }, [pending]);
  if (!cabinetEnabled(game)) return null;
  const current = game.advisors.find(person => person.id === seat);
  const role = ADVISOR_ROLES.find(role => role.id === seat)!;
  const profile = current ? advisorProfile(game, current) : null;
  const preview = pending ? cabinetPreview(game, pending) : null;
  const candidates = cabinetCandidates(game, seat);
  const select = (id: string) => { setSeat(id); setPending(null); setError(null); };
  const sign = () => {
    if (!pending) return;
    try { onAction(pending); setPending(null); setError(null); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось подписать указ.'); }
  };
  return <section className={styles.panel} aria-label="Совет президента">
    <header className={styles.header}>
      <span>СОВЕТ ПРЕЗИДЕНТА</span>
      <h2>Ваша команда</h2>
      <p>Назначения — ваше решение. Указ меняет состав сразу; повторные перестановки за квартал требуют больше влияния.</p>
    </header>
    <nav className={styles.seats} aria-label="Должности советников">
      {ADVISOR_ROLES.map(role => <button type="button" key={role.id} aria-pressed={seat === role.id} onClick={() => select(role.id)}>
        {role.role}<small>{game.advisors.find(person => person.id === role.id)?.name ?? 'Вакансия'}</small>
      </button>)}
    </nav>
    <h3>{role.role}</h3>
    <div className={styles.current}>
      {current && profile ? <>
        <strong>{current.name}</strong>
        <p>{knowsAdvisorSkill(game) && <>{stars(current.skill)} · </>}Лояльность: {profile.loyaltyWord}</p>
        {profile.camp && <p>Связан с группой «{profile.camp.name}».</p>}
        {profile.bio && <p>{profile.bio}</p>}
        <button type="button" disabled={game.ended} onClick={() => setPending({ kind: 'dismiss', seat, name: current.name })}>Уволить без замены</button>
      </> : <>
        <strong>Должность вакантна</strong>
        <p>Профильной оценки нет — в прогнозе «?». Программы этого координатора ждут назначения; прежние сроки продолжают идти.</p>
      </>}
    </div>
    <h3>Кандидаты на эту должность</h3>
    {!candidates.length && <p>Предложения недоступны.</p>}
    {candidates.map(candidate => {
      const action: CabinetAction = { kind: 'hire', candidate: candidate.id };
      const offer = cabinetPreview(game, action);
      return <article className={styles.candidate} key={candidate.id}>
        <strong>{candidate.name}</strong>
        <p className={styles.origin}>{candidate.title}{knowsAdvisorSkill(game) && <> · {stars(candidate.skill)}</>} · лояльность {candidate.loyalty}</p>
        <p>{candidate.bio}</p>
        <p className={styles.price}>{price(offer.cost)}</p>
        {offer.reactions.length > 0 && <p>{offer.reactions.map(reaction => `${reaction.name} ${signed(reaction.delta)}`).join(' · ')}</p>}
        <button type="button" disabled={!!offer.unavailable} onClick={() => { setPending(action); setError(null); }}>Рассмотреть назначение</button>
        {offer.unavailable && <p className={styles.note}>{offer.unavailable}</p>}
      </article>;
    })}
    {pending && preview && <section ref={confirmation} tabIndex={-1} className={styles.confirm}
      aria-label="Подтверждение кадрового указа" aria-live="polite">
      <h3>{pending.kind === 'dismiss' ? `Освободить от должности: ${preview.current?.name ?? pending.name}` : `Назначить: ${preview.candidate?.name ?? 'предложение устарело'}`}</h3>
      {preview.leaving && <p>{preview.leaving.text}</p>}
      <p className={styles.price}>{price(preview.cost)}</p>
      {preview.reactions.length > 0 && <p>{preview.reactions.map(reaction => `${reaction.name} ${signed(reaction.delta)}`).join(' · ')}</p>}
      {preview.assignments.length > 0 && <p>{pending.kind === 'hire'
        ? 'Незавершённые программы получит новый советник. Бюджет, результат и срок сохраняются; ближайший квартал — передача дел, −5 работы.'
        : 'Кресло останется пустым. Согласования программ остановятся до назначения; сроки не продлеваются.'}</p>}
      {pending.kind === 'dismiss' && <p>Без советника его прогноз и оценка риска будут неизвестны. Государственные обязательства сохраняются.</p>}
      {preview.unavailable && <p role="status">{preview.unavailable}</p>}
      <div className={styles.actions}>
        <button type="button" className={styles.sign} disabled={!!preview.unavailable} onClick={sign}>Подписать кадровый указ</button>
        <button type="button" onClick={() => { setPending(null); setError(null); }}>Отмена</button>
      </div>
    </section>}
    {error && <p role="alert">{error}</p>}
    {game.staffing?.lastTurn === game.turn && <p className={styles.receipt} role="status">{game.staffing.receipt}</p>}
  </section>;
}

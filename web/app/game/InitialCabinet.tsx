'use client';
import { useState } from 'react';
import CabinetPanel from './CabinetPanel.tsx';
import { ADVISOR_ROLES, RESOURCE_KEYS } from '@/lib/game/data.ts';
import { advisorProfile } from '@/lib/game/advisors.ts';
import { cabinetCandidates, type CabinetAction } from '@/lib/game/cabinet.ts';
import { initialAdvisor, initialCabinetPreview, resetInitialCabinet, selectInitialAdvisor } from '@/lib/game/cabinet-formation.ts';
import { knowsAdvisorSkill } from '@/lib/client/advisor-outlook.ts';
import { RESOURCE_TITLE } from '@/lib/content/resource-names.ts';
import type { GameState } from '@/lib/game/types.ts';
import styles from './cabinet.module.css';

const signed = (value: number) => value > 0 ? `+${value}` : `−${Math.abs(value)}`;

export default function InitialCabinet({ game, onChange, onConfirm, busy = false }: {
  game: GameState; onChange: (state: GameState) => void; onConfirm: () => void; busy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const preview = initialCabinetPreview(game);
  const changed = Object.keys(game.cabinetFormation?.selected ?? {}).length > 0;
  const select = (action: CabinetAction) => {
    if (action.kind === 'dismiss') onChange(selectInitialAdvisor(game, action.seat, null));
    else {
      const candidate = cabinetCandidates(game).find(person => person.id === action.candidate);
      if (candidate) onChange(selectInitialAdvisor(game, candidate.seat, candidate.id));
    }
  };
  return <section className={styles.panel} aria-label="Первоначальный состав совета">
    <header className={styles.header}>
      <span>ПЕРВЫЙ ПРЕЗИДЕНТСКИЙ УКАЗ</span>
      <h2>С кем начнёте срок</h2>
      <p>Канцелярия подготовила четыре кандидатуры. Утвердите состав или выберите других людей.</p>
    </header>
    {editing ? <>
      <CabinetPanel game={game} onAction={select} />
      <button type="button" onClick={() => setEditing(false)}>К составу и общей цене</button>
    </> : <div className={styles.formationList}>
      {ADVISOR_ROLES.map(role => {
        const advisor = initialAdvisor(game, role.id)!;
        const profile = advisorProfile(game, advisor);
        return <article className={styles.formationPerson} key={role.id}>
          <small>{role.role}</small><strong>{advisor.name}</strong>
          <p>{knowsAdvisorSkill(game) && <>{'★'.repeat(advisor.skill)}{'☆'.repeat(3 - advisor.skill)} · </>}
            Лояльность: {profile.loyaltyWord}</p>
          {profile.bio && <p>{profile.bio}</p>}
          {profile.camp && <p className={styles.note}>Близость к группе: «{profile.camp.name}».</p>}
        </article>;
      })}
    </div>}
    <div className={styles.confirm} aria-label="Итог утверждения состава" aria-live="polite">
      <h3>Общие условия</h3>
      {preview.unavailable ? <p role="status">{preview.unavailable} Измените подбор или верните предложенный состав.</p>
        : <>
          <p className={styles.price}>{RESOURCE_KEYS.some(key => preview.cost[key])
            ? RESOURCE_KEYS.filter(key => preview.cost[key]).map(key => `${RESOURCE_TITLE[key]} ${signed(preview.cost[key]!)}`).join(' · ')
            : 'Предложенный состав — без дополнительных расходов.'}</p>
          {preview.reactions.length > 0 && <p>{preview.reactions.map(reaction => `${reaction.name} ${signed(reaction.delta)}`).join(' · ')}</p>}
        </>}
      {changed && <p className={styles.note}>Отказ от кандидатуры не считается увольнением. Поддержка каждого круга учитывается один раз за год.</p>}
      <div className={styles.actions}>
        <button className={styles.sign} type="button" disabled={busy || !!preview.unavailable} onClick={onConfirm}>Утвердить состав</button>
        {!editing && <button type="button" disabled={busy} onClick={() => setEditing(true)}>Изменить состав</button>}
        {changed && <button type="button" disabled={busy} onClick={() => { onChange(resetInitialCabinet(game)); setEditing(false); }}>Отменить изменения</button>}
      </div>
    </div>
  </section>;
}

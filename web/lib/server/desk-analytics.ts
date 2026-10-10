import type { RunCohort } from "./run-cohorts.ts";

const escape = (value: string) => value.replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function renderDeskAnalytics(cohorts: RunCohort[]): string {
  const rows = [...cohorts].reverse().filter(cohort => cohort.mode === "ordinary").map(cohort => {
    const eligible = cohort.h.deskAvailable ?? 0;
    const count = (name: string) => eligible
      ? `${cohort.h[name] ?? 0} / ${eligible} · ${Math.round((cohort.h[name] ?? 0) / eligible * 100)}%` : "—";
    return `<tr><td>${escape(cohort.date)}</td><td>${escape(cohort.version)}</td>
      <td>${escape(cohort.source)} / ${escape(cohort.channel ?? "Неизвестный источник")}</td><td>${eligible}</td>
      ${["deskOpened", "deskMessages", "deskGovernment", "deskAppointed"].map(name => `<td>${count(name)}</td>`).join("")}</tr>`;
  }).join("");
  return `<div class="paper"><h2>Использование президентского стола</h2>
    <p class="muted">Только обычные партии. Знаменатель — партии, в которых стол появился.
    Открытие сообщений или правительства — использование стола; назначение — успешная подпись, не выбор варианта.
    Каждая партия считается один раз на рубеж, включая повторное открытие и загрузку.
    Стол появляется с третьего хода; первые два решения не снижают процент использования.
    Отсутствие идентификатора партии, потеря сети и тестовое устройство ограничивают полноту.
    Прочерк — нет измеренного знаменателя; 0% — стол появился, но открытие пока не получено.</p>
    <div class="scroll"><table><tr><th>Старт</th><th>Версия</th><th>Платформа / канал</th><th>Стол появился</th>
    <th>Открыли стол</th><th>Сообщения</th><th>Правительство</th><th>Назначили</th></tr>
    ${rows || '<tr><td colspan="8">Пока нет партий</td></tr>'}</table></div></div>`;
}

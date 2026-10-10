"use client";
// Личные сообщения хода: истории людей, которые идут параллельно делам кабинета.
// Короткий ход: на виду конверт — кто пишет; сам текст — по нажатию.
const KIND = { letter: "ПИСЬМО", call: "ЗВОНОК", note: "ЗАПИСКА", report: "ИЗ СВОДКИ" };

export default function Letters({ letters }) {
  if (!Array.isArray(letters) || !letters.length) return null;
  return (
    <section className="sv-letters" aria-label="Личные сообщения">
      {letters.map(letter => (
        <details key={`${letter.story}-${letter.kind}`} className="sv-paper sv-letter">
          <summary className="sv-letter-head">
            <span>{KIND[letter.kind] ?? "СООБЩЕНИЕ"}</span>
            <strong>{letter.from}{letter.role ? `, ${letter.role.charAt(0).toLowerCase()}${letter.role.slice(1)}` : ""}</strong>
          </summary>
          <p>{letter.text}</p>
        </details>
      ))}
    </section>
  );
}

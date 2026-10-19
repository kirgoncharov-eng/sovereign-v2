"use client";
// Личные сообщения хода: истории людей, которые идут параллельно делам кабинета.
// Короткий ход: на виду конверт — кто пишет; сам текст — по нажатию.
// На одно письмо истории в кампании 1978 года можно ответить резолюцией на полях (#156):
// цена видна до выбора, ответ необязателен, главная кнопка хода остаётся «Следующий ход».
const KIND = { letter: "ПИСЬМО", call: "ЗВОНОК", note: "ЗАПИСКА", report: "ИЗ СВОДКИ" };

const signed = value => (value > 0 ? `+${value}` : `−${Math.abs(value)}`);

function ReplyPrice({ reply, from, Chips }) {
  const free = !Object.values(reply.cost ?? {}).some(Boolean) && !reply.relation;
  if (free) return <span className="sv-letter-free">без затрат</span>;
  return <>
    {Chips && <Chips delta={reply.cost}/>}
    {reply.relation ? <span className="sv-letter-relation">{from}: отношение {signed(reply.relation)}</span> : null}
  </>;
}

function LetterReplies({ letter, answer, onReply, Chips }) {
  const replies = letter.replies;
  if (!Array.isArray(replies) || !replies.length) return null;
  const chosen = answer && replies.find(reply => reply.id === answer.reply);
  if (chosen) return <p className="sv-letter-answer">Ваша резолюция: «{chosen.text}»</p>;
  if (answer || !onReply) return null;
  return <div className="sv-letter-replies" role="group" aria-label="Резолюция на письме">
    {replies.map(reply => <button key={reply.id} type="button" onClick={() => onReply(letter.story, reply.id)}>
      <strong>{reply.text}</strong>
      <ReplyPrice reply={reply} from={letter.from} Chips={Chips}/>
    </button>)}
    <small>Можно не отвечать: молчание тоже ответ.</small>
  </div>;
}

export default function Letters({ letters, answers, onReply, Chips }) {
  if (!Array.isArray(letters) || !letters.length) return null;
  return (
    <section className="sv-letters" aria-label="Личные сообщения">
      {letters.map(letter => {
        const waiting = Array.isArray(letter.replies) && letter.replies.length > 0 && !answers?.[letter.story];
        return <details key={`${letter.story}-${letter.kind}`} className="sv-paper sv-letter">
          <summary className="sv-letter-head">
            <span>{KIND[letter.kind] ?? "СООБЩЕНИЕ"}{waiting && <em className="sv-letter-waiting"> · ждёт ответа</em>}</span>
            <strong>{letter.from}{letter.role ? `, ${letter.role.charAt(0).toLowerCase()}${letter.role.slice(1)}` : ""}</strong>
          </summary>
          <p>{letter.text}</p>
          <LetterReplies letter={letter} answer={answers?.[letter.story]} onReply={onReply} Chips={Chips}/>
        </details>;
      })}
    </section>
  );
}

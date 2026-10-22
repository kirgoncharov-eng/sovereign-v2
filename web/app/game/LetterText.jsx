"use client";
import { splitChancery } from '@/lib/content/quarter-letters.ts';
import { PeopleText } from './PeopleText.jsx';

// Письмо в папке (#244): речь человека — абзацем, строка канцелярии с цифрами — мелко под ней.
export function LetterText({ text }) {
  const { voice, chancery } = splitChancery(text);
  return <><p><PeopleText>{voice}</PeopleText></p>{chancery && <p className="sv-incoming-status"><PeopleText>{chancery}</PeopleText></p>}</>;
}

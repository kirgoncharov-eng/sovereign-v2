import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INVESTIGATION_DEBATES } from './investigation-debates.ts';
import { INVESTIGATION_DIALOGUE } from './investigation-dialogue.ts';

const CONDITION = /(?:^|[\s,:—])(?:Но|если|Если|иначе|Иначе)[\s,:]/u;
const SENTENCE = /^[А-ЯЁ«].*[.!?]$/u;

test('каждый вариант расследования: говорят автор и критик разговора, сильный тон называет, на чём сорвётся', () => {
  assert.deepEqual(Object.keys(INVESTIGATION_DIALOGUE).sort(), Object.keys(INVESTIGATION_DEBATES).sort(), 'все варианты эпизодов');
  for (const [text, speakers] of Object.entries(INVESTIGATION_DIALOGUE)) {
    const roles = INVESTIGATION_DEBATES[text].slice(0, 2).map(([who]) => who);
    assert.deepEqual(Object.keys(speakers), roles, `${text}: участники разговора`);
    const [author, critic] = roles;
    for (const [who, speech] of Object.entries(speakers)) {
      assert.ok(speech.strong && speech.weak && speech.strong.length > speech.weak.length, `${text}/${who}: слабый тон короче`);
      const lines = [speech.strong, speech.weak, speech.challenge?.text, ...Object.values(speech.lobby ?? {})].filter(Boolean) as string[];
      for (const line of lines) {
        assert.doesNotMatch(line, /\{[^}]*\}|\d|%/u, `${text}/${who}: ${line}`);
        assert.match(line, SENTENCE, `${text}/${who}: ${line}`);
      }
    }
    assert.match(speakers[author].strong!, CONDITION, `${text}: автор называет условие`);
    assert.doesNotMatch(speakers[author].weak!, CONDITION, `${text}: слабый автор условие упускает`);
    assert.equal(speakers[critic].challenge?.after, author, `${text}: поправка обращена к автору`);
    assert.equal(speakers[author].challenge, undefined, `${text}: автор не поправляет сам себя`);
  }
});

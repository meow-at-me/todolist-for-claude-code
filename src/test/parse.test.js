'use strict';

// Tests for TodoStore.parse(). Runs against the compiled output in `out/`,
// stubbing the `vscode` module (parse() itself does not touch the VS Code API).
//
//   npm test   ->   tsc compile, then `node --test`

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Module = require('node:module');

// --- stub `vscode` so `require('../../out/TodoStore.js')` resolves ---
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'vscode') {
    return 'vscode-stub';
  }
  return origResolve.call(this, request, ...rest);
};
require.cache['vscode-stub'] = { id: 'vscode-stub', exports: {}, loaded: true };

const { TodoStore } = require(path.join(__dirname, '..', '..', 'out', 'TodoStore.js'));
const store = new TodoStore();

// [line, expectedText, expectedPriority, expectedCategory]
const cases = [
  // canonical forms (must keep working)
  ['- [ ] Read paper !high @research', 'Read paper', 'high', 'research'],
  ['- [x] Code review @dev', 'Code review', 'none', 'dev'],
  ['- [ ] workout', 'workout', 'none', undefined],
  ['- [ ] task !med @work', 'task', 'med', 'work'],
  ['- [ ] task !low', 'task', 'low', undefined],

  // reported failure: bracketed category
  ['- [ ] render-poster e2e regression [@build]', 'render-poster e2e regression', 'none', 'build'],
  ['- [ ] do it (@build)', 'do it', 'none', 'build'],

  // bracketed priority
  ['- [ ] urgent thing [!high] @build', 'urgent thing', 'high', 'build'],
  ['- [ ] urgent thing [!high] [@build]', 'urgent thing', 'high', 'build'],
  ['- [ ] thing (!hi)', 'thing', 'high', undefined],

  // priority synonyms / abbreviations
  ['- [ ] a !medium @x', 'a', 'med', 'x'],
  ['- [ ] b !mid', 'b', 'med', undefined],
  ['- [ ] c !m', 'c', 'med', undefined],
  ['- [ ] d !hi', 'd', 'high', undefined],
  ['- [ ] e !h', 'e', 'high', undefined],
  ['- [ ] f !lo', 'f', 'low', undefined],
  ['- [ ] g !l', 'g', 'low', undefined],
  ['- [ ] h ! high', 'h', 'high', undefined],

  // false-positive guards (must NOT match)
  ['- [ ] email ping foo@bar.com', 'email ping foo@bar.com', 'none', undefined],
  ['- [ ] do it now!', 'do it now!', 'none', undefined],
  ['- [ ] fix bug #42', 'fix bug #42', 'none', undefined],
  ['- [ ] say hello! to all', 'say hello! to all', 'none', undefined],
  ['- [ ] !however not a prio', '!however not a prio', 'none', undefined],

  // unicode (Korean) category
  ['- [ ] 회의 준비 !high [@회의]', '회의 준비', 'high', '회의'],
];

for (const [line, eText, ePrio, eCat] of cases) {
  test(`parse: ${line}`, () => {
    const [item] = store.parse(line);
    assert.ok(item, 'line should parse to one item');
    assert.strictEqual(item.text, eText, 'text');
    assert.strictEqual(item.priority, ePrio, 'priority');
    assert.strictEqual(item.category, eCat, 'category');
  });
}

test('messy line round-trips to canonical serialized form', () => {
  const [parsed] = store.parse('- [ ] render-poster regression [!high] [@build]');
  const serialized = store.serialize([parsed]);
  assert.match(serialized, /^- \[ \] render-poster regression !high @build$/m);
  // re-parsing the canonical form is stable
  const [reparsed] = store.parse(serialized.split('\n').find((l) => l.startsWith('- ')));
  assert.strictEqual(reparsed.priority, 'high');
  assert.strictEqual(reparsed.category, 'build');
});

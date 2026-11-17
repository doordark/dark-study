// Exercise actual list props/hooks. Native layout and touch still require device QA.
const assert = require('node:assert/strict');
let cursor = 0;
const slots = [], effects = [];
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
const slot = initial => { const index = cursor++; return slots[index] ?? (slots[index] = initial()); };
const react = {
  useMemo(fn, deps) { const s = slot(() => ({})); if (!same(s.deps, deps)) { s.value = fn(); s.deps = deps; } return s.value; },
  useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
  useRef(value) { return slot(() => ({ current: value })); },
  useEffect(fn, deps) { const s = slot(() => ({})); if (!same(s.deps, deps)) { s.deps = deps; effects.push(fn); } },
};
const jsx = (type, props) => ({ type, props });
const load = require('./load-project-ts.cjs')({ react, 'react-native': { FlatList: 'FlatList', View: 'View' }, 'react/jsx-runtime': { jsx, jsxs: jsx } });
const { ChatMessageList } = load('src/components/ChatMessageList.tsx');
const messages = Array.from({ length: 200 }, (_, i) => ({ id: String(i), role: i % 2 ? 'assistant' : 'user', text: `message ${i}` }));
const renderMessage = message => jsx('row', message);
let scrolls = 0, node;
function render(data) {
  cursor = 0;
  node = ChatMessageList({ messages: data, renderMessage, maxHeight: 120 });
  node.props.ref.current = { scrollToOffset: () => scrolls++ };
  effects.splice(0).forEach(fn => fn());
}
render(messages);
assert.equal(node.type, 'FlatList'); assert.equal(node.props.inverted, true);
assert.equal(node.props.data.length, 200); assert.equal(node.props.data[0].id, '199');
assert.equal(messages[0].id, '0', 'list ordering must not mutate persisted history');
assert(node.props.initialNumToRender < 200 && node.props.windowSize === 5);
node.props.onScroll({ nativeEvent: { contentOffset: { y: 400 } } });
const before = scrolls;
render([...messages, { id: '200', role: 'assistant', text: 'new reply' }]);
node.props.onContentSizeChange(); assert.equal(scrolls, before, 'incoming replies must not pull a history reader to the bottom');
render([...messages, { id: '201', role: 'user', text: 'my next question' }]);
assert(scrolls > before, 'sending a user message returns to the newest message');
const item = node.props.renderItem({ item: messages[0] });
assert.equal(item.props.children.props.id, '0', 'visible rows receive the correct message');
assert.equal(node.props.keyExtractor(messages[12]), '12');
console.log('PASS: actual compact list virtualizes 200 messages, preserves IDs/order, keeps history position and follows new user messages');

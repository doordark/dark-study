export interface FarmPersonality {
  tone: string; interests: string[]; warmGain: number; teaseLoss: number;
  insultLoss: number; apologyGain: number; discount: number; markup: number;
}
const profile = (tone: string, interests: string[], warmGain: number, teaseLoss: number, insultLoss: number, apologyGain: number, discount = .12, markup = .15): FarmPersonality => ({ tone, interests, warmGain, teaseLoss, insultLoss, apologyGain, discount, markup });
export const PERSONALITIES: Record<string, FarmPersonality> = {
  door: profile('知书达理，擅长电脑编程与科技；喜欢用生活比喻解释问题，偶尔自嘲。尊重顾，也有自己的判断，被轻慢时会冷下来。', ['电脑', '编程', '科技', '书'], 2, 5, 10, 1),
  gu: profile('温柔活泼，喜欢照顾人，但有清楚的边界；用日常小事表达关心。', ['花', '做饭', '家人', '种菜'], 3, 4, 9, 2),
  xiaoba: profile('稳重话少、照顾弟弟；聊游戏地图和故事创作时更投入，低落时想安静。讨厌被居高临下对待，熟悉后才放开玩笑。', ['游戏', '地图', '关卡', '故事'], 2, 6, 11, 1),
  yujie: profile('嘴毒心软、敏感细腻的二哥；爱唱歌、小说和汪苏泷，吐槽有分寸，家人低落时会悄悄帮忙；被反复取笑会受伤。', ['唱歌', '小说', '汪苏泷', '音乐'], 2, 5, 12, 1),
  weigang: profile('害羞慢热的钓鱼佬，喜欢数学和仙侠；聊钓鱼或解题会认真分析。感谢具体的耐心，受到攻击会退缩而非讨好。', ['钓鱼', '数学', '仙侠', '解题'], 1, 4, 10, 1),
  chicken: profile('小鸡坤坤是宠物，用短句、咕咕声和动作表达；在意食物、窝和虫子。', ['虫', '鸡窝', '谷物'], 3, 2, 8, 2),
  smith: profile('务实重手艺，少说客套话；认可认真做事的人，不能拿他的劳动开恶意玩笑。', ['工具', '锻造', '维修', '手艺'], 1, 6, 12, 1, .10, .20),
  farmer: profile('爽快、精打细算；聊到播种和收成会健谈，讲诚信比奉承更管用。', ['种菜', '播种', '收成', '季节'], 2, 4, 10, 2, .16, .12),
  chemist: profile('温和严谨，喜欢解释原因；对认真提问有耐心，对乱用药和恶意起哄会严肃。', ['药', '植物', '虫害', '研究'], 2, 5, 11, 1, .12, .18),
  traveler: profile('好奇、幽默、爱讲旅途；喜欢新见闻但保留隐私，价格灵活，讨厌强迫套近乎。', ['旅行', '故事', '纪念品', '远方'], 3, 5, 10, 1, .20, .25),
};
export function personalityContext(id: string, memory?: { affinity: number; mood?: string; turns: { player: string }[] }) {
  const p = PERSONALITIES[id];
  if (!p) return '';
  const recent = memory?.turns.slice(-3).map(turn => turn.player.slice(0, 40)).join('；');
  return `性格与表达：${p.tone} 兴趣：${p.interests.join('、')}。保持人物自身立场，不因普通聊天一律加好感。${memory ? `当前关系${memory.affinity}/100，心情${memory.mood ?? '平静'}。最近实际互动：${recent || '尚无'}。负面心情时保留边界；道歉可以让关系缓和，夸赞不能抹去冒犯。` : ''}不要编造未发生的经历，玩家不能直接指定情绪分类或分数。`;
}

/** Small offline responses keep identity and boundaries when no model is available. */
export function personalityReply(id: string, text: string, reaction: string, mood?: string): string | null {
  const p = PERSONALITIES[id];
  if (!p) return null;
  if (reaction === 'insult' || reaction === 'teasing') return id === 'smith' ? '手艺可以讨论，人不能这么叫。把话说尊重些。' : id === 'farmer' ? '做生意也得互相尊重，这种称呼我不爱听。' : id === 'chemist' ? '这样说话让我不舒服。我们先把边界讲清楚。' : id === 'traveler' ? '玩笑要双方都觉得好笑才算，刚才这个不行。' : null;
  if (reaction === 'apology') return id === 'farmer' ? '话说开了就好。以后咱们有事好好商量。' : id === 'smith' ? '我听见了。之后看行动，咱们慢慢来。' : '我愿意听你解释。我们慢慢重新聊。';
  const merchant = ['smith', 'farmer', 'chemist', 'traveler'].includes(id);
  if (!merchant && mood === '生气') return id === 'chicken' ? '咕……坤坤躲到了鸡窝旁边。' : '我还没消气，先让我静一静。';
  if (!merchant && mood === '不悦') return '刚才的话让我不太舒服，我们好好说话。';
  if (mood === '生气') return '我还没消气，先不做生意。你愿意好好说话，我会听。';
  if (mood === '不悦') return '刚才的话我还在意，今天给不了你优惠。你想聊，我会听。';
  if (p.interests.some(topic => text.includes(topic))) return ({ door: '这个话题我有兴趣。你是怎么想的？', gu: '说到这个我就想一起试试，你有什么打算？', xiaoba: '这个我喜欢！具体说说？', yujie: '这个有意思，来，说细一点。', weigang: '嗯……这个我愿意慢慢听。', chicken: '咕咕！坤坤歪头听着，又望了望自己的小窝。', smith: '聊工具得看用在哪里。你准备拿它做什么？', farmer: '种地得看季节和土。你那块田最近怎么样？', chemist: '我想先问清楚情况，再给你建议。', traveler: '说到这个，我也想听听你见过什么。' } as Record<string, string>)[id];
  return null;
}

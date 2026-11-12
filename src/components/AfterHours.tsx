import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { selectHaptic, successHaptic } from "@/utils/haptics";
import { makeSky, remainingRoute, SKY_ROUTES, turnSky } from "@/utils/afterHours";

export type AfterHoursKind = "platform" | "coffee" | "permission";

const STOPS = ["把晚风叫醒", "给月亮接电", "让明天慢一点"];
const FORTUNES = [
  "今日隐藏运气：刚好赶上。\n包括公交，也包括好事。",
  "知识正在缓慢溶解。\n建议配一块小饼干，耐心等候。",
  "你不是电量不足。\n你只是需要找个喜欢的插座。",
  "本杯不含内卷。\n含一点勇气，和很多很多奶泡。",
];

function SecretButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={s.button}>
    <Text style={s.buttonText}>{label}</Text>
  </Pressable>;
}

function Platform() {
  const [stage, setStage] = useState(0);
  const [board, setBoard] = useState(() => makeSky(0));
  const [route, setRoute] = useState<number[]>([...SKY_ROUTES[0]]);
  const [moves, setMoves] = useState(0);
  const [hint, setHint] = useState<number | null>(null);
  const [arrived, setArrived] = useState(false);
  const complete = board.every(Boolean);

  function turn(cell: number) {
    if (complete || arrived) return;
    const next = turnSky(board, cell);
    setBoard(next);
    setRoute(remainingRoute(route, cell));
    setMoves(moves + 1);
    setHint(null);
    if (next.every(Boolean)) successHaptic();
    else selectHaptic();
  }

  function nextStop() {
    if (stage === 2) { setArrived(true); return; }
    const next = stage + 1;
    setStage(next);
    setBoard(makeSky(next));
    setRoute([...SKY_ROUTES[next]]);
    setHint(null);
  }

  return <>
    <Text style={s.eyebrow}>THE EXTRA DAY · 08</Text>
    <Text style={s.title}>{arrived ? "欢迎来到星期八" : "末班星光列车"}</Text>
    <Text style={s.body}>{arrived ? "这里没有早八，没有截止日期。\n只有一整天，属于你自己。" : "课表以外，还有一班开往星期八的车。\n帮列车点亮三片星空，就能领到车票。"}</Text>
    <View style={s.stops}>
      {STOPS.map((stop, i) => <View key={stop} style={s.stop}>
        <Text style={[s.stopDot, (i < stage || arrived || (i === stage && complete)) && s.gold]}>●</Text>
        <Text style={s.stopText}>{stop}</Text>
      </View>)}
    </View>
    {arrived ? <View style={s.ticket}>
      <Text style={s.ticketLabel}>不定期休息专列 · 单程票</Text>
      <Text style={s.ticketTitle}>此刻 → 星期八</Text>
      <Text style={s.ticketBody}>乘客：认真生活的你\n座位：靠窗，能看见月亮\n行李额度：放下一点点焦虑</Text>
      <View style={s.ticketRule} />
      <Text style={s.ticketLabel}>全程 {moves} 次星光拨动 · 永久允许快乐</Text>
      <Text style={s.ticketBody}>列车长留言：\n「休息也是旅程的一部分。」</Text>
    </View> : <>
      <Text style={s.chapter}>0{stage + 1} / 03　{STOPS[stage]}</Text>
      <View style={s.board}>
        {board.map((lit, cell) => <Pressable key={cell}
          accessibilityRole="button" accessibilityLabel={`第${Math.floor(cell / 4) + 1}行第${cell % 4 + 1}列，${lit ? "亮" : "暗"}${hint === cell ? "，列车长提示" : ""}`}
          disabled={complete} onPress={() => turn(cell)}
          style={[s.cell, lit && s.cellLit, hint === cell && s.cellHint]}>
          <Text style={[s.star, lit && s.starLit]}>{hint === cell ? "✦" : lit ? "✧" : "·"}</Text>
        </Pressable>)}
      </View>
      <Text accessibilityLiveRegion="polite" style={s.caption}>{complete ? "星空接通了，列车可以出发了。" : "轻点一颗星，会翻转它和上下左右的光。\n让十六颗星同时亮起。"}</Text>
      {complete ? <SecretButton label={stage === 2 ? "领取星期八车票 →" : "驶向下一站 →"} onPress={nextStop} /> : <View style={s.controls}>
        <SecretButton label="列车长，借一点灵感" onPress={() => setHint(route[0] ?? null)} />
        <Pressable accessibilityRole="button" onPress={() => {
          setBoard(makeSky(stage)); setRoute([...SKY_ROUTES[stage]]); setHint(null);
        }} style={s.reset}><Text style={s.caption}>重整这片星空</Text></Pressable>
      </View>}
    </>}
  </>;
}

function Coffee() {
  const [stirs, setStirs] = useState(0);
  const [cup, setCup] = useState(0);
  return <>
    <Text style={s.eyebrow}>OFF THE SYLLABUS · CAFÉ</Text>
    <Text style={s.title}>云朵冲泡处</Text>
    <Text style={s.body}>本店只收一种货币：发一小会儿呆。</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="搅拌云朵咖啡" onPress={() => {
      if (stirs < 3) { setStirs(stirs + 1); selectHaptic(); }
    }} style={s.coffee}>
      <Text style={s.steam}>{stirs % 2 ? "﹏　﹏　﹏" : "　∿　∿　"}</Text>
      <View style={s.cup}><Text style={s.foam}>{stirs >= 3 ? "♡" : "☁"}</Text></View>
      <View style={s.saucer} />
    </Pressable>
    <Text accessibilityLiveRegion="polite" style={s.fortune}>{stirs >= 3 ? FORTUNES[cup % FORTUNES.length] : `搅拌三下，看看奶泡想说什么。\n${"● ".repeat(stirs)}${"○ ".repeat(3 - stirs)}`}</Text>
    {stirs >= 3 ? <SecretButton label="再续一杯云朵" onPress={() => { setCup(cup + 1); setStirs(0); }} /> : null}
  </>;
}

function Permission() {
  const [stamped, setStamped] = useState(false);
  return <>
    <Text style={s.eyebrow}>DEPARTMENT OF TAKING IT EASY</Text>
    <Text style={s.title}>一张特别的请假条</Text>
    <View style={s.paper}>
      <Text style={s.paperTitle}>致：脑内的焦虑主任</Text>
      <Text style={s.paperBody}>申请事项：暂停自我催促十分钟。\n\n申请理由：今天也有努力生活，\n需要一点不带目的的快乐。\n\n补课安排：先吃好饭，再说。\n\n申请人：我自己</Text>
      {stamped ? <View style={s.stamp}><Text style={s.stampText}>准予快乐\n即刻生效</Text></View> : null}
    </View>
    <Text accessibilityLiveRegion="polite" style={s.caption}>{stamped ? "已获你本人批准。\n这张条子不用交，放在心里就行。" : "本申请只需要一个人的批准。"}</Text>
    {!stamped ? <SecretButton label="我批准了 · 盖章" onPress={() => { setStamped(true); successHaptic(); }} /> : null}
  </>;
}

export function AfterHours({ kind, onClose }: { kind: AfterHoursKind; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
    <View style={[s.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <View style={s.panel}>
        <View style={s.closeBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="关闭，返回课表" onPress={onClose} style={s.close}>
            <Text style={s.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {kind === "platform" ? <Platform /> : kind === "coffee" ? <Coffee /> : <Permission />}
          <SecretButton label="收好这段奇遇，回课表" onPress={onClose} />
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(3,10,24,0.88)", justifyContent: "center", paddingHorizontal: 18 },
  panel: { width: "100%", maxWidth: 420, maxHeight: "100%", alignSelf: "center", borderRadius: 30, backgroundColor: "#101f35", borderWidth: 1, borderColor: "#34516b", overflow: "hidden" },
  closeBar: { alignItems: "flex-end", paddingRight: 8, paddingTop: 4 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  closeText: { color: "#b9cddd", fontSize: 28 },
  content: { paddingHorizontal: 24, paddingBottom: 24, gap: 18 },
  eyebrow: { color: "#90bbcc", fontSize: 10, letterSpacing: 1.5, textAlign: "center" },
  title: { color: "#f8edce", fontSize: 25, fontWeight: "800", textAlign: "center" },
  body: { color: "#b9cddd", fontSize: 13, lineHeight: 23, textAlign: "center" },
  stops: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  stop: { flex: 1, alignItems: "center", gap: 6 },
  stopDot: { color: "#425570", fontSize: 17 }, gold: { color: "#f7d48d" },
  stopText: { color: "#a5bdce", fontSize: 10, textAlign: "center" },
  chapter: { color: "#f7d48d", fontSize: 12, textAlign: "center" },
  board: { flexDirection: "row", flexWrap: "wrap", gap: "4%" },
  cell: { width: "22%", aspectRatio: 1, borderRadius: 14, marginBottom: "4%", backgroundColor: "#15283e", borderWidth: 1, borderColor: "#30455c", justifyContent: "center", alignItems: "center", minHeight: 44 },
  cellLit: { backgroundColor: "#374b59", borderColor: "#bca977" },
  cellHint: { borderColor: "#a7f3d0", borderWidth: 3 },
  star: { color: "#6a8097", fontSize: 30 }, starLit: { color: "#ffe3a2" },
  caption: { color: "#9bb4c9", fontSize: 12, lineHeight: 21, textAlign: "center" },
  button: { minHeight: 44, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13, backgroundColor: "#263e55", alignItems: "center", borderWidth: 1, borderColor: "#45617a" },
  buttonText: { color: "#e0edee", fontSize: 13, fontWeight: "600", textAlign: "center" },
  controls: { gap: 6 }, reset: { minHeight: 44, justifyContent: "center" },
  ticket: { backgroundColor: "#f3e7c9", borderRadius: 16, padding: 22, gap: 18 },
  ticketLabel: { color: "#766547", fontSize: 11 },
  ticketTitle: { color: "#263e55", fontSize: 25, fontWeight: "800" },
  ticketBody: { color: "#4d594e", fontSize: 13, lineHeight: 25 },
  ticketRule: { borderTopWidth: 1, borderColor: "#b6a789", borderStyle: "dashed" },
  coffee: { alignItems: "center", paddingVertical: 12 },
  steam: { color: "#a5bdce", fontSize: 28, height: 48 },
  cup: { width: 130, height: 104, borderTopLeftRadius: 15, borderTopRightRadius: 15, borderBottomLeftRadius: 48, borderBottomRightRadius: 48, backgroundColor: "#e3d5bb", borderTopWidth: 9, borderColor: "#ac8665", alignItems: "center", justifyContent: "center" },
  foam: { fontSize: 44, color: "#6d5543" },
  saucer: { width: 170, height: 12, backgroundColor: "#a9c2ce", borderRadius: 12, marginTop: 6 },
  fortune: { color: "#f3e7c9", fontSize: 15, lineHeight: 28, textAlign: "center", minHeight: 65 },
  paper: { backgroundColor: "#f3e7c9", padding: 22, borderRadius: 4, gap: 20 },
  paperTitle: { color: "#494c43", fontWeight: "700", fontSize: 15 },
  paperBody: { color: "#606052", fontSize: 13, lineHeight: 25 },
  stamp: { alignSelf: "flex-end", borderWidth: 3, borderColor: "#ac5147", borderRadius: 10, padding: 9, transform: [{ rotate: "-12deg" }] },
  stampText: { color: "#ac5147", fontSize: 17, lineHeight: 25, fontWeight: "800", textAlign: "center" },
});

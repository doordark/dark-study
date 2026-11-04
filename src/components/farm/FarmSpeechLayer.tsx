import { View } from 'react-native';
import { SCENE_SIZE } from '@/constants/farmMap';
import { RESIDENTS } from '@/utils/farmLife';
import type { ResidentModel } from '@/utils/farmResidentAI';
import { placeFarmSpeech, type SpeechRect } from '@/utils/farmResidentSpace';
import { FarmPaper, FarmText } from './FarmSkin';

/** Speech sits above all y-sorted sprites. Only the current speaker keeps a card. */
export function FarmSpeechLayer({ residents, scale }: { residents: ResidentModel[]; scale: number }) {
  const width = SCENE_SIZE.width * scale, height = SCENE_SIZE.height * scale;
  const used: SpeechRect[] = [];
  const cards = residents.filter(r => r.bubble).sort((a, b) => b.bubble!.until - a.bubble!.until);
  return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, zIndex: 1500 }}>
    {cards.slice(0, width < 340 ? 2 : 3).map(r => {
      const cardWidth = Math.min(width - 12, 204);
      const message = r.bubble!.text;
      const charactersPerLine = Math.floor((cardWidth - 30) / 13);
      const lines = message.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
      const cardHeight = 43 + lines * 19;
      const anchor = { x: r.logicalPosition.x * scale, y: (r.logicalPosition.y - 28) * scale };
      const rect = placeFarmSpeech(anchor, width, height, cardWidth, cardHeight, used);
      if (!rect) return null;
      used.push(rect);
      const partner = r.conversationPartner;
      const tailBelow = anchor.y >= rect.top + rect.height / 2;
      const tailLeft = Math.max(12, Math.min(cardWidth - 22, anchor.x - rect.left - 5));
      return <View key={r.id} style={{ position: 'absolute', ...rect, paddingHorizontal: 14, paddingTop: 8, backgroundColor: '#FCF1E6', borderWidth: 1, borderColor: '#AD8078', borderRadius: 3, shadowColor: '#59432E', shadowOpacity: .16, shadowOffset: { width: 0, height: 2 }, shadowRadius: 0 }}>
        <View style={{ position: 'absolute', left: tailLeft, ...(tailBelow ? { bottom: -5 } : { top: -5 }), width: 9, height: 9, backgroundColor: '#FCF1E6', borderWidth: 1, borderColor: '#AD8078', transform: [{ rotate: '45deg' }] }} />
        <FarmPaper theme="chat" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderBottomWidth: 1, borderBottomColor: '#DFC1B3', paddingBottom: 4, marginBottom: 4 }}>
          <View style={{ width: 5, height: 5, backgroundColor: '#AB6C79', transform: [{ rotate: '45deg' }] }} />
          <FarmText variant="label" numberOfLines={1} style={{ flex: 1, color: '#825064' }}>
            {RESIDENTS[r.id].name}{partner ? ` · 与${RESIDENTS[partner].name}闲聊` : ''}
          </FarmText>
        </View>
        <FarmText style={{ color: '#493A2C', fontSize: 13, lineHeight: 19 }}>{message}</FarmText>
      </View>;
    })}
  </View>;
}

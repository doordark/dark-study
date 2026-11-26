import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, View } from 'react-native';
import { playSfx } from '@/services/soundEffects';
import type { FarmRandomEventChoice, FarmRandomEventDef } from '@/utils/farmRandomEvents';
import { RESIDENTS } from '@/utils/farmLife';
import { FarmPersonSprite } from './FarmPersonSprite';
import { FarmButton, FarmSlotFrame, FarmText as Text } from './FarmSkin';

function rewardBadges(choice: FarmRandomEventChoice): string[] {
  const tags: string[] = [];
  if (choice.coins) tags.push(`+${choice.coins} 金币`);
  if (choice.compost) tags.push(`+${choice.compost} 有机肥`);
  if (choice.waterRefill) tags.push(`补水 +${choice.waterRefill}`);
  if (choice.growthBoostMinutes) tags.push(`作物加速 ${choice.growthBoostMinutes}分`);
  if (choice.affinityDelta) tags.push(`好感 +${choice.affinityDelta}`);
  if (choice.emotionDelta.joy && choice.emotionDelta.joy > 0) tags.push(`愉悦 +${choice.emotionDelta.joy}`);
  return tags;
}

export function FarmRandomEventModal({
  event,
  visible,
  onSelect,
  onDismiss,
}: {
  event: FarmRandomEventDef | null;
  visible: boolean;
  onSelect: (choice: FarmRandomEventChoice) => void;
  onDismiss: () => void;
}) {
  if (!event) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onDismiss}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(26, 20, 14, 0.62)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 18,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 400,
            borderRadius: 22,
            backgroundColor: '#FFF8EB',
            borderWidth: 2,
            borderColor: '#D6BC8D',
            padding: 16,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 9,
                paddingVertical: 3,
                borderRadius: 99,
                backgroundColor: '#F5E2B8',
                borderWidth: 1,
                borderColor: '#DFBF7E',
              }}
            >
              <Ionicons name="sparkles" size={12} color="#8E5E16" />
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#7D5112' }}>{event.badge}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="稍后处理" onPress={onDismiss} hitSlop={8}>
              <Ionicons name="close" size={20} color="#8E795E" />
            </Pressable>
          </View>

          <Text variant="title" style={{ fontSize: 17, fontWeight: '800', color: '#4E3B23' }}>
            {event.title}
          </Text>
          <Text style={{ fontSize: 13, lineHeight: 20, color: '#6E5A3E' }}>
            {event.summary}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {event.participants.slice(0, 4).map(pid => (
                <FarmSlotFrame key={pid} size={36} rarity={1}>
                  <FarmPersonSprite who={pid} emotionPose="happy" size={24} active centered />
                </FarmSlotFrame>
              ))}
            </View>
            <Text style={{ flex: 1, fontSize: 11, color: '#8A7557' }}>
              参与家人：{event.participants.map(id => RESIDENTS[id].name).join('、')}
            </Text>
          </View>

          <View style={{ gap: 8, marginTop: 2 }}>
            {event.choices.map(choice => {
              const tags = rewardBadges(choice);
              return (
                <Pressable
                  key={choice.id}
                  accessibilityRole="button"
                  onPress={() => {
                    playSfx('farm_gift', { volume: 0.68 });
                    onSelect(choice);
                  }}
                  style={{
                    paddingHorizontal: 13,
                    paddingVertical: 10,
                    borderRadius: 14,
                    backgroundColor:
                      choice.tone === 'amber'
                        ? '#F8E7C1'
                        : choice.tone === 'sage'
                          ? '#E5EFE0'
                          : '#F3EBD8',
                    borderWidth: 1,
                    borderColor:
                      choice.tone === 'amber'
                        ? '#DFB874'
                        : choice.tone === 'sage'
                          ? '#B9CFAF'
                          : '#D9C7A7',
                    gap: 4,
                  }}
                >
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#4B3923' }}>
                    {choice.label}
                  </Text>
                  <Text style={{ fontSize: 10.5, color: '#796348' }}>
                    {tags.join(' · ')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <FarmButton tone="paper" onPress={onDismiss}>
            <Text style={{ fontSize: 12, color: '#7D684E' }}>先逛逛，待会儿再参与</Text>
          </FarmButton>
        </View>
      </View>
    </Modal>
  );
}

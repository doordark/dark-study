import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AtlasSprite } from '@/components/AtlasSprite';
import { FarmText } from './FarmSkin';
export function FarmTabButton({ label, selected = false, disabled = false, onPress }: { label: string; selected?: boolean; disabled?: boolean; onPress: () => void }) {
  const [width, setWidth] = useState(100);
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ minWidth: 100, height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 }}>
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}><AtlasSprite source={require('../../../assets/images/farm-buttons-v7.png')} columns={2} rows={2} column={disabled || selected ? 1 : 0} row={disabled ? 1 : 0} width={width} height={44} /></View>
    <FarmText variant="label" style={{ color: disabled ? '#968976' : '#59432E' }}>{label}</FarmText>
  </Pressable>;
}

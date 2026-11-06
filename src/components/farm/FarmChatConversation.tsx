import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, type ComponentRef, type Ref } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { FARM_BODY_FONT, FarmText } from './FarmSkin';

export type FarmChatMessage = { id: string; role: 'user' | 'assistant'; text: string };
export function FarmChatConversation({ messages, busy, value, onChange, onSend, placeholder, maxHeight, hint, inputRef }: {
  messages: FarmChatMessage[]; busy: boolean; value: string; onChange: (value: string) => void;
  onSend: () => void; placeholder: string; maxHeight: number; hint?: string;
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
}) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  return <>
    <ScrollView ref={scroll} style={{ maxHeight, flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 10, gap: 8 }} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
      {messages.map(message => <View key={message.id} style={{ alignItems: message.role === 'user' ? 'flex-end' : 'flex-start' }}>
        <View style={{ maxWidth: '84%', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: message.role === 'user' ? '#E2E8CC' : '#F5E7DB' }}>
          <FarmText style={{ color: message.role === 'user' ? '#435532' : '#59432E', fontSize: 13, lineHeight: 20 }}>{message.text}</FarmText>
        </View>
      </View>)}
      {busy ? <View style={{ alignItems: 'flex-start' }}><View style={{ borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#F2E7CF' }}><FarmText style={{ color: '#8A785E', fontSize: 12 }}>正在想…</FarmText></View></View> : null}
    </ScrollView>
    {hint ? <FarmText style={{ paddingHorizontal: 14, color: '#8A785E', fontSize: 9.5 }}>{hint}</FarmText> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 6, marginBottom: 10, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 24, backgroundColor: '#F2E7DA' }}>
      <TextInput ref={inputRef} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#9A896C" style={{ fontFamily: FARM_BODY_FONT, flex: 1, height: 44, minWidth: 0, paddingHorizontal: 10, color: '#59432E', fontSize: 13 }} maxLength={200} returnKeyType="send" editable={!busy} onSubmitEditing={onSend} />
      <Pressable accessibilityLabel="发送消息" onPress={onSend} disabled={!value.trim() || busy} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: !value.trim() || busy ? '#DCE3CB' : '#A4B887' }}><Ionicons name="arrow-up" size={18} color="#435532" /></Pressable>
    </View>
  </>;
}

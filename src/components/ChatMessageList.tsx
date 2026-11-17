import { useCallback, useEffect, useMemo, useRef, type ReactElement } from 'react';
import { FlatList, View, type StyleProp, type ViewStyle } from 'react-native';
const messageKey = (message: { id: string }) => message.id;
/** Shared history behavior for the compact farm and pet chat surfaces. */
export function ChatMessageList<T extends { id: string; role: 'user' | 'assistant' }>({ messages, renderMessage, maxHeight, style, header }: {
  messages: T[]; renderMessage: (message: T) => ReactElement; maxHeight: number;
  style?: StyleProp<ViewStyle>; header?: ReactElement | null;
}) {
  const data = useMemo(() => messages.slice().reverse(), [messages]);
  const list = useRef<FlatList<T>>(null);
  const follow = useRef(true);
  const latest = messages.at(-1);
  useEffect(() => {
    if (latest?.role === 'user') {
      follow.current = true;
      list.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [latest?.id, latest?.role]);
  const renderItem = useCallback(({ item }: { item: T }) => <View style={{ marginBottom: 8 }}>{renderMessage(item)}</View>, [renderMessage]);
  return <FlatList ref={list} data={data} inverted keyExtractor={messageKey} renderItem={renderItem}
    style={[{ maxHeight, flexGrow: 0, flexShrink: 1 }, style]}
    contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 8 }}
    initialNumToRender={8} maxToRenderPerBatch={6} windowSize={5} removeClippedSubviews={false}
    keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
    ListHeaderComponent={header ?? undefined}
    onScroll={event => { follow.current = event.nativeEvent.contentOffset.y < 80; }} scrollEventThrottle={100}
    onContentSizeChange={() => { if (follow.current) list.current?.scrollToOffset({ offset: 0, animated: false }); }} />;
}

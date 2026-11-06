import { useCallback, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Keyboard, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Measure the modal itself so adjustResize and overlay keyboards never double-shift it. */
export function FarmNPCSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const host = useRef<ComponentRef<typeof View>>(null);
  const [frame, setFrame] = useState({ height: 800, bottom: 800 });
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const measure = useCallback(() => host.current?.measureInWindow((_x, y, _width, height) => setFrame(previous => previous.height === height && previous.bottom === y + height ? previous : { height, bottom: y + height })), []);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', event => {
      setKeyboardTop(event.endCoordinates.screenY); measure();
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => { setKeyboardTop(null); measure(); });
    return () => { show.remove(); hide.remove(); };
  }, [measure]);
  const overlap = keyboardTop === null ? 0 : Math.max(0, frame.bottom - keyboardTop);
  const close = () => { Keyboard.dismiss(); onClose(); };
  return <Modal visible={visible} transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={close}>
    <View ref={host} onLayout={measure} style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable accessibilityLabel="关闭人物面板" onPress={close} style={{ position: 'absolute', inset: 0, backgroundColor: '#241B1766' }} />
      <View style={{ marginBottom: overlap, maxHeight: Math.max(120, frame.height - overlap - insets.top - 8), flexShrink: 1, backgroundColor: '#F5EDD8', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', paddingBottom: keyboardTop === null ? insets.bottom : 4 }}>
        <View style={{ alignSelf: 'center', width: 32, height: 4, marginTop: 8, marginBottom: 4, borderRadius: 2, backgroundColor: '#D5C3A7' }} />
        {children}
      </View>
    </View>
  </Modal>;
}

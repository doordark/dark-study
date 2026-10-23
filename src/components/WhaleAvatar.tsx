import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/** 大肥鱼 Q 版立绘（由三视图裁切而来，透明底） */
const CHIBI = require("../../assets/character/chibi-happy.png");

/** 蓝色大肥鱼：Q 版小鲸鱼娘，会轻轻呼吸、微微晃脑袋 */
export function WhaleAvatar({ size = 40 }: { size?: number }) {
  const bob = useSharedValue(0);

  useEffect(() => {
    bob.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [bob]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -1.5 + bob.value * 3 },
      { rotate: `${(bob.value - 0.5) * 5}deg` },
    ],
  }));

  return (
    <Animated.Image
      source={CHIBI}
      resizeMode="contain"
      style={[{ width: size, height: size }, style]}
    />
  );
}

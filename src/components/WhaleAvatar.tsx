import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/** 大肥鱼头像：从整身贴图裁出的脸部特写，小尺寸也能看清表情 */
const AVATAR = require("../../assets/whale/avatar.png");

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
      { translateY: -1 + bob.value * 2 },
      { rotate: `${(bob.value - 0.5) * 3.5}deg` },
    ],
  }));

  return (
    <Animated.Image
      source={AVATAR}
      resizeMode="cover"
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}

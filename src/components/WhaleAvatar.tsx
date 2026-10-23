import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Ellipse, Path } from "react-native-svg";

/** 蓝色大肥鱼：蓝发鲸鱼娘的小头像，会轻轻呼吸、微微摆尾 */
export function WhaleAvatar({ size = 40 }: { size?: number }) {
  const bob = useSharedValue(0);

  useEffect(() => {
    bob.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [bob]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -1.5 + bob.value * 3 },
      { rotate: `${(bob.value - 0.5) * 4}deg` },
    ],
  }));

  return (
    <Animated.View style={style}>
      <Svg width={size} height={(size * 48) / 64} viewBox="0 0 64 48">
        {/* 水花 */}
        <Circle cx="21" cy="7" r="1.6" fill="#BFDBFE" opacity="0.8" />
        <Circle cx="25" cy="4" r="1.1" fill="#DBEAFE" opacity="0.7" />
        {/* 尾巴 */}
        <Path d="M48 22 L62 12 L58 25 L62 38 L48 30 Z" fill="#3B82F6" />
        {/* 身体 */}
        <Ellipse cx="28" cy="30" rx="22" ry="14" fill="#60A5FA" />
        {/* 头顶高光 */}
        <Ellipse cx="27" cy="25" rx="17" ry="7" fill="#93C5FD" opacity="0.55" />
        {/* 肚子 */}
        <Ellipse cx="27" cy="35" rx="16" ry="7" fill="#EFF6FF" opacity="0.9" />
        {/* 侧鳍 */}
        <Ellipse cx="33" cy="38" rx="6" ry="2.2" fill="#93C5FD" opacity="0.9" />
        {/* 眼睛 */}
        <Circle cx="15" cy="27" r="3.2" fill="#0F172A" />
        <Circle cx="16" cy="26" r="1" fill="#FFFFFF" />
        {/* 腮红 */}
        <Ellipse cx="9.5" cy="32" rx="3" ry="1.6" fill="#F9A8D4" opacity="0.8" />
        {/* 嘴 */}
        <Path
          d="M11 33.5 Q14.5 36 18 33.5"
          stroke="#1E3A8A"
          strokeWidth="1.1"
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

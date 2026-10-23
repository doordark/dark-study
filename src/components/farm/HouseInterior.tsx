import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface HouseInteriorProps {
  visible: boolean;
  night: boolean;
  day: number;
  clock: string;
  onClose: () => void;
  onSleep: () => void;
}

/**
 * 小屋内部：农场里点房子进来。
 * 屋子没有「睡觉」按钮，直接点床铺就睡到第二天早上 7 点。
 */
export function HouseInterior({
  visible,
  night,
  day,
  clock,
  onClose,
  onSleep,
}: HouseInteriorProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [sleeping, setSleeping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const roomW = Math.min(width - 32, 400);
  const roomH = Math.min(roomW * 0.8, height * 0.58);

  const wall = night ? "#2B2438" : "#EFD2A6";
  const wallLow = night ? "#3A2F4C" : "#DFB282";
  const floor = night ? "#4A3327" : "#B98055";
  const seam = night ? "#5A4033" : "#A57047";
  const hint = night ? "rgba(246,238,220,0.55)" : "rgba(63,38,49,0.5)";

  const handleBed = () => {
    if (sleeping) return;
    setSleeping(true);
    timer.current = setTimeout(() => {
      setSleeping(false);
      onSleep();
    }, 1200);
  };

  const handleClose = () => {
    if (sleeping) return;
    onClose();
  };

  const bedW = roomW * 0.44;
  const bedH = roomH * 0.24;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <StatusBar style="light" />
      <View
        style={{
          flex: 1,
          backgroundColor: night ? "#0B1020" : "#16261A",
          paddingTop: insets.top,
        }}
      >
        {/* 顶部 */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 4,
          }}
        >
          <Pressable
            onPress={handleClose}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(246,238,220,0.08)",
              borderWidth: 1,
              borderColor: "rgba(246,238,220,0.12)",
            }}
          >
            <Ionicons name="chevron-back" size={18} color="#F6EEDC" />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text
              style={{
                color: "#F6EEDC",
                fontSize: 15,
                fontWeight: "800",
                letterSpacing: 1.2,
              }}
            >
              door &amp; 顾的小屋
            </Text>
            <Text
              style={{
                color: "rgba(246,238,220,0.45)",
                fontSize: 10,
                marginTop: 2,
              }}
            >
              {`第 ${day} 天 · ${clock} · ${night ? "夜色正浓" : "阳光正好"}`}
            </Text>
          </View>
        </View>

        {/* 房间 */}
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 16,
          }}
        >
          <Animated.View entering={FadeInDown.springify()}>
            <View
              style={{
                width: roomW,
                height: roomH,
                borderRadius: 26,
                overflow: "hidden",
                backgroundColor: wall,
                borderWidth: 1,
                borderColor: "rgba(246,238,220,0.14)",
              }}
            >
              {/* 墙裙 + 地板 */}
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: roomH * 0.3,
                  height: roomH * 0.16,
                  backgroundColor: wallLow,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: roomH * 0.3,
                  backgroundColor: floor,
                }}
              />
              {[0.075, 0.15, 0.225].map((t) => (
                <View
                  key={t}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: roomH * t,
                    height: 1,
                    backgroundColor: seam,
                    opacity: 0.6,
                  }}
                />
              ))}

              {/* 窗：外面就是农场的天色 */}
              <View
                style={{
                  position: "absolute",
                  left: roomW * 0.07,
                  top: roomH * 0.09,
                  width: roomW * 0.3,
                  height: roomH * 0.31,
                  borderRadius: 12,
                  backgroundColor: "#7A4A34",
                  padding: 4,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    borderRadius: 8,
                    overflow: "hidden",
                    backgroundColor: night ? "#0E1630" : "#96D4F6",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {night ? (
                    <>
                      <View
                        style={{
                          width: roomW * 0.07,
                          height: roomW * 0.07,
                          borderRadius: roomW,
                          backgroundColor: "#F7E7B0",
                        }}
                      />
                      <View
                        style={{
                          position: "absolute",
                          left: 8,
                          top: 10,
                          width: 2,
                          height: 2,
                          borderRadius: 2,
                          backgroundColor: "#FFFFFF",
                          opacity: 0.8,
                        }}
                      />
                      <View
                        style={{
                          position: "absolute",
                          right: 12,
                          top: 24,
                          width: 1.5,
                          height: 1.5,
                          borderRadius: 2,
                          backgroundColor: "#FFFFFF",
                          opacity: 0.6,
                        }}
                      />
                    </>
                  ) : (
                    <View
                      style={{
                        width: roomW * 0.075,
                        height: roomW * 0.075,
                        borderRadius: roomW,
                        backgroundColor: "#FFE58A",
                      }}
                    />
                  )}
                  {/* 窗棂 */}
                  <View
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: "50%",
                      height: 3,
                      backgroundColor: "#7A4A34",
                    }}
                  />
                  <View
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: "50%",
                      width: 3,
                      backgroundColor: "#7A4A34",
                    }}
                  />
                </View>
              </View>

              {/* 墙上的小画 */}
              <View
                style={{
                  position: "absolute",
                  left: roomW * 0.45,
                  top: roomH * 0.1,
                  width: roomW * 0.14,
                  height: roomH * 0.15,
                  borderRadius: 8,
                  borderWidth: 3,
                  borderColor: "#8B5A3C",
                  backgroundColor: night ? "#3A3350" : "#F8EBD0",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="heart" size={13} color="#E87A94" />
              </View>

              {/* 小桌和台灯 */}
              <View
                style={{
                  position: "absolute",
                  left: roomW * 0.42,
                  bottom: roomH * 0.27,
                  width: roomW * 0.13,
                  height: roomH * 0.09,
                  borderRadius: 6,
                  backgroundColor: "#8B5A3C",
                }}
              />
              <View
                style={{
                  position: "absolute",
                  left: roomW * 0.462,
                  bottom: roomH * 0.345,
                  width: roomW * 0.04,
                  height: roomW * 0.035,
                  borderRadius: 4,
                  backgroundColor: night ? "#F5C466" : "#E8C87A",
                }}
              />
              {night ? (
                <View
                  style={{
                    position: "absolute",
                    left: roomW * 0.4,
                    bottom: roomH * 0.29,
                    width: roomW * 0.17,
                    height: roomH * 0.13,
                    borderRadius: 999,
                    backgroundColor: "rgba(245,196,102,0.14)",
                  }}
                />
              ) : null}

              {/* 地毯 */}
              <View
                style={{
                  position: "absolute",
                  left: roomW * 0.08,
                  bottom: roomH * 0.045,
                  width: roomW * 0.34,
                  height: roomH * 0.13,
                  borderRadius: 999,
                  backgroundColor: night ? "#5E4470" : "#C9744E",
                  opacity: 0.85,
                }}
              />

              {/* 床：点它睡觉 */}
              <Pressable
                onPress={handleBed}
                accessibilityRole="button"
                accessibilityLabel="床铺，睡觉"
                style={{
                  position: "absolute",
                  right: roomW * 0.05,
                  bottom: roomH * 0.055,
                  width: bedW,
                  height: bedH,
                }}
              >
                {/* 床头板 */}
                <View
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: bedW * 0.16,
                    height: bedH,
                    borderRadius: 6,
                    backgroundColor: "#7A4A34",
                  }}
                />
                {/* 床垫 */}
                <View
                  style={{
                    position: "absolute",
                    left: bedW * 0.1,
                    top: bedH * 0.18,
                    right: 0,
                    bottom: bedH * 0.08,
                    borderRadius: 8,
                    backgroundColor: "#EDE4CE",
                  }}
                />
                {/* 被子 */}
                <View
                  style={{
                    position: "absolute",
                    right: 0,
                    top: bedH * 0.3,
                    width: bedW * 0.72,
                    height: bedH * 0.6,
                    borderRadius: 8,
                    backgroundColor: night ? "#3F5B4E" : "#6FA85E",
                  }}
                />
                {/* 枕头 */}
                <View
                  style={{
                    position: "absolute",
                    left: bedW * 0.17,
                    top: bedH * 0.14,
                    width: bedW * 0.24,
                    height: bedH * 0.28,
                    borderRadius: 6,
                    backgroundColor: "#FFFDF6",
                  }}
                />
              </Pressable>

              {/* 床铺提示 */}
              <View
                style={{
                  position: "absolute",
                  right: roomW * 0.06,
                  bottom: roomH * 0.33,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Ionicons name="moon" size={10} color={hint} />
                <Text
                  style={{
                    marginLeft: 4,
                    color: hint,
                    fontSize: 9.5,
                    fontWeight: "700",
                  }}
                >
                  轻点床铺睡觉
                </Text>
              </View>
            </View>
          </Animated.View>
        </View>

        <Text
          style={{
            paddingBottom: insets.bottom + 12,
            textAlign: "center",
            color: "rgba(246,238,220,0.35)",
            fontSize: 10,
          }}
        >
          睡到第二天早上 7:00，作物会趁夜里长一截
        </Text>

        {sleeping ? (
          <Animated.View
            entering={FadeIn.duration(240)}
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: "rgba(6,10,22,0.94)",
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Ionicons name="moon" size={34} color="#F5C466" />
            <Text
              style={{
                marginTop: 14,
                color: "#F6EEDC",
                fontSize: 17,
                fontWeight: "800",
                letterSpacing: 5,
              }}
            >
              Z z z …
            </Text>
            <Text
              style={{
                marginTop: 10,
                color: "rgba(246,238,220,0.5)",
                fontSize: 11,
              }}
            >
              睡到明天早上 7:00
            </Text>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

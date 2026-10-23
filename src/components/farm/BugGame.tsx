import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { BUG_PALETTE, BUG_ROWS, PixelSprite, PROP_ART } from "./sprites";

export interface BugGameProps {
  visible: boolean;
  onClose: () => void;
  /** 结算：抓到几只虫 + 这次游戏折合多少农场时间 */
  onFinish: (score: number, jumpMs: number) => void;
}

const GAME_MS = 20_000;
const SPAWN_MS = 620;
const BUG_LIFE = 1450;
const MINUTE = 60_000;

interface Bug {
  id: number;
  x: number;
  y: number;
}

/**
 * 抓虫小游戏：消磨 20 秒，顺手帮顾把菜叶上的虫子抓掉。
 * 抓到的虫越多，游戏结束折算的农场时间越长，作物也跟着长一截。
 */
export function BugGame({ visible, onClose, onFinish }: BugGameProps) {
  const { width, height } = useWindowDimensions();
  const [phase, setPhase] = useState<"playing" | "result">("playing");
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(GAME_MS);
  const [bugs, setBugs] = useState<Bug[]>([]);
  const [round, setRound] = useState(0);
  const [claimed, setClaimed] = useState(false);

  const idRef = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!visible) return;

    const started = Date.now();
    let spawn: ReturnType<typeof setInterval> | null = null;

    const tick = setInterval(() => {
      const elapsed = Date.now() - started;
      setLeft(Math.max(0, GAME_MS - elapsed));
      if (elapsed >= GAME_MS) {
        clearInterval(tick);
        if (spawn) clearInterval(spawn);
        setBugs([]);
        setPhase("result");
      }
    }, 200);

    spawn = setInterval(() => {
      idRef.current += 1;
      const bug: Bug = {
        id: idRef.current,
        x: 6 + Math.random() * 80,
        y: 8 + Math.random() * 66,
      };
      setBugs((prev) => [...prev.slice(-4), bug]);
      const timer = setTimeout(() => {
        setBugs((prev) => prev.filter((b) => b.id !== bug.id));
      }, BUG_LIFE);
      timers.current.push(timer);
    }, SPAWN_MS);

    return () => {
      clearInterval(tick);
      if (spawn) clearInterval(spawn);
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [visible, round]);

  const catchBug = (id: number) => {
    if (phase !== "playing") return;
    setScore((s) => s + 1);
    setBugs((prev) => prev.filter((b) => b.id !== id));
  };

  const restart = () => {
    setScore(0);
    setLeft(GAME_MS);
    setBugs([]);
    setClaimed(false);
    setPhase("playing");
    setRound((r) => r + 1);
  };

  const jumpMs = MINUTE + score * 30_000;
  const areaH = Math.max(200, Math.min(320, Math.round(height * 0.4)));
  const areaW = Math.min(width - 56, 360);

  const claim = () => {
    if (claimed) return;
    setClaimed(true);
    onFinish(score, jumpMs);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(6,12,8,0.76)",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <Animated.View
          entering={FadeInDown.springify()}
          style={{
            width: areaW + 24,
            borderRadius: 24,
            backgroundColor: "#16261A",
            borderWidth: 1,
            borderColor: "rgba(246,238,220,0.12)",
            overflow: "hidden",
          }}
        >
          {/* 顶部 */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: "#F6EEDC",
                  fontSize: 14.5,
                  fontWeight: "800",
                  letterSpacing: 1,
                }}
              >
                抓虫
              </Text>
              <Text
                style={{
                  color: "rgba(246,238,220,0.42)",
                  fontSize: 9.5,
                  marginTop: 2,
                }}
              >
                帮顾把菜叶上的虫子抓掉，抓得越多时间过得越久
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={18} color="#8FA08F" />
            </Pressable>
          </View>

          {/* 数据 */}
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              paddingHorizontal: 14,
              paddingBottom: 10,
            }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                borderRadius: 12,
                paddingHorizontal: 10,
                paddingVertical: 7,
                backgroundColor: "rgba(246,238,220,0.05)",
                borderWidth: 1,
                borderColor: "rgba(246,238,220,0.08)",
              }}
            >
              <Ionicons name="bug" size={13} color="#8FD14F" />
              <Text
                style={{
                  marginLeft: 6,
                  color: "#E6DCC7",
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                {`抓到 ${score} 只`}
              </Text>
            </View>
            <View
              style={{
                width: 88,
                alignItems: "flex-end",
                justifyContent: "center",
                borderRadius: 12,
                paddingHorizontal: 10,
                paddingVertical: 7,
                backgroundColor: "rgba(245,196,102,0.1)",
                borderWidth: 1,
                borderColor: "rgba(245,196,102,0.24)",
              }}
            >
              <Text
                style={{
                  color: "#F5C466",
                  fontSize: 12,
                  fontWeight: "800",
                }}
              >
                {`${(left / 1000).toFixed(1)}s`}
              </Text>
            </View>
          </View>

          {phase === "playing" ? (
            <>
              {/* 菜地 */}
              <View
                style={{
                  marginHorizontal: 12,
                  height: areaH,
                  borderRadius: 16,
                  overflow: "hidden",
                  backgroundColor: "#4C8A3F",
                }}
              >
                {[0.34, 0.6, 0.86].map((t) => (
                  <View
                    key={t}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: `${t * 100}%`,
                      height: 1,
                      backgroundColor: "#3F7A34",
                    }}
                  />
                ))}

                {/* 地里的菜 */}
                {[
                  { left: "8%", top: "72%" },
                  { left: "46%", top: "78%" },
                  { left: "78%", top: "70%" },
                  { left: "26%", top: "88%" },
                  { left: "64%", top: "90%" },
                ].map((spot) => (
                  <View
                    key={`${spot.left}-${spot.top}`}
                    pointerEvents="none"
                    style={{ position: "absolute", left: spot.left, top: spot.top }}
                  >
                    <PixelSprite
                      rows={PROP_ART.cabbage.rows}
                      palette={PROP_ART.cabbage.palette}
                      pixel={2}
                    />
                  </View>
                ))}

                {/* 虫子 */}
                {bugs.map((bug) => (
                  <Animated.View
                    key={bug.id}
                    entering={FadeIn.duration(110)}
                    style={{
                      position: "absolute",
                      left: `${bug.x}%`,
                      top: `${bug.y}%`,
                      zIndex: 3,
                    }}
                  >
                    <Pressable
                      onPress={() => catchBug(bug.id)}
                      hitSlop={10}
                      style={{ padding: 6 }}
                    >
                      <PixelSprite
                        rows={BUG_ROWS}
                        palette={BUG_PALETTE}
                        pixel={3}
                      />
                    </Pressable>
                  </Animated.View>
                ))}
              </View>

              <Text
                style={{
                  paddingVertical: 10,
                  textAlign: "center",
                  color: "rgba(246,238,220,0.35)",
                  fontSize: 9.5,
                }}
              >
                点在虫子上就行，别踩到菜
              </Text>
            </>
          ) : (
            <Animated.View
              entering={FadeIn.duration(220)}
              style={{ paddingHorizontal: 18, paddingBottom: 18 }}
            >
              <View
                style={{
                  alignItems: "center",
                  paddingVertical: 14,
                }}
              >
                <Ionicons name="checkmark-circle" size={30} color="#8FD14F" />
                <Text
                  style={{
                    marginTop: 8,
                    color: "#F6EEDC",
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  {`抓到 ${score} 只虫`}
                </Text>
                <Text
                  style={{
                    marginTop: 5,
                    color: "rgba(246,238,220,0.55)",
                    fontSize: 10.5,
                    textAlign: "center",
                  }}
                >
                  {`农场时间前进 ${Math.max(1, Math.round(jumpMs / MINUTE))} 分钟，作物趁这段时间长了一截`}
                </Text>
                {score > 0 ? (
                  <Text
                    style={{
                      marginTop: 4,
                      color: "#F5C466",
                      fontSize: 10,
                      fontWeight: "700",
                    }}
                  >
                    {`金币 +${Math.floor(score / 2)}`}
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={restart}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 10,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(246,238,220,0.14)",
                    backgroundColor: "rgba(246,238,220,0.05)",
                  }}
                >
                  <Text
                    style={{
                      color: "rgba(246,238,220,0.7)",
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    再玩一次
                  </Text>
                </Pressable>
                <Pressable
                  onPress={claim}
                  style={{
                    flex: 1.2,
                    alignItems: "center",
                    paddingVertical: 10,
                    borderRadius: 14,
                    backgroundColor: "#8FD14F",
                  }}
                >
                  <Text
                    style={{
                      color: "#152A12",
                      fontSize: 12,
                      fontWeight: "800",
                    }}
                  >
                    收下奖励
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

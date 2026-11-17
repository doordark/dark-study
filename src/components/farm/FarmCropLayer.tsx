import { memo } from "react";
import { Pressable, View } from "react-native";
import Svg, { G, Rect } from "react-native-svg";
import { useForegroundClock } from "@/hooks/useForegroundClock";
import { PLOTS, SCENE_SIZE } from "@/constants/farmMap";
import { CROP_META } from "@/utils/farmEconomy";
import { farmPlotGrowth as plotGrowth } from "@/utils/farmWatering";
import { pestAt } from "@/utils/farmMarket";
import { plotStage, isWet, type PlotState } from "@/utils/farmPlot";
import { CropSprite, FarmToolSprite } from "./CropSprite";
import { FarmText as Text } from "./FarmSkin";
const VIEW_W = SCENE_SIZE.width, VIEW_H = SCENE_SIZE.height;
const plotPos = (index: number) => PLOTS[index];

export const FarmCropLayer = memo(function FarmCropLayer({ plots, scale, timeShift, active, onBug }: {
  plots: PlotState[]; scale: number; timeShift: number; active: boolean; onBug: (index: number) => void;
}) {
  const vNow = useForegroundClock(3000, active).getTime() + timeShift;
  const sceneW = VIEW_W * scale, sceneH = VIEW_H * scale;
  const grown = plots.map(plot => plotGrowth(plot, vNow));
  return <>
    <Svg
      pointerEvents="none"
      width={sceneW}
      height={sceneH}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      style={{ position: "absolute", left: 0, top: 0 }}
    >
      {/* 田地：土壤已烘焙进背景，这里画作物、成长进度与浇水状态 */}
      {plots.map((p, i) => {
        const pos = plotPos(i);
        const stage = plotStage(p, vNow);
        const wet = isWet(p, vNow);
        return (
          <G key={i}>
            {wet ? (
              <Rect
                x={pos.x}
                y={pos.y}
                width={pos.w}
                height={pos.h}
                fill="#241209"
                opacity="0.32"
              />
            ) : null}

            {wet ? (
              <Rect
                x={pos.x + pos.w - 3.2}
                y={pos.y + 0.8}
                width="1.6"
                height="2.6"
                fill="#557F98"
                opacity="0.9"
              />
            ) : null}
            {stage >= 2 ? (
              <>
                <Rect
                  x={pos.x + 15}
                  y={pos.y + 3}
                  width="1"
                  height="1"
                  fill="#FFF6C9"
                />
                <Rect
                  x={pos.x + 3}
                  y={pos.y + 6}
                  width="1"
                  height="1"
                  fill="#FFF6C9"
                  opacity="0.8"
                />
              </>
            ) : null}
          </G>
        );
      })}
    </Svg>

    {plots.map((p, i) => {
      if (!p.crop) return null;
      const pos = plotPos(i);
      return (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: (pos.x + (pos.w - 14.5) / 2) * scale,
            top: (pos.y - 3) * scale,
            width: 14.5 * scale,
            alignItems: "center",
            zIndex: Math.round(pos.y + pos.h),
          }}
        >
          <CropSprite
            kind={p.crop}
            stage={plotStage(p, vNow)}
            size={14.5 * scale}
          />
          {p.fertilized ? (
            <Text
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                color: "#FFF4A6",
                fontSize: 7 * scale,
              }}
            >
              ✦
            </Text>
          ) : null}
        </View>
      );
    })}

    {plots.map((plot, i) => {
      if (
        !plot.crop ||
        !plot.pestProne ||
        !pestAt(grown[i], CROP_META[plot.crop].growMs, plot.pestCleared)
      )
        return null;
      const pos = plotPos(i);
      return (
        <Pressable
          key={"pest-" + i}
          accessibilityRole="button"
          accessibilityLabel={"第 " + (i + 1) + " 块地抓虫"}
          onPress={() => onBug(i)}
          style={{
            position: "absolute",
            left: (pos.x + pos.w / 2) * scale - 12,
            top: pos.y * scale - 18,
            zIndex: 220,
            backgroundColor: "#FFF3DE",
            borderRadius: 12,
            padding: 3,
            borderWidth: 1,
            borderColor: "#D4A579",
          }}
        >
          <FarmToolSprite kind="bug" size={18} />
        </Pressable>
      );
    })}

  </>;
});

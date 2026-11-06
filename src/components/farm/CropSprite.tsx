import { Image, View, type ImageSourcePropType } from "react-native";
import { CLASSIC_FRAMES, NEW_FRAMES } from "./cropFrames";
import { AtlasSprite } from "@/components/AtlasSprite";
import { type CropKind } from "@/utils/farmEconomy";

const NEW_CROPS = require("../../../assets/images/farm-new-crops-stages-v6.png");
const CROPS = require("../../../assets/images/farm-classic-crops-stages-v7.png");
const TOOLS = require("../../../assets/images/farm-tools.png");
const ROW: Partial<Record<CropKind, number>> = {
  radish: 0, wheat: 1, carrot: 2, berry: 3, tomato: 4,
  corn: 5, pumpkin: 6, grape: 7, star: 8,
};

export function CropSprite({ kind, stage = 2, size }: { kind: CropKind; stage?: number; size: number }) {
  const column = Number.isFinite(stage) ? Math.min(2, Math.max(0, Math.trunc(stage))) : 2;
  const classic = ROW[kind] !== undefined;
  const atlas = classic ? CLASSIC_FRAMES : NEW_FRAMES;
  const row = classic ? ROW[kind]! : kind === "moonroot" ? 0 : kind === "dewberry" ? 1 : 2;
  const frames = atlas.rows[row];
  const [x, y, width, height] = frames[column];
  const scale = size / Math.max(atlas.width / 3, ...frames.map(rect => rect[3]));
  return <View pointerEvents="none" style={{ width: size, height: size }}>
    <View style={{ position: "absolute", left: (size - width * scale) / 2, bottom: 0, width: width * scale, height: height * scale, overflow: "hidden" }}>
      <Image source={(classic ? CROPS : NEW_CROPS) as ImageSourcePropType} fadeDuration={0} style={{ position: "absolute", left: -x * scale, top: -y * scale, width: atlas.width * scale, height: atlas.height * scale }} />
    </View>
  </View>;
}

export function FarmToolSprite({ kind, size }: { kind: "bug" | "seed" | "water" | "compost"; size: number }) {
  const index = { bug: 0, seed: 1, water: 2, compost: 3 }[kind];
  return <AtlasSprite source={TOOLS} columns={2} rows={2} column={index % 2} row={Math.floor(index / 2)} width={size} />;
}

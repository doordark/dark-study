import { AtlasSprite } from "@/components/AtlasSprite";
import { type CropKind } from "@/utils/farmEconomy";

const CROPS = require("../../../assets/images/farm-crops-v3.png");
const TOOLS = require("../../../assets/images/farm-tools.png");
const ROW: Record<CropKind, number> = {
  radish: 0, wheat: 1, carrot: 2, berry: 3, tomato: 4,
  corn: 5, pumpkin: 6, grape: 7, star: 8,
};

export function CropSprite({ kind, stage = 2, size }: { kind: CropKind; stage?: number; size: number }) {
  const column = Number.isFinite(stage) ? Math.min(2, Math.max(0, Math.trunc(stage))) : 2;
  return <AtlasSprite source={CROPS} columns={3} rows={9} column={column} row={ROW[kind]} width={size} />;
}

export function FarmToolSprite({ kind, size }: { kind: "bug" | "seed" | "water" | "compost"; size: number }) {
  const index = { bug: 0, seed: 1, water: 2, compost: 3 }[kind];
  return <AtlasSprite source={TOOLS} columns={2} rows={2} column={index % 2} row={Math.floor(index / 2)} width={size} />;
}

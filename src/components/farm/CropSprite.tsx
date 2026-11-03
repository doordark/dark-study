import { AtlasSprite } from "@/components/AtlasSprite";
import { CROP_ART, CROP_STAGE_ROWS, PixelSprite, type CropKind } from "./sprites";
const CROPS = require("../../../assets/images/crop-stages.png");
const TOOLS = require("../../../assets/images/farm-tools.png");
const ROW: Partial<Record<CropKind, number>> = { radish: 0, berry: 1, star: 2 };
const MATURE: Partial<Record<CropKind, string[]>> = {
  wheat: ["..........", "..3..3....", ".333333...", "..3..3....", ".333333...", "..3..3....", "..5..5....", "...55.....", "....5.....", ".........."],
  carrot: ["..........", "..2.2.2...", "...212....", "...333....", "..33333...", "...333....", "...333....", "....3.....", "....3.....", ".........."],
  tomato: ["..........", "....2.....", "..22122...", "...111....", "..33133...", ".3331333..", "..33133...", "....1.....", "...555....", ".........."],
  corn: ["..........", "....2.....", "...232....", "..23332...", "..23332...", "...333....", "..22322...", "...222....", "....5.....", ".........."],
  pumpkin: ["..........", "....22....", "....5.....", "..333333..", ".33133133.", ".33133133.", ".33133133.", "..333333..", "...5555...", ".........."],
  grape: ["..........", "...2222...", "....5.....", "..33.33...", ".3333333..", "..33333...", "...333....", "....3.....", "....5.....", ".........."],
};
export function CropSprite({ kind, stage = 2, size }: { kind: CropKind; stage?: number; size: number }) {
  if (ROW[kind] === undefined) return <PixelSprite rows={stage < 2 ? CROP_STAGE_ROWS[Math.max(0, stage)] : MATURE[kind] ?? CROP_STAGE_ROWS[2]} palette={CROP_ART[kind].palette} pixel={size / 10} />;
  return <AtlasSprite source={CROPS} columns={3} rows={3} column={Math.min(2, Math.max(0, stage))} row={ROW[kind]!} width={size} />;
}
export function FarmToolSprite({ kind, size }: { kind: "bug" | "seed" | "water" | "compost"; size: number }) {
  const index = { bug: 0, seed: 1, water: 2, compost: 3 }[kind];
  return <AtlasSprite source={TOOLS} columns={2} rows={2} column={index % 2} row={Math.floor(index / 2)} width={size} />;
}

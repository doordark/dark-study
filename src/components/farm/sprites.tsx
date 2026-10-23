import React from "react";
import Svg, { Rect } from "react-native-svg";

/** 像素画：把字符网格按调色板画成 1x1 小方块（行内同色自动合并，减少节点） */
function pixelRects(
  rows: string[],
  palette: Record<string, string>,
  ox: number,
  oy: number,
  prefix: string,
): React.ReactElement[] {
  const out: React.ReactElement[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      const color = palette[ch];
      if (!color) {
        x += 1;
        continue;
      }
      let run = 1;
      while (row[x + run] === ch) run += 1;
      out.push(
        <Rect
          key={`${prefix}-${x}-${y}`}
          x={ox + x}
          y={oy + y}
          width={run}
          height={1}
          fill={color}
        />,
      );
      x += run;
    }
  });
  return out;
}

/** 独立像素角色 */
export function PixelSprite({
  rows,
  palette,
  pixel,
}: {
  rows: string[];
  palette: Record<string, string>;
  pixel: number;
}) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  return (
    <Svg width={w * pixel} height={h * pixel} viewBox={`0 0 ${w} ${h}`}>
      {pixelRects(rows, palette, 0, 0, "s")}
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  角色                                                                       */
/* -------------------------------------------------------------------------- */

export const DOOR_PALETTE: Record<string, string> = {
  "1": "#2A2B38",
  "2": "#F3C9A4",
  "3": "#38BDF8",
  "4": "#334155",
  "5": "#0F172A",
};

export const GU_PALETTE: Record<string, string> = {
  "1": "#4A2B2F",
  "2": "#FFD9B8",
  "3": "#F9A8D4",
  "4": "#B45309",
  "5": "#7C2D4A",
};

export const DOOR_ROWS = [
  "............",
  "...111111...",
  "..11111111..",
  "..12222221..",
  "..12111221..",
  "..12222221..",
  "...222222...",
  "...333333...",
  "..33333333..",
  "..33222233..",
  "..33222233..",
  "...333333...",
  "...444444...",
  "...444444...",
  "...44..44...",
  "...44..44...",
  "..555..555..",
  "..555..555..",
];

export const GU_ROWS = [
  "............",
  "...111111...",
  "..11111111..",
  "..11122111..",
  "..11222211..",
  "..11222211..",
  "...222222...",
  "...333333...",
  "..33333333..",
  "..33222233..",
  "..33333333..",
  ".3333333333.",
  ".3333333333.",
  "..33333333..",
  "...33..33...",
  "...22..22...",
  "..555..555..",
  "..555..555..",
];

/* -------------------------------------------------------------------------- */
/*  玩家（你）：草帽 + 琥珀色工装                                               */
/* -------------------------------------------------------------------------- */

export const HERO_PALETTE: Record<string, string> = {
  "1": "#2A2B38",
  "2": "#F3C9A4",
  "3": "#F5C466",
  "4": "#475569",
  "5": "#1E293B",
  "6": "#E8C87A",
};

export const HERO_ROWS = [
  "............",
  "...666666...",
  "..66666666..",
  ".6666666666.",
  "..12222221..",
  "..12111221..",
  "..12222221..",
  "...222222...",
  "..33333333..",
  "..33333333..",
  "..33222233..",
  "...333333...",
  "...444444...",
  "...444444...",
  "...44..44...",
  "...44..44...",
  "..555..555..",
  "..555..555..",
];

/* -------------------------------------------------------------------------- */
/*  作物                                                                       */
/* -------------------------------------------------------------------------- */

export type CropKind = "radish" | "berry" | "star";

export const CROP_STAGE_ROWS: string[][] = [
  [
    "..........",
    "..........",
    "..........",
    "..........",
    "....2.....",
    "...212....",
    "....5.....",
    "....5.....",
    "..........",
    "..........",
  ],
  [
    "..........",
    "..........",
    "....22....",
    "...2.12...",
    "..2..1.2..",
    "....11....",
    "....55....",
    "....55....",
    "..........",
    "..........",
  ],
  [
    "..........",
    "....22....",
    "...2112...",
    "..2.11.2..",
    ".2..33..2.",
    ".2.3333.2.",
    "..2.33.2..",
    "...2112...",
    "....55....",
    "..........",
  ],
];

export const CROP_ART: Record<
  CropKind,
  { label: string; palette: Record<string, string> }
> = {
  radish: {
    label: "萝卜",
    palette: {
      "1": "#15803D",
      "2": "#4ADE80",
      "3": "#FDE68A",
      "5": "#65A30D",
    },
  },
  berry: {
    label: "蓝莓",
    palette: {
      "1": "#166534",
      "2": "#4ADE80",
      "3": "#60A5FA",
      "5": "#65A30D",
    },
  },
  star: {
    label: "星星果",
    palette: {
      "1": "#CA8A04",
      "2": "#FDE047",
      "3": "#FBBF24",
      "5": "#84CC16",
    },
  },
};

/** 嵌在主场景 SVG 里的作物图块 */
export function cropRects(
  kind: CropKind,
  stage: number,
  x: number,
  y: number,
): React.ReactElement[] {
  const rows = CROP_STAGE_ROWS[Math.min(Math.max(stage, 0), 2)];
  return pixelRects(rows, CROP_ART[kind].palette, x, y, `${kind}-${stage}`);
}

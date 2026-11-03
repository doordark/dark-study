import { memo } from "react";
import { Image, View, type ImageSourcePropType } from "react-native";

/** One decoded atlas, clipped to a single cell. No platform-specific animated formats. */
export const AtlasSprite = memo(function AtlasSprite({ source, columns, rows, column, row, width, height = width }: {
  source: ImageSourcePropType; columns: number; rows: number; column: number; row: number; width: number; height?: number;
}) {
  return <View pointerEvents="none" style={{ width, height, overflow: "hidden" }}>
    <Image source={source} resizeMode="stretch" fadeDuration={0} style={{ position: "absolute", left: -column * width, top: -row * height, width: columns * width, height: rows * height }} />
  </View>;
});

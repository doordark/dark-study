import type { ComponentRef, ComponentType, RefAttributes } from "react";
import { Platform, type View, type ViewProps } from "react-native";
import { requireNativeView, requireOptionalNativeModule } from "expo";

export interface NativeLiquidGlassViewProps extends ViewProps {
  blurTargetId?: number;
  allowTargetLookup?: boolean;
  blurRadius: number;
  cornerRadius: number;
  isDark: boolean;
  tintRgba: [number, number, number, number];
  accentRgb: [number, number, number];
  reflectionRgb: [number, number, number];
  refractionStrength: number;
  dispersion: number;
  saturation: number;
  rimStrength: number;
  reflectionStrength: number;
  luminanceLift: number;
}

const MODULE_NAME = "DarkStudyLiquidGlass";
const isAndroid = Platform.OS === "android";
const androidSdk = isAndroid ? Number(Platform.Version) : 0;

const hasNativeModule =
  isAndroid && androidSdk >= 31 && !!requireOptionalNativeModule(MODULE_NAME);

export const hasNativeLiquidGlass = hasNativeModule;
export const hasAgslLiquidGlass = hasNativeModule && androidSdk >= 33;

export const NativeLiquidGlassView: ComponentType<NativeLiquidGlassViewProps> | null =
  hasNativeModule
    ? requireNativeView<NativeLiquidGlassViewProps>(MODULE_NAME, "LiquidGlassView")
    : null;

export const NativeLiquidGlassTargetView: ComponentType<
  ViewProps & RefAttributes<ComponentRef<typeof View>>
> | null = hasNativeModule
  ? requireNativeView<ViewProps & RefAttributes<ComponentRef<typeof View>>>(
      MODULE_NAME,
      "LiquidGlassTargetView",
    )
  : null;

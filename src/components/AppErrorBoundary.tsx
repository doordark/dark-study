import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export interface AppErrorBoundaryProps {
  isDark: boolean;
  onGoHome?: () => void;
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

const FALLBACK_MESSAGE = "发生未知渲染异常，请尝试重新渲染或回到课表首页。";

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 320);
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim().slice(0, 320);
  }
  return FALLBACK_MESSAGE;
}

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: "",
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: formatErrorMessage(error),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[AppErrorBoundary]", error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  handleGoHome = (): void => {
    try {
      this.props.onGoHome?.();
    } catch {
      // 忽略路由尚未就绪时的异常，保持状态已恢复
    }
    this.setState({ hasError: false, errorMessage: "" });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { isDark } = this.props;
    const bg = isDark ? "#0D1524" : "#F8FAFC";
    const cardBg = isDark ? "#162033" : "#FFFFFF";
    const border = isDark ? "#25334D" : "#E2E8F0";
    const titleColor = isDark ? "#F1F5F9" : "#0F172A";
    const subColor = isDark ? "#94A3B8" : "#475569";
    const boxBg = isDark ? "#0F172A" : "#F1F5F9";
    const secondaryBg = isDark ? "#1E293B" : "#E2E8F0";
    const secondaryText = isDark ? "#E2E8F0" : "#1E293B";

    return (
      <View style={[styles.container, { backgroundColor: bg }]}>
        <View
          style={[
            styles.card,
            { backgroundColor: cardBg, borderColor: border },
          ]}
        >
          <Text style={[styles.title, { color: titleColor }]}>
            页面遇到了一点小问题
          </Text>
          <Text style={[styles.subtitle, { color: subColor }]}>
            界面渲染意外中断，你的课表与本地数据不会丢失。
          </Text>
          <View
            style={[
              styles.errorBox,
              { backgroundColor: boxBg, borderColor: border },
            ]}
          >
            <Text
              selectable
              style={[styles.errorText, { color: subColor }]}
            >
              {this.state.errorMessage || FALLBACK_MESSAGE}
            </Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={this.handleReset}
              style={({ pressed }) => [
                styles.button,
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>重新渲染</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={this.handleGoHome}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: secondaryBg },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.secondaryButtonText, { color: secondaryText }]}>
                回到课表首页
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    gap: 14,
  },
  title: {
    fontSize: 19,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  errorBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  button: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  primaryButton: {
    backgroundColor: "#0EA5E9",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.8,
  },
});

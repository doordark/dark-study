import {
  createElement,
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from "react";

/**
 * Lazy-load a named React component export for React.lazy() + Metro inlineRequires.
 */
export function lazyNamed<T extends ComponentType<any>, K extends string>(
  loader: () => Promise<Record<K, T>>,
  exportName: K,
): LazyExoticComponent<T> {
  return lazy(async () => {
    const mod = await loader();
    return { default: mod[exportName] };
  });
}

export interface LazyBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Lightweight Suspense wrapper defaulting to `fallback={null}` for lazy overlays, sheets, and modals.
 */
export function LazyBoundary({ children, fallback = null }: LazyBoundaryProps) {
  return createElement(Suspense, { fallback }, children);
}

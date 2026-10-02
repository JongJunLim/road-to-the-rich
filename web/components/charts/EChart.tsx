"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { LineChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
  AxisPointerComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";

// 필요한 모듈만 등록 (번들 크기 최소화)
echarts.use([
  LineChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  MarkPointComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

/** CSS 토큰 → 차트 색. 라이트/다크 전환 시 자동 갱신 */
export interface ThemeTokens {
  surface: string;
  text1: string;
  text2: string;
  text3: string;
  grid: string;
  axis: string;
  s1: string;
  s2: string;
  s3: string;
  s4: string;
  s1Wash: string;
  good: string;
  bad: string;
}

function readTokens(): ThemeTokens {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    surface: v("--surface"),
    text1: v("--text-primary"),
    text2: v("--text-secondary"),
    text3: v("--text-muted"),
    grid: v("--grid"),
    axis: v("--axis"),
    s1: v("--series-1"),
    s2: v("--series-2"),
    s3: v("--series-3"),
    s4: v("--series-4"),
    s1Wash: v("--series-1-wash"),
    good: v("--delta-good"),
    bad: v("--delta-bad"),
  };
}

export function useThemeTokens(): ThemeTokens | null {
  const [tokens, setTokens] = useState<ThemeTokens | null>(null);
  useEffect(() => {
    const update = () => setTokens(readTokens());
    update();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    const obs = new MutationObserver(update); // data-theme 토글 대응
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", update);
      obs.disconnect();
    };
  }, []);
  return tokens;
}

interface Props {
  option: EChartsCoreOption | null;
  height: number;
  ariaLabel: string;
}

export default function EChart({ option, height, ariaLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    // 카드 폭이 바뀌면(회전·창 크기·레이아웃 전환) 다시 그림
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (option && chartRef.current) chartRef.current.setOption(option, { notMerge: true });
  }, [option]);

  return <div ref={ref} role="img" aria-label={ariaLabel} style={{ width: "100%", height }} />;
}

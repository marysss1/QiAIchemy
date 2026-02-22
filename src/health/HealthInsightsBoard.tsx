import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  HEALTH_SLEEP_STAGE_COLOR,
  HEALTH_SLEEP_STAGE_LABEL_ZH,
  type HealthSleepSample,
  type HealthSleepStageOrUnknown,
  type HealthSnapshot,
  type HealthTrendPoint,
} from './healthData';

type HealthInsightsBoardProps = {
  snapshot: HealthSnapshot;
};

type SleepSegment = {
  stage: HealthSleepStageOrUnknown;
  startDate: string;
  endDate: string;
  durationMinutes: number;
};

type SleepBlock = {
  startDate: string;
  endDate: string;
  asleepMinutes: number;
  awakeMinutes: number;
  inBedMinutes: number;
  totalMinutes: number;
};

type RingSpec = {
  label: string;
  value: number;
  target: number;
  unit: string;
  color: string;
  trackColor: string;
  radius: number;
  dotSize: number;
};

const ASLEEP_STAGES: Set<HealthSleepStageOrUnknown> = new Set([
  'asleepUnspecified',
  'asleepCore',
  'asleepDeep',
  'asleepREM',
]);

function fmt(value: number | undefined | null, digits = 0): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '--';
  }
  return value.toFixed(digits);
}

function toLocalTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mgDlToMmolL(value: number | undefined): number | undefined {
  if (value === undefined || Number.isNaN(value)) {
    return undefined;
  }
  return value / 18;
}

function glucoseStatusText(mmolL: number | undefined): string {
  if (mmolL === undefined) {
    return '无数据';
  }
  if (mmolL >= 11.1) {
    return '偏高';
  }
  if (mmolL >= 7.0) {
    return '偏高风险';
  }
  if (mmolL < 3.9) {
    return '偏低';
  }
  return '正常范围';
}

function normalizeSleepSegments(samples: HealthSleepSample[] | undefined): SleepSegment[] {
  if (!samples?.length) {
    return [];
  }

  return samples
    .map(sample => {
      const start = new Date(sample.startDate).getTime();
      const end = new Date(sample.endDate).getTime();
      const durationMinutes = Math.max((end - start) / (1000 * 60), 0);
      return {
        stage: sample.stage,
        startDate: sample.startDate,
        endDate: sample.endDate,
        durationMinutes,
      };
    })
    .filter(segment => segment.durationMinutes > 0)
    .sort((left, right) =>
      new Date(left.startDate).getTime() - new Date(right.startDate).getTime()
    );
}

function buildSleepBlocks(segments: SleepSegment[]): SleepBlock[] {
  if (!segments.length) {
    return [];
  }

  const blocks: SleepBlock[] = [];
  const maxGapMinutes = 45;

  segments.forEach(segment => {
    const startMs = new Date(segment.startDate).getTime();
    const last = blocks[blocks.length - 1];

    if (!last) {
      blocks.push({
        startDate: segment.startDate,
        endDate: segment.endDate,
        asleepMinutes: ASLEEP_STAGES.has(segment.stage) ? segment.durationMinutes : 0,
        awakeMinutes: segment.stage === 'awake' ? segment.durationMinutes : 0,
        inBedMinutes: segment.stage === 'inBed' ? segment.durationMinutes : 0,
        totalMinutes: segment.durationMinutes,
      });
      return;
    }

    const lastEnd = new Date(last.endDate).getTime();
    const gapMinutes = (startMs - lastEnd) / (1000 * 60);

    if (gapMinutes > maxGapMinutes) {
      blocks.push({
        startDate: segment.startDate,
        endDate: segment.endDate,
        asleepMinutes: ASLEEP_STAGES.has(segment.stage) ? segment.durationMinutes : 0,
        awakeMinutes: segment.stage === 'awake' ? segment.durationMinutes : 0,
        inBedMinutes: segment.stage === 'inBed' ? segment.durationMinutes : 0,
        totalMinutes: segment.durationMinutes,
      });
      return;
    }

    last.endDate = segment.endDate;
    last.totalMinutes += segment.durationMinutes;
    if (ASLEEP_STAGES.has(segment.stage)) {
      last.asleepMinutes += segment.durationMinutes;
    }
    if (segment.stage === 'awake') {
      last.awakeMinutes += segment.durationMinutes;
    }
    if (segment.stage === 'inBed') {
      last.inBedMinutes += segment.durationMinutes;
    }
  });

  return blocks;
}

function chooseMainSleepBlock(blocks: SleepBlock[]): SleepBlock | null {
  if (!blocks.length) {
    return null;
  }

  const ranked = [...blocks].sort((a, b) => {
    const asleepDiff = b.asleepMinutes - a.asleepMinutes;
    if (asleepDiff !== 0) {
      return asleepDiff;
    }
    return new Date(b.endDate).getTime() - new Date(a.endDate).getTime();
  });

  const first = ranked[0];
  if (first.asleepMinutes >= 90) {
    return first;
  }
  return blocks[blocks.length - 1];
}

function SegmentedRing({
  center,
  segments,
  spec,
}: {
  center: number;
  segments: number;
  spec: RingSpec;
}) {
  const ratio = spec.target > 0 ? spec.value / spec.target : 0;
  const progress = Math.min(Math.max(ratio, 0), 1);
  const filled = Math.round(progress * segments);

  return (
    <>
      {Array.from({ length: segments }, (_, index) => {
        const angleDeg = -90 + (index * 360) / segments;
        const angle = (angleDeg * Math.PI) / 180;
        const x = center + spec.radius * Math.cos(angle) - spec.dotSize / 2;
        const y = center + spec.radius * Math.sin(angle) - spec.dotSize / 2;

        return (
          <View
            key={`${spec.label}-${index}`}
            style={[
              styles.ringDot,
              {
                left: x,
                top: y,
                width: spec.dotSize,
                height: spec.dotSize,
                borderRadius: spec.dotSize / 2,
                backgroundColor: index < filled ? spec.color : spec.trackColor,
              },
            ]}
          />
        );
      })}
    </>
  );
}

function TaijiRings({
  moveKcal,
  exerciseMin,
  standHours,
}: {
  moveKcal: number;
  exerciseMin: number;
  standHours: number;
}) {
  const size = 212;
  const center = size / 2;
  const segments = 72;

  const ringSpecs: RingSpec[] = [
    {
      label: '行气环',
      value: moveKcal,
      target: 480,
      unit: 'kcal',
      color: '#b53f33',
      trackColor: '#ead2c5',
      radius: 86,
      dotSize: 7,
    },
    {
      label: '强身环',
      value: exerciseMin,
      target: 45,
      unit: 'min',
      color: '#c48f55',
      trackColor: '#efe0cd',
      radius: 64,
      dotSize: 6,
    },
    {
      label: '立身环',
      value: standHours,
      target: 12,
      unit: 'h',
      color: '#6f5339',
      trackColor: '#e8dccf',
      radius: 44,
      dotSize: 5,
    },
  ];

  return (
    <View style={styles.taijiWrap}>
      <View style={[styles.taijiRingBoard, { width: size, height: size }]}> 
        {ringSpecs.map(spec => (
          <SegmentedRing key={spec.label} center={center} segments={segments} spec={spec} />
        ))}

        <View style={styles.taijiCenterCircle}>
          <Text style={styles.taijiSymbol}>☯</Text>
          <Text style={styles.taijiCenterLabel}>太极活力环</Text>
        </View>
      </View>

      <View style={styles.taijiLegendList}>
        {ringSpecs.map(spec => {
          const ratio = spec.target > 0 ? spec.value / spec.target : 0;
          return (
            <View key={spec.label} style={styles.taijiLegendItem}>
              <View style={[styles.taijiLegendDot, { backgroundColor: spec.color }]} />
              <Text style={styles.taijiLegendText}>
                {spec.label}：{fmt(spec.value, 0)} / {spec.target} {spec.unit}（{fmt(ratio * 100, 0)}%）
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function MiniBarsInteractive({
  title,
  points,
  color,
  unitLabel,
  valueDigits = 1,
  transformValue,
}: {
  title: string;
  points: HealthTrendPoint[];
  color: string;
  unitLabel: string;
  valueDigits?: number;
  transformValue?: (value: number) => number;
}) {
  const displayPoints = useMemo(
    () =>
      points.map(point => ({
        ...point,
        displayValue: transformValue ? transformValue(point.value) : point.value,
      })),
    [points, transformValue]
  );

  const validPoints = useMemo(
    () => displayPoints.filter(point => Number.isFinite(point.displayValue) && point.displayValue > 0),
    [displayPoints]
  );

  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (validPoints.length > 0) {
      setSelectedIndex(validPoints.length - 1);
    } else {
      setSelectedIndex(0);
    }
  }, [validPoints.length]);

  if (!validPoints.length) {
    return (
      <View style={styles.chartSection}>
        <Text style={styles.subSectionTitle}>{title}</Text>
        <Text style={styles.emptyHint}>暂无趋势数据</Text>
      </View>
    );
  }

  const safeIndex = Math.min(selectedIndex, validPoints.length - 1);
  const selected = validPoints[safeIndex];
  const maxValue = Math.max(...validPoints.map(point => point.displayValue), 1);
  const minValue = Math.min(...validPoints.map(point => point.displayValue));
  const rangeValue = Math.max(maxValue - minValue, 1);
  const maxHeight = 48;

  return (
    <View style={styles.chartSection}>
      <Text style={styles.subSectionTitle}>{title}</Text>
      <View style={styles.miniBarsWrap}>
        <View style={styles.miniBarsClip}>
          <View style={styles.miniBarsInner}>
            {validPoints.map((point, index) => {
              const ratio = point.displayValue / maxValue;
              const varianceRatio = (point.displayValue - minValue) / rangeValue;
              const height = Math.min(
                Math.max(maxHeight * (0.65 * ratio + 0.35 * varianceRatio), 8),
                maxHeight
              );
              const active = index === safeIndex;
              return (
                <Pressable
                  key={`${point.timestamp}-${index}`}
                  style={styles.miniBarPressArea}
                  onPress={() => setSelectedIndex(index)}
                >
                  <View
                    style={[
                      styles.miniBar,
                      active ? styles.miniBarActive : styles.miniBarInactive,
                      {
                        height,
                        backgroundColor: active ? color : `${color}AA`,
                      },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <View style={styles.chartDetailPill}>
        <View style={[styles.chartDetailDot, { backgroundColor: color }]} />
        <Text style={styles.chartDetailText}>
          {toLocalTime(selected.timestamp)} · {fmt(selected.displayValue, valueDigits)} {unitLabel}
        </Text>
      </View>
    </View>
  );
}

export function HealthInsightsBoard({ snapshot }: HealthInsightsBoardProps): React.JSX.Element {
  const sleepSegments = useMemo(
    () => normalizeSleepSegments(snapshot.sleep?.samplesLast36h),
    [snapshot.sleep?.samplesLast36h]
  );

  const sleepTimelineTotal = sleepSegments.reduce(
    (total, segment) => total + segment.durationMinutes,
    0
  );

  const sleepBlocks = useMemo(() => buildSleepBlocks(sleepSegments), [sleepSegments]);
  const mainSleepBlock = useMemo(() => chooseMainSleepBlock(sleepBlocks), [sleepBlocks]);

  const totalSleepHours = mainSleepBlock
    ? mainSleepBlock.asleepMinutes / 60
    : (snapshot.sleep?.asleepMinutesLast36h ?? 0) / 60;

  const sleepWindowLabel = mainSleepBlock
    ? `${toLocalTime(mainSleepBlock.startDate)} - ${toLocalTime(mainSleepBlock.endDate)}`
    : '--';

  const heartTrend = (snapshot.heart?.heartRateSeriesLast24h ?? [])
    .filter(point => point.value > 0)
    .slice(-12);

  const oxygenTrend = (snapshot.oxygen?.bloodOxygenSeriesLast24h ?? [])
    .filter(point => point.value > 0)
    .slice(-12);

  const glucoseMmolL = mgDlToMmolL(snapshot.metabolic?.bloodGlucoseMgDl);

  const latestWorkout = snapshot.workouts?.[0];

  return (
    <View style={styles.board}>
      <View style={styles.boardHeader}>
        <Text style={styles.boardTitle}>养生数据总览</Text>
        <Text style={styles.boardMeta}>更新于 {new Date(snapshot.generatedAt).toLocaleString('zh-CN')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>睡眠分期与主睡眠时长</Text>
        <Text style={styles.sleepDocNote}>
          HealthKit 的 `sleepAnalysis` 样本属于分类记录，阶段（卧床/各睡眠期/清醒）可能重叠；官方也没有固定“36小时”窗口，窗口由查询的起止时间决定。当前按样本自动识别主睡眠段，并以小时展示总睡眠时长。
        </Text>

        {sleepSegments.length > 0 ? (
          <>
            <View style={styles.sleepTimeline}>
              {sleepSegments.map(segment => {
                const flexValue = sleepTimelineTotal > 0 ? segment.durationMinutes : 1;
                return (
                  <View
                    key={`${segment.startDate}-${segment.endDate}-${segment.stage}`}
                    style={[
                      styles.sleepSegment,
                      {
                        flex: flexValue,
                        backgroundColor:
                          HEALTH_SLEEP_STAGE_COLOR[segment.stage] ?? HEALTH_SLEEP_STAGE_COLOR.unknown,
                      },
                    ]}
                  />
                );
              })}
            </View>
            <View style={styles.sleepLegendWrap}>
              {(['asleepCore', 'asleepDeep', 'asleepREM', 'awake', 'inBed'] as HealthSleepStageOrUnknown[]).map(stage => (
                <View key={stage} style={styles.sleepLegendItem}>
                  <View
                    style={[
                      styles.sleepLegendDot,
                      { backgroundColor: HEALTH_SLEEP_STAGE_COLOR[stage] },
                    ]}
                  />
                  <Text style={styles.sleepLegendText}>{HEALTH_SLEEP_STAGE_LABEL_ZH[stage]}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.emptyHint}>暂无睡眠样本（可先点击“读取 Mock 数据”）</Text>
        )}

        <View style={styles.metricRow}>
          <View style={styles.metricPill}>
            <Text style={styles.metricLabel}>主睡眠时长</Text>
            <Text style={styles.metricValue}>{fmt(totalSleepHours, 2)} 小时</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricLabel}>主睡眠区间</Text>
            <Text style={styles.metricValue}>{sleepWindowLabel}</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricLabel}>睡眠评分</Text>
            <Text style={styles.metricValue}>{fmt(snapshot.sleep?.sleepScore)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>太极运动三环（中国风）</Text>
        <Text style={styles.sleepDocNote}>
          保留 iOS 活动圆环逻辑：移动能量、锻炼分钟、站立小时；视觉用太极意象重绘，便于本土化表达。
        </Text>
        <TaijiRings
          moveKcal={snapshot.activity?.activeEnergyKcalToday ?? 0}
          exerciseMin={snapshot.activity?.exerciseMinutesToday ?? 0}
          standHours={snapshot.activity?.standHoursToday ?? 0}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>心肺与代谢</Text>
        <View style={styles.metricGrid}>
          <View style={styles.metricTile}>
            <Text style={styles.metricTileLabel}>当前心率</Text>
            <Text style={styles.metricTileValue}>{fmt(snapshot.heart?.latestHeartRateBpm)} bpm</Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricTileLabel}>静息心率</Text>
            <Text style={styles.metricTileValue}>{fmt(snapshot.heart?.restingHeartRateBpm)} bpm</Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricTileLabel}>血氧</Text>
            <Text style={styles.metricTileValue}>{fmt(snapshot.oxygen?.bloodOxygenPercent, 1)} %</Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricTileLabel}>血糖（mmol/L）</Text>
            <Text style={styles.metricTileValue}>{fmt(glucoseMmolL, 1)}</Text>
            <Text style={styles.metricTileSub}>{glucoseStatusText(glucoseMmolL)}</Text>
          </View>
        </View>

        <MiniBarsInteractive title="近 12 小时心率波动（可点选）" points={heartTrend} color="#7a5b3e" unitLabel="bpm" valueDigits={0} />

        <MiniBarsInteractive title="近 12 小时血氧波动（可点选）" points={oxygenTrend} color="#c48f55" unitLabel="%" valueDigits={1} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>体征与活动记录</Text>
        <View style={styles.metricRow}>
          <View style={styles.metricPill}>
            <Text style={styles.metricLabel}>呼吸频率</Text>
            <Text style={styles.metricValue}>{fmt(snapshot.body?.respiratoryRateBrpm, 1)} brpm</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricLabel}>HRV</Text>
            <Text style={styles.metricValue}>{fmt(snapshot.heart?.heartRateVariabilityMs, 1)} ms</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricLabel}>体重</Text>
            <Text style={styles.metricValue}>{fmt(snapshot.body?.bodyMassKg, 1)} kg</Text>
          </View>
        </View>

        <View style={styles.workoutCard}>
          <Text style={styles.workoutTitle}>近期运动</Text>
          <Text style={styles.workoutText}>记录数：{snapshot.workouts?.length ?? 0}</Text>
          <Text style={styles.workoutText}>
            最近一次：
            {latestWorkout
              ? `${latestWorkout.activityTypeName ?? '运动'} · ${fmt(latestWorkout.durationMinutes)} 分钟`
              : '暂无'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(78, 53, 32, 0.2)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(246, 238, 224, 0.95)',
  },
  boardHeader: {
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(78, 53, 32, 0.16)',
    paddingBottom: 8,
  },
  boardTitle: {
    color: '#4e3520',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  boardMeta: {
    marginTop: 3,
    color: '#7a634c',
    fontSize: 11,
  },
  section: {
    marginTop: 10,
  },
  sectionTitle: {
    color: '#5d4026',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  subSectionTitle: {
    marginBottom: 6,
    color: '#6c5136',
    fontSize: 12,
    fontWeight: '600',
  },
  sleepDocNote: {
    marginBottom: 8,
    color: '#7d6548',
    fontSize: 11,
    lineHeight: 16,
  },
  sleepTimeline: {
    flexDirection: 'row',
    height: 18,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d8c5a8',
    backgroundColor: '#efe3d0',
  },
  sleepSegment: {
    height: '100%',
  },
  sleepLegendWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  sleepLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sleepLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sleepLegendText: {
    color: '#6d543a',
    fontSize: 11,
  },
  metricRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  metricPill: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#fffaf1',
    borderWidth: 1,
    borderColor: '#e1ceb1',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  metricLabel: {
    color: '#7b6248',
    fontSize: 11,
  },
  metricValue: {
    marginTop: 2,
    color: '#513825',
    fontSize: 12,
    fontWeight: '700',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricTile: {
    width: '48%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddc8aa',
    backgroundColor: '#fffaf1',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  metricTileLabel: {
    color: '#795f44',
    fontSize: 11,
  },
  metricTileValue: {
    marginTop: 3,
    color: '#4f3621',
    fontSize: 13,
    fontWeight: '700',
  },
  metricTileSub: {
    marginTop: 3,
    color: '#856748',
    fontSize: 10,
  },
  chartSection: {
    marginTop: 10,
  },
  miniBarsWrap: {
    borderWidth: 1,
    borderColor: '#dbc7a8',
    backgroundColor: '#fffaf1',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  miniBarsClip: {
    height: 58,
    overflow: 'hidden',
  },
  miniBarsInner: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    overflow: 'hidden',
  },
  miniBarPressArea: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    height: '100%',
  },
  miniBar: {
    width: '86%',
    borderRadius: 3,
    borderWidth: 1,
    maxHeight: 48,
  },
  miniBarActive: {
    borderColor: '#ffffff',
  },
  miniBarInactive: {
    borderColor: 'transparent',
  },
  chartDetailPill: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d9c4a3',
    backgroundColor: '#fff8ee',
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
  },
  chartDetailDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chartDetailText: {
    color: '#6b5238',
    fontSize: 11,
  },
  taijiWrap: {
    alignItems: 'center',
  },
  taijiRingBoard: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 106,
    backgroundColor: '#fff8ef',
    borderWidth: 1,
    borderColor: '#dec7a8',
  },
  ringDot: {
    position: 'absolute',
  },
  taijiCenterCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d8c2a1',
    backgroundColor: '#f8ecdc',
  },
  taijiSymbol: {
    color: '#5f4126',
    fontSize: 24,
    fontWeight: '700',
  },
  taijiCenterLabel: {
    marginTop: 1,
    color: '#73563a',
    fontSize: 9,
  },
  taijiLegendList: {
    marginTop: 10,
    width: '100%',
    gap: 6,
  },
  taijiLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  taijiLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  taijiLegendText: {
    color: '#6f563b',
    fontSize: 11,
  },
  workoutCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#ddc8aa',
    borderRadius: 10,
    backgroundColor: '#fffaf1',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  workoutTitle: {
    color: '#5f452b',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 3,
  },
  workoutText: {
    color: '#71583e',
    fontSize: 11,
    marginBottom: 2,
  },
  emptyHint: {
    color: '#8b7158',
    fontSize: 12,
  },
});

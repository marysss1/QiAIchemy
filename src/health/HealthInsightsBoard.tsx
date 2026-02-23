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
  segmentLength: number;
  segmentThickness: number;
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

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
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

function sleepApneaRiskViewModel(riskLevel: string | undefined): {
  label: string;
  textColor: string;
  bgColor: string;
} {
  if (riskLevel === 'high') {
    return {
      label: '高风险提示',
      textColor: '#9a2f24',
      bgColor: '#f8e0da',
    };
  }
  if (riskLevel === 'watch') {
    return {
      label: '关注提示',
      textColor: '#8a5b1e',
      bgColor: '#faecd4',
    };
  }
  if (riskLevel === 'none') {
    return {
      label: '未见异常',
      textColor: '#2d6f43',
      bgColor: '#e5f2e9',
    };
  }
  return {
    label: '数据待完善',
    textColor: '#6d543a',
    bgColor: '#f2eadf',
  };
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
        const x = center + spec.radius * Math.cos(angle) - spec.segmentLength / 2;
        const y = center + spec.radius * Math.sin(angle) - spec.segmentThickness / 2;

        return (
          <View
            key={`${spec.label}-${index}`}
            style={[
              styles.ringDot,
              {
                left: x,
                top: y,
                width: spec.segmentLength,
                height: spec.segmentThickness,
                borderRadius: spec.segmentThickness / 2,
                transform: [{ rotate: `${angleDeg + 90}deg` }],
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
  const size = 228;
  const center = size / 2;
  const segments = 80;

  const ringSpecs: RingSpec[] = [
    {
      label: '行气环',
      value: moveKcal,
      target: 480,
      unit: 'kcal',
      color: '#b53f33',
      trackColor: '#ead2c5',
      radius: 92,
      segmentLength: 8,
      segmentThickness: 4,
    },
    {
      label: '强身环',
      value: exerciseMin,
      target: 45,
      unit: 'min',
      color: '#bc7d42',
      trackColor: '#efe0cd',
      radius: 72,
      segmentLength: 7,
      segmentThickness: 4,
    },
    {
      label: '立身环',
      value: standHours,
      target: 12,
      unit: 'h',
      color: '#6f5339',
      trackColor: '#e8dccf',
      radius: 52,
      segmentLength: 6,
      segmentThickness: 3,
    },
  ];

  return (
    <View style={styles.taijiWrap}>
      <View style={[styles.taijiRingBoard, { width: size, height: size }]}>
        <View style={styles.taijiBackdropOuter} />
        <View style={styles.taijiBackdropInner} />
        {ringSpecs.map(spec => (
          <SegmentedRing key={spec.label} center={center} segments={segments} spec={spec} />
        ))}

        <View style={styles.taijiCenterCircle}>
          <View style={styles.taijiCore}>
            <View style={styles.taijiTopHalf} />
            <View style={styles.taijiBottomHalf} />
            <View style={styles.taijiTopBulge} />
            <View style={styles.taijiBottomBulge} />
            <View style={styles.taijiTopEye} />
            <View style={styles.taijiBottomEye} />
          </View>
          <Text style={styles.taijiCenterLabel}>阴阳平衡</Text>
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
  const maxValue = Math.max(...validPoints.map(point => point.displayValue), 1);
  const minValue = Math.min(...validPoints.map(point => point.displayValue));
  const rangeValue = Math.max(maxValue - minValue, 1);
  const maxHeight = 66;
  const minHeight = 10;

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
                Math.max(maxHeight * (0.65 * ratio + 0.35 * varianceRatio), minHeight),
                maxHeight
              );
              const active = index === safeIndex;
              const markerBottom = Math.min(height + 7, maxHeight + 2);
              const markerAlignStyle =
                index === 0
                  ? styles.miniBarMarkerFirst
                  : index === validPoints.length - 1
                    ? styles.miniBarMarkerLast
                    : styles.miniBarMarkerCenter;
              return (
                <Pressable
                  key={`${point.timestamp}-${index}`}
                  style={styles.miniBarPressArea}
                  onPress={() => setSelectedIndex(index)}
                >
                  {active ? (
                    <View style={[styles.miniBarMarker, markerAlignStyle, { bottom: markerBottom }]}>
                      <Text style={styles.miniBarMarkerText} numberOfLines={1}>
                        {fmt(point.displayValue, valueDigits)} {unitLabel}
                      </Text>
                    </View>
                  ) : null}
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
      <Text style={styles.chartTimeHint}>选中时间：{toLocalTime(validPoints[safeIndex].timestamp)}</Text>
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
  const apnea = snapshot.sleep?.apnea;
  const apneaRisk = sleepApneaRiskViewModel(apnea?.riskLevel);

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

        <View style={styles.apneaCard}>
          <View style={styles.apneaHeaderRow}>
            <Text style={styles.apneaTitle}>睡眠呼吸暂停提醒</Text>
            <View style={[styles.apneaBadge, { backgroundColor: apneaRisk.bgColor }]}>
              <Text style={[styles.apneaBadgeText, { color: apneaRisk.textColor }]}>{apneaRisk.label}</Text>
            </View>
          </View>
          <Text style={styles.apneaMeta}>
            近30天事件：{fmt(apnea?.eventCountLast30d)} 次 · 累计时长：
            {fmt(apnea?.durationMinutesLast30d, 1)} 分钟
          </Text>
          <Text style={styles.apneaMeta}>
            最近一次：{apnea?.latestEventAt ? toLocalDateTime(apnea.latestEventAt) : '--'}
          </Text>
          <Text style={styles.apneaReminderText}>
            {apnea?.reminder ??
              '暂无睡眠呼吸暂停事件记录。若长期打鼾、晨起头痛或白天嗜睡，建议咨询医生。'}
          </Text>
          <Text style={styles.apneaDisclaimer}>本提醒仅用于健康管理，不构成医疗诊断。</Text>
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
            <Text style={styles.metricTileValue}>{fmt(snapshot.oxygen?.bloodOxygenPercent, 0)} %</Text>
          </View>
          <View style={styles.metricTile}>
            <Text style={styles.metricTileLabel}>血糖（mmol/L）</Text>
            <Text style={styles.metricTileValue}>{fmt(glucoseMmolL, 1)}</Text>
            <Text style={styles.metricTileSub}>{glucoseStatusText(glucoseMmolL)}</Text>
          </View>
        </View>

        <MiniBarsInteractive
          title="近 12 小时心率波动（可点选）"
          points={heartTrend}
          color="#7a5b3e"
          unitLabel="bpm"
          valueDigits={0}
        />

        <MiniBarsInteractive
          title="近 12 小时血氧波动（可点选）"
          points={oxygenTrend}
          color="#c48f55"
          unitLabel="%"
          valueDigits={0}
        />
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
  apneaCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#decaac',
    borderRadius: 10,
    backgroundColor: '#fffaf1',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  apneaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  apneaTitle: {
    color: '#5c4027',
    fontSize: 12,
    fontWeight: '700',
  },
  apneaBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  apneaBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  apneaMeta: {
    color: '#6d543a',
    fontSize: 11,
  },
  apneaReminderText: {
    marginTop: 2,
    color: '#5a4129',
    fontSize: 11,
    lineHeight: 16,
  },
  apneaDisclaimer: {
    color: '#8d7458',
    fontSize: 10,
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
    height: 96,
    overflow: 'hidden',
  },
  miniBarsInner: {
    height: 96,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    paddingTop: 20,
  },
  miniBarPressArea: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    height: '100%',
    position: 'relative',
  },
  miniBar: {
    width: '84%',
    borderRadius: 4,
    borderWidth: 1,
    maxHeight: 66,
  },
  miniBarActive: {
    borderColor: '#ffffff',
  },
  miniBarInactive: {
    borderColor: 'transparent',
  },
  miniBarMarker: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#ddc5a7',
    backgroundColor: '#fff8ec',
    minWidth: 74,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    zIndex: 3,
    shadowColor: '#5b4129',
    shadowOpacity: 0.16,
    shadowRadius: 3,
    shadowOffset: {
      width: 0,
      height: 1,
    },
    elevation: 2,
  },
  miniBarMarkerCenter: {
    left: '50%',
    transform: [{ translateX: -37 }],
  },
  miniBarMarkerFirst: {
    left: 0,
  },
  miniBarMarkerLast: {
    right: 0,
  },
  miniBarMarkerText: {
    color: '#5f452d',
    fontSize: 10,
    textAlign: 'center',
    fontWeight: '700',
  },
  chartTimeHint: {
    marginTop: 6,
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
    borderRadius: 114,
    backgroundColor: '#fdf8ef',
    borderWidth: 1,
    borderColor: '#ddc4a3',
    shadowColor: '#6f5339',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 4,
    },
  },
  ringDot: {
    position: 'absolute',
  },
  taijiBackdropOuter: {
    position: 'absolute',
    width: 194,
    height: 194,
    borderRadius: 97,
    backgroundColor: 'rgba(207, 173, 138, 0.18)',
  },
  taijiBackdropInner: {
    position: 'absolute',
    width: 138,
    height: 138,
    borderRadius: 69,
    backgroundColor: '#fbf1e3',
    borderWidth: 1,
    borderColor: '#e1cfb5',
  },
  taijiCenterCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d6be9b',
    backgroundColor: '#f7e9d7',
  },
  taijiCore: {
    width: 44,
    height: 44,
    borderRadius: 22,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#7a5b3e',
    backgroundColor: '#7a5b3e',
  },
  taijiTopHalf: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: '#efe1cc',
  },
  taijiBottomHalf: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: '#7a5b3e',
  },
  taijiTopBulge: {
    position: 'absolute',
    top: 0,
    left: 11,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#7a5b3e',
  },
  taijiBottomBulge: {
    position: 'absolute',
    bottom: 0,
    left: 11,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#efe1cc',
  },
  taijiTopEye: {
    position: 'absolute',
    top: 8,
    left: 18,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#efe1cc',
  },
  taijiBottomEye: {
    position: 'absolute',
    bottom: 8,
    left: 18,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7a5b3e',
  },
  taijiCenterLabel: {
    marginTop: 5,
    color: '#6f5339',
    fontSize: 10,
    fontWeight: '700',
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

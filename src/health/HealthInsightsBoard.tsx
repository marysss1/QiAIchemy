import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

function fmt(value: number | undefined | null, digits = 0): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '--';
  }
  return value.toFixed(digits);
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

function ProgressRow({
  label,
  value,
  unit,
  target,
  color,
}: {
  label: string;
  value?: number;
  unit: string;
  target: number;
  color: string;
}) {
  const ratio = value === undefined ? 0 : Math.min(value / target, 1);
  return (
    <View style={styles.progressRow}>
      <View style={styles.progressLabelWrap}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressValue}>
          {fmt(value, unit === '步' || unit === '分钟' ? 0 : 1)} {unit}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function MiniBars({
  points,
  color,
  maxHeight = 52,
}: {
  points: HealthTrendPoint[];
  color: string;
  maxHeight?: number;
}) {
  if (!points.length) {
    return <Text style={styles.emptyHint}>暂无趋势数据</Text>;
  }

  const maxValue = Math.max(...points.map(point => point.value), 1);
  return (
    <View style={styles.miniBarsWrap}>
      {points.map(point => {
        const height = Math.max((point.value / maxValue) * maxHeight, 4);
        return <View key={`${point.timestamp}-${point.value}`} style={[styles.miniBar, { height, backgroundColor: color }]} />;
      })}
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

  const heartTrend = (snapshot.heart?.heartRateSeriesLast24h ?? [])
    .filter(point => point.value > 0)
    .slice(-12);

  const oxygenTrend = (snapshot.oxygen?.bloodOxygenSeriesLast24h ?? [])
    .filter(point => point.value > 0)
    .slice(-12);

  const latestWorkout = snapshot.workouts?.[0];

  return (
    <View style={styles.board}>
      <View style={styles.boardHeader}>
        <Text style={styles.boardTitle}>养生数据总览</Text>
        <Text style={styles.boardMeta}>更新于 {new Date(snapshot.generatedAt).toLocaleString('zh-CN')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>睡眠分期（近 36 小时）</Text>
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
                        backgroundColor: HEALTH_SLEEP_STAGE_COLOR[segment.stage] ?? HEALTH_SLEEP_STAGE_COLOR.unknown,
                      },
                    ]}
                  />
                );
              })}
            </View>
            <View style={styles.sleepLegendWrap}>
              {(['asleepCore', 'asleepDeep', 'asleepREM', 'awake', 'inBed'] as HealthSleepStageOrUnknown[]).map(stage => (
                <View key={stage} style={styles.sleepLegendItem}>
                  <View style={[styles.sleepLegendDot, { backgroundColor: HEALTH_SLEEP_STAGE_COLOR[stage] }]} />
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
            <Text style={styles.metricLabel}>总睡眠</Text>
            <Text style={styles.metricValue}>{fmt(snapshot.sleep?.asleepMinutesLast36h)} 分钟</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricLabel}>清醒时长</Text>
            <Text style={styles.metricValue}>{fmt(snapshot.sleep?.awakeMinutesLast36h)} 分钟</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricLabel}>睡眠评分</Text>
            <Text style={styles.metricValue}>{fmt(snapshot.sleep?.sleepScore)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>日常活力</Text>
        <ProgressRow
          label="步数"
          value={snapshot.activity?.stepsToday}
          target={9000}
          unit="步"
          color="#b53f33"
        />
        <ProgressRow
          label="运动时长"
          value={snapshot.activity?.exerciseMinutesToday}
          target={60}
          unit="分钟"
          color="#7b5a3f"
        />
        <ProgressRow
          label="日照时长"
          value={snapshot.environment?.daylightMinutesToday}
          target={90}
          unit="分钟"
          color="#c48f55"
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
            <Text style={styles.metricTileLabel}>血糖</Text>
            <Text style={styles.metricTileValue}>{fmt(snapshot.metabolic?.bloodGlucoseMgDl, 1)} mg/dL</Text>
          </View>
        </View>

        <Text style={styles.subSectionTitle}>近 12 小时心率波动</Text>
        <MiniBars points={heartTrend} color="#7a5b3e" />

        <Text style={styles.subSectionTitle}>近 12 小时血氧波动</Text>
        <MiniBars points={oxygenTrend} color="#c48f55" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>体征与活动记录</Text>
        <View style={styles.metricRow}>
          <View style={styles.metricPill}>
            <Text style={styles.metricLabel}>呼吸频率</Text>
            <Text style={styles.metricValue}>{fmt(snapshot.body?.respiratoryRateBrpm, 1)} brpm</Text>
          </View>
          <View style={styles.metricPill}>
            <Text style={styles.metricLabel}>体温</Text>
            <Text style={styles.metricValue}>{fmt(snapshot.body?.bodyTemperatureCelsius, 2)} ℃</Text>
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
    marginTop: 8,
    marginBottom: 6,
    color: '#6c5136',
    fontSize: 12,
    fontWeight: '600',
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
  progressRow: {
    marginBottom: 8,
  },
  progressLabelWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabel: {
    color: '#6c5238',
    fontSize: 12,
    fontWeight: '600',
  },
  progressValue: {
    color: '#5a3f24',
    fontSize: 12,
    fontWeight: '700',
  },
  progressTrack: {
    height: 10,
    borderRadius: 6,
    backgroundColor: '#eadcc7',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
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
  miniBarsWrap: {
    height: 56,
    borderWidth: 1,
    borderColor: '#dbc7a8',
    backgroundColor: '#fffaf1',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  miniBar: {
    flex: 1,
    borderRadius: 2,
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

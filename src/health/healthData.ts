import { NativeModules, Platform } from 'react-native';

export const IOS_SLEEP_STAGE_CODES = {
  inBed: 0,
  asleepUnspecified: 1,
  awake: 2,
  asleepCore: 3,
  asleepDeep: 4,
  asleepREM: 5,
} as const;

export type HealthSleepStage = keyof typeof IOS_SLEEP_STAGE_CODES;
export type HealthSleepStageOrUnknown = HealthSleepStage | 'unknown';

export const HEALTH_SLEEP_STAGE_LABEL_ZH: Record<HealthSleepStageOrUnknown, string> = {
  inBed: '卧床',
  asleepUnspecified: '睡眠',
  awake: '清醒',
  asleepCore: '核心睡眠',
  asleepDeep: '深度睡眠',
  asleepREM: '快速眼动',
  unknown: '未知',
};

export const HEALTH_SLEEP_STAGE_COLOR: Record<HealthSleepStageOrUnknown, string> = {
  inBed: '#d9c2a2',
  asleepUnspecified: '#9c7f5d',
  awake: '#b53f33',
  asleepCore: '#7a5b3e',
  asleepDeep: '#3f2d21',
  asleepREM: '#c48f55',
  unknown: '#9f9f9f',
};

export type HealthTrendPoint = {
  timestamp: string;
  value: number;
  unit: string;
};

export type HealthSleepSample = {
  value: number;
  stage: HealthSleepStageOrUnknown;
  startDate: string;
  endDate: string;
  sourceName?: string;
  sourceBundleId?: string;
};

export type HealthSleepStageMinutes = {
  inBedMinutes?: number;
  asleepUnspecifiedMinutes?: number;
  awakeMinutes?: number;
  asleepCoreMinutes?: number;
  asleepDeepMinutes?: number;
  asleepREMMinutes?: number;
};

export type HealthWorkoutRecord = {
  activityTypeCode?: number;
  activityTypeName?: string;
  startDate?: string;
  endDate?: string;
  durationMinutes?: number;
  totalEnergyKcal?: number;
  totalDistanceKm?: number;
};

export type HealthActivityData = {
  stepsToday?: number;
  distanceWalkingRunningKmToday?: number;
  activeEnergyKcalToday?: number;
  basalEnergyKcalToday?: number;
  flightsClimbedToday?: number;
  exerciseMinutesToday?: number;
  standHoursToday?: number;
  stepsHourlySeriesToday?: HealthTrendPoint[];
  activeEnergyHourlySeriesToday?: HealthTrendPoint[];
  exerciseMinutesHourlySeriesToday?: HealthTrendPoint[];
};

export type HealthSleepData = {
  inBedMinutesLast36h?: number;
  asleepMinutesLast36h?: number;
  awakeMinutesLast36h?: number;
  sampleCountLast36h?: number;
  sleepScore?: number;
  stageMinutesLast36h?: HealthSleepStageMinutes;
  samplesLast36h?: HealthSleepSample[];
};

export type HealthHeartData = {
  latestHeartRateBpm?: number;
  restingHeartRateBpm?: number;
  walkingHeartRateAverageBpm?: number;
  heartRateVariabilityMs?: number;
  vo2MaxMlKgMin?: number;
  atrialFibrillationBurdenPercent?: number;
  systolicBloodPressureMmhg?: number;
  diastolicBloodPressureMmhg?: number;
  heartRateSeriesLast24h?: HealthTrendPoint[];
  heartRateVariabilitySeriesLast7d?: HealthTrendPoint[];
};

export type HealthOxygenData = {
  bloodOxygenPercent?: number;
  bloodOxygenSeriesLast24h?: HealthTrendPoint[];
};

export type HealthMetabolicData = {
  bloodGlucoseMgDl?: number;
  bloodGlucoseSeriesLast7d?: HealthTrendPoint[];
};

export type HealthEnvironmentData = {
  daylightMinutesToday?: number;
  daylightSeriesLast7d?: HealthTrendPoint[];
};

export type HealthBodyData = {
  respiratoryRateBrpm?: number;
  bodyTemperatureCelsius?: number;
  bodyMassKg?: number;
  respiratoryRateSeriesLast7d?: HealthTrendPoint[];
  bodyTemperatureSeriesLast7d?: HealthTrendPoint[];
  bodyMassSeriesLast30d?: HealthTrendPoint[];
};

export type HealthKitAllData = {
  source: 'healthkit' | 'mock';
  authorized: boolean;
  generatedAt: string;
  note?: string;
  activity?: HealthActivityData;
  sleep?: HealthSleepData;
  heart?: HealthHeartData;
  oxygen?: HealthOxygenData;
  metabolic?: HealthMetabolicData;
  environment?: HealthEnvironmentData;
  body?: HealthBodyData;
  workouts?: HealthWorkoutRecord[];
};

export type HealthSnapshot = HealthKitAllData;

type NativeHealthKitManager = {
  isHealthDataAvailable: () => Promise<boolean>;
  requestAuthorization: () => Promise<boolean>;
  getHealthSnapshot: () => Promise<HealthKitAllData>;
};

const { HealthKitManager } = NativeModules as {
  HealthKitManager?: NativeHealthKitManager;
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, digits = 2): number {
  const value = min + Math.random() * (max - min);
  return round(value, digits);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function stageCode(stage: HealthSleepStageOrUnknown): number {
  if (stage === 'unknown') {
    return -1;
  }
  return IOS_SLEEP_STAGE_CODES[stage];
}

function isoDayOffset(base: Date, dayOffset: number, hour = 8, minute = 0): string {
  const date = new Date(base);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function buildHourlySeries(
  now: Date,
  unit: string,
  buildValue: (hour: number, passed: boolean) => number
): HealthTrendPoint[] {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const currentHour = now.getHours();
  const series: HealthTrendPoint[] = [];

  for (let hour = 0; hour < 24; hour += 1) {
    const point = new Date(startOfDay.getTime() + hour * 60 * 60 * 1000);
    const passed = hour <= currentHour;
    series.push({
      timestamp: point.toISOString(),
      value: round(buildValue(hour, passed), 2),
      unit,
    });
  }

  return series;
}

function buildMockActivityData(now: Date): HealthActivityData {
  const stepsHourlySeriesToday = buildHourlySeries(now, 'count', (hour, passed) => {
    if (!passed || hour < 6) {
      return 0;
    }
    if (hour >= 7 && hour <= 9) {
      return randomInt(260, 920);
    }
    if (hour >= 18 && hour <= 22) {
      return randomInt(360, 980);
    }
    if (hour >= 10 && hour <= 17) {
      return randomInt(120, 640);
    }
    return randomInt(30, 280);
  });

  const activeEnergyHourlySeriesToday = stepsHourlySeriesToday.map(point => ({
    timestamp: point.timestamp,
    value: round2(point.value * randomFloat(0.036, 0.056, 4)),
    unit: 'kcal',
  }));

  const exerciseMinutesHourlySeriesToday = stepsHourlySeriesToday.map(point => {
    if (point.value >= 450) {
      return { timestamp: point.timestamp, value: randomInt(6, 14), unit: 'min' };
    }
    if (point.value >= 220) {
      return { timestamp: point.timestamp, value: randomInt(2, 8), unit: 'min' };
    }
    return { timestamp: point.timestamp, value: randomInt(0, 2), unit: 'min' };
  });

  const stepsToday = Math.round(
    stepsHourlySeriesToday.reduce((total, point) => total + point.value, 0)
  );
  const activeEnergyKcalToday = round2(
    activeEnergyHourlySeriesToday.reduce((total, point) => total + point.value, 0)
  );
  const exerciseMinutesToday = Math.round(
    exerciseMinutesHourlySeriesToday.reduce((total, point) => total + point.value, 0)
  );

  const standHoursToday = stepsHourlySeriesToday.filter(point => point.value >= 80).length;
  const distanceWalkingRunningKmToday = round2(
    clamp(stepsToday * randomFloat(0.00063, 0.00079, 6), 0, 24)
  );

  return {
    stepsToday,
    distanceWalkingRunningKmToday,
    activeEnergyKcalToday,
    basalEnergyKcalToday: randomInt(1180, 1920),
    flightsClimbedToday: randomInt(0, 20),
    exerciseMinutesToday,
    standHoursToday,
    stepsHourlySeriesToday,
    activeEnergyHourlySeriesToday,
    exerciseMinutesHourlySeriesToday,
  };
}

function buildMockSleepData(now: Date): HealthSleepData {
  const baseSegments: Array<{ stage: HealthSleepStageOrUnknown; minutes: number }> = [
    { stage: 'inBed', minutes: 14 },
    { stage: 'asleepCore', minutes: 56 },
    { stage: 'asleepDeep', minutes: 44 },
    { stage: 'asleepCore', minutes: 68 },
    { stage: 'asleepREM', minutes: 26 },
    { stage: 'awake', minutes: 6 },
    { stage: 'asleepCore', minutes: 52 },
    { stage: 'asleepDeep', minutes: 32 },
    { stage: 'asleepREM', minutes: 30 },
    { stage: 'awake', minutes: 4 },
    { stage: 'asleepCore', minutes: 44 },
    { stage: 'asleepUnspecified', minutes: 12 },
    { stage: 'asleepREM', minutes: 34 },
    { stage: 'awake', minutes: 8 },
    { stage: 'inBed', minutes: 9 },
  ];

  const totalBaseMinutes = baseSegments.reduce((total, item) => total + item.minutes, 0);
  const targetTotalMinutes = randomInt(420, 560);
  const ratio = targetTotalMinutes / totalBaseMinutes;
  const segments = baseSegments.map(segment => ({
    stage: segment.stage,
    minutes: Math.max(2, Math.round(segment.minutes * ratio + randomInt(-3, 3))),
  }));

  const totalMinutes = segments.reduce((total, item) => total + item.minutes, 0);
  const sleepEnd = new Date(now);
  sleepEnd.setSeconds(0, 0);
  sleepEnd.setHours(randomInt(6, 8), randomInt(0, 45), 0, 0);
  if (sleepEnd.getTime() > now.getTime()) {
    sleepEnd.setDate(sleepEnd.getDate() - 1);
  }
  let cursor = new Date(sleepEnd.getTime() - totalMinutes * 60 * 1000);

  const stageMinutesAccumulator: Required<HealthSleepStageMinutes> = {
    inBedMinutes: 0,
    asleepUnspecifiedMinutes: 0,
    awakeMinutes: 0,
    asleepCoreMinutes: 0,
    asleepDeepMinutes: 0,
    asleepREMMinutes: 0,
  };

  const samplesLast36h: HealthSleepSample[] = [];
  segments.forEach((segment, index) => {
    const start = new Date(cursor);
    const end = new Date(start.getTime() + segment.minutes * 60 * 1000);
    cursor = end;

    switch (segment.stage) {
      case 'inBed':
        stageMinutesAccumulator.inBedMinutes += segment.minutes;
        break;
      case 'asleepUnspecified':
        stageMinutesAccumulator.asleepUnspecifiedMinutes += segment.minutes;
        break;
      case 'awake':
        stageMinutesAccumulator.awakeMinutes += segment.minutes;
        break;
      case 'asleepCore':
        stageMinutesAccumulator.asleepCoreMinutes += segment.minutes;
        break;
      case 'asleepDeep':
        stageMinutesAccumulator.asleepDeepMinutes += segment.minutes;
        break;
      case 'asleepREM':
        stageMinutesAccumulator.asleepREMMinutes += segment.minutes;
        break;
      default:
        break;
    }

    samplesLast36h.push({
      value: stageCode(segment.stage),
      stage: segment.stage,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      sourceName: index % 2 === 0 ? 'Apple Watch（模拟）' : 'iPhone（模拟）',
      sourceBundleId: index % 2 === 0 ? 'com.apple.health.watch' : 'com.apple.health',
    });
  });

  const asleepMinutesLast36h =
    stageMinutesAccumulator.asleepUnspecifiedMinutes +
    stageMinutesAccumulator.asleepCoreMinutes +
    stageMinutesAccumulator.asleepDeepMinutes +
    stageMinutesAccumulator.asleepREMMinutes;

  const awakeMinutesLast36h = stageMinutesAccumulator.awakeMinutes;
  const inBedMinutesLast36h = stageMinutesAccumulator.inBedMinutes;
  const qualityBase =
    95 -
    Math.abs(asleepMinutesLast36h - 450) * 0.08 -
    awakeMinutesLast36h * 0.45 +
    stageMinutesAccumulator.asleepDeepMinutes * 0.03 +
    stageMinutesAccumulator.asleepREMMinutes * 0.02;
  const sleepScore = Math.round(clamp(qualityBase, 45, 98));

  return {
    inBedMinutesLast36h: round(inBedMinutesLast36h, 1),
    asleepMinutesLast36h: round(asleepMinutesLast36h, 1),
    awakeMinutesLast36h: round(awakeMinutesLast36h, 1),
    sampleCountLast36h: samplesLast36h.length,
    sleepScore,
    stageMinutesLast36h: {
      inBedMinutes: round(stageMinutesAccumulator.inBedMinutes, 1),
      asleepUnspecifiedMinutes: round(stageMinutesAccumulator.asleepUnspecifiedMinutes, 1),
      awakeMinutes: round(stageMinutesAccumulator.awakeMinutes, 1),
      asleepCoreMinutes: round(stageMinutesAccumulator.asleepCoreMinutes, 1),
      asleepDeepMinutes: round(stageMinutesAccumulator.asleepDeepMinutes, 1),
      asleepREMMinutes: round(stageMinutesAccumulator.asleepREMMinutes, 1),
    },
    samplesLast36h,
  };
}

function buildMockHeartData(now: Date): HealthHeartData {
  const heartRateSeriesLast24h = buildHourlySeries(now, 'bpm', (hour, passed) => {
    if (!passed) {
      return 0;
    }
    if (hour <= 5) {
      return randomInt(52, 66);
    }
    if (hour <= 9) {
      return randomInt(66, 96);
    }
    if (hour <= 18) {
      return randomInt(62, 104);
    }
    return randomInt(58, 92);
  });

  const validHeartSeries = heartRateSeriesLast24h.filter(point => point.value > 0);
  const latestHeartRateBpm = validHeartSeries[validHeartSeries.length - 1]?.value;
  const restingHeartRateBpm = validHeartSeries.length
    ? Math.min(...validHeartSeries.map(point => point.value))
    : undefined;

  const walkingHeartRateAverageBpm = round(
    validHeartSeries
      .filter((_, index) => index % 3 !== 0)
      .reduce((total, point) => total + point.value, 0) / Math.max(validHeartSeries.length - 8, 1),
    1
  );

  const heartRateVariabilitySeriesLast7d = Array.from({ length: 7 }, (_, index) => ({
    timestamp: isoDayOffset(now, -(6 - index), 7, 30),
    value: randomInt(20, 72),
    unit: 'ms',
  }));

  const heartRateVariabilityMs =
    heartRateVariabilitySeriesLast7d[heartRateVariabilitySeriesLast7d.length - 1]?.value;

  return {
    latestHeartRateBpm: latestHeartRateBpm ? round(latestHeartRateBpm, 1) : undefined,
    restingHeartRateBpm,
    walkingHeartRateAverageBpm,
    heartRateVariabilityMs,
    vo2MaxMlKgMin: randomFloat(28, 48, 1),
    atrialFibrillationBurdenPercent: randomFloat(0, 1.2, 2),
    systolicBloodPressureMmhg: randomInt(102, 134),
    diastolicBloodPressureMmhg: randomInt(62, 86),
    heartRateSeriesLast24h,
    heartRateVariabilitySeriesLast7d,
  };
}

function buildMockOxygenData(now: Date): HealthOxygenData {
  const bloodOxygenSeriesLast24h = buildHourlySeries(now, '%', (_hour, passed) =>
    passed ? randomFloat(95.2, 99.8, 1) : 0
  );
  const valid = bloodOxygenSeriesLast24h.filter(point => point.value > 0);
  return {
    bloodOxygenPercent: valid[valid.length - 1]?.value,
    bloodOxygenSeriesLast24h,
  };
}

function buildMockMetabolicData(now: Date): HealthMetabolicData {
  const points: HealthTrendPoint[] = [];
  for (let day = 6; day >= 0; day -= 1) {
    points.push({
      timestamp: isoDayOffset(now, -day, 7, randomInt(0, 40)),
      value: randomFloat(82, 102, 1),
      unit: 'mg/dL',
    });
    points.push({
      timestamp: isoDayOffset(now, -day, 20, randomInt(0, 40)),
      value: randomFloat(90, 132, 1),
      unit: 'mg/dL',
    });
  }

  return {
    bloodGlucoseMgDl: points[points.length - 1]?.value,
    bloodGlucoseSeriesLast7d: points,
  };
}

function buildMockEnvironmentData(now: Date): HealthEnvironmentData {
  const daylightSeriesLast7d = Array.from({ length: 7 }, (_, index) => ({
    timestamp: isoDayOffset(now, -(6 - index), 21, 0),
    value: randomInt(22, 210),
    unit: 'min',
  }));
  return {
    daylightMinutesToday: daylightSeriesLast7d[daylightSeriesLast7d.length - 1]?.value,
    daylightSeriesLast7d,
  };
}

function buildMockBodyData(now: Date): HealthBodyData {
  const respiratoryRateSeriesLast7d = Array.from({ length: 7 }, (_, index) => ({
    timestamp: isoDayOffset(now, -(6 - index), 8, 10),
    value: randomFloat(12, 19, 1),
    unit: 'brpm',
  }));
  const bodyTemperatureSeriesLast7d = Array.from({ length: 7 }, (_, index) => ({
    timestamp: isoDayOffset(now, -(6 - index), 8, 12),
    value: randomFloat(36.2, 37.2, 2),
    unit: 'degC',
  }));
  const baseWeight = randomFloat(48, 86, 1);
  const bodyMassSeriesLast30d = Array.from({ length: 30 }, (_, index) => ({
    timestamp: isoDayOffset(now, -(29 - index), 7, 50),
    value: round(baseWeight + Math.sin(index / 5) * 0.4 + randomFloat(-0.25, 0.25, 2), 2),
    unit: 'kg',
  }));

  return {
    respiratoryRateBrpm: respiratoryRateSeriesLast7d[respiratoryRateSeriesLast7d.length - 1]?.value,
    bodyTemperatureCelsius:
      bodyTemperatureSeriesLast7d[bodyTemperatureSeriesLast7d.length - 1]?.value,
    bodyMassKg: bodyMassSeriesLast30d[bodyMassSeriesLast30d.length - 1]?.value,
    respiratoryRateSeriesLast7d,
    bodyTemperatureSeriesLast7d,
    bodyMassSeriesLast30d,
  };
}

function buildMockWorkouts(now: Date): HealthWorkoutRecord[] {
  const count = randomInt(2, 6);
  const workouts: HealthWorkoutRecord[] = [];
  const activityTypes = [
    { code: 37, name: 'walk' },
    { code: 13, name: 'run' },
    { code: 24, name: 'cycle' },
    { code: 57, name: 'yoga' },
    { code: 63, name: 'strength' },
  ];

  for (let i = 0; i < count; i += 1) {
    const durationMinutes = randomInt(18, 85);
    const end = new Date(now.getTime() - i * randomInt(20, 60) * 60 * 60 * 1000);
    const start = new Date(end.getTime() - durationMinutes * 60 * 1000);
    const distanceKm = round2(durationMinutes * (Math.random() * 0.11 + 0.05));
    const activityType = activityTypes[randomInt(0, activityTypes.length - 1)];
    workouts.push({
      activityTypeCode: activityType.code,
      activityTypeName: activityType.name,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      durationMinutes,
      totalEnergyKcal: randomInt(120, 680),
      totalDistanceKm: activityType.name === 'strength' ? undefined : distanceKm,
    });
  }

  return workouts;
}

function buildMockSnapshot(): HealthKitAllData {
  const now = new Date();
  const activity = buildMockActivityData(now);
  const sleep = buildMockSleepData(now);
  const heart = buildMockHeartData(now);
  const oxygen = buildMockOxygenData(now);
  const metabolic = buildMockMetabolicData(now);
  const environment = buildMockEnvironmentData(now);
  const body = buildMockBodyData(now);

  return {
    source: 'mock',
    authorized: true,
    generatedAt: now.toISOString(),
    note: 'Mock data generated with HealthKit-aligned units and sleep stage samples',
    activity,
    sleep,
    heart,
    oxygen,
    metabolic,
    environment,
    body,
    workouts: buildMockWorkouts(now),
  };
}

export async function authorizeHealthKit(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }

  if (!HealthKitManager) {
    return false;
  }

  const isAvailable = await HealthKitManager.isHealthDataAvailable();
  if (!isAvailable) {
    return false;
  }

  return HealthKitManager.requestAuthorization();
}

export async function loadHealthSnapshot(useMock = false): Promise<HealthKitAllData> {
  if (useMock || Platform.OS !== 'ios') {
    return buildMockSnapshot();
  }

  if (!HealthKitManager) {
    return {
      ...buildMockSnapshot(),
      note: 'HealthKit native module is unavailable, fallback to mock data',
    };
  }

  const isAvailable = await HealthKitManager.isHealthDataAvailable();
  if (!isAvailable) {
    return {
      ...buildMockSnapshot(),
      source: 'mock',
      authorized: false,
      note: 'Health data is unavailable on this device',
    };
  }

  const authorized = await HealthKitManager.requestAuthorization();
  if (!authorized) {
    throw new Error('未授予健康数据读取权限');
  }

  const nativeSnapshot = await HealthKitManager.getHealthSnapshot();
  return {
    source: 'healthkit',
    authorized: Boolean(nativeSnapshot?.authorized ?? true),
    generatedAt: nativeSnapshot?.generatedAt ?? new Date().toISOString(),
    note: nativeSnapshot?.note,
    activity: nativeSnapshot?.activity,
    sleep: nativeSnapshot?.sleep,
    heart: nativeSnapshot?.heart,
    oxygen: nativeSnapshot?.oxygen,
    metabolic: nativeSnapshot?.metabolic,
    environment: nativeSnapshot?.environment,
    body: nativeSnapshot?.body,
    workouts: nativeSnapshot?.workouts ?? [],
  };
}

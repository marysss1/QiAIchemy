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

export type HealthSleepApneaRiskLevel = 'none' | 'watch' | 'high' | 'unknown';

export type HealthSleepApneaData = {
  eventCountLast30d?: number;
  durationMinutesLast30d?: number;
  latestEventAt?: string;
  riskLevel?: HealthSleepApneaRiskLevel;
  reminder?: string;
};

export type HealthWorkoutRecord = {
  activityTypeCode?: number;
  activityTypeName?: string;
  startDate?: string;
  endDate?: string;
  durationMinutes?: number;
  totalEnergyKcal?: number;
  totalDistanceKm?: number;
  averageHeartRateBpm?: number;
  maxHeartRateBpm?: number;
  sourceDevice?: string;
};

export type HealthActivityData = {
  stepsToday?: number;
  distanceWalkingRunningKmToday?: number;
  activeEnergyKcalToday?: number;
  activeEnergyGoalKcal?: number;
  basalEnergyKcalToday?: number;
  flightsClimbedToday?: number;
  exerciseMinutesToday?: number;
  exerciseGoalMinutes?: number;
  standHoursToday?: number;
  standGoalHours?: number;
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
  sleepScoreSource?: 'today' | 'latestAvailable';
  sleepScoreWindowStart?: string;
  sleepScoreWindowEnd?: string;
  sleepScoreFallbackUsed?: boolean;
  stageMinutesLast36h?: HealthSleepStageMinutes;
  samplesLast36h?: HealthSleepSample[];
  apnea?: HealthSleepApneaData;
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

export type HealthSnapshotSource = 'healthkit' | 'huawei_health' | 'mock';

export type HuaweiSleepStage = 'deep' | 'light' | 'rem' | 'awake' | 'nap' | 'unknown';

export type HuaweiSleepSegment = {
  stage: HuaweiSleepStage;
  startDate: string;
  endDate: string;
  durationMinutes?: number;
};

export type HuaweiBloodPressurePoint = {
  timestamp: string;
  systolicMmhg: number;
  diastolicMmhg: number;
  unit?: string;
};

export type HealthHuaweiData = {
  deviceModel?: string;
  appVersion?: string;
  dataWindowStart?: string;
  dataWindowEnd?: string;
  activity?: {
    stepsToday?: number;
    distanceKmToday?: number;
    caloriesKcalToday?: number;
    floorsClimbedToday?: number;
    activeMinutesToday?: number;
    moderateToVigorousMinutesToday?: number;
    standingHoursToday?: number;
    stepsSeriesToday?: HealthTrendPoint[];
    caloriesSeriesToday?: HealthTrendPoint[];
    activeMinutesSeriesToday?: HealthTrendPoint[];
  };
  sleep?: {
    asleepMinutesLast24h?: number;
    deepSleepMinutesLast24h?: number;
    lightSleepMinutesLast24h?: number;
    remSleepMinutesLast24h?: number;
    awakeMinutesLast24h?: number;
    napMinutesLast24h?: number;
    sleepScore?: number;
    bedTime?: string;
    wakeTime?: string;
    sleepSegmentsLast24h?: HuaweiSleepSegment[];
  };
  heart?: {
    latestHeartRateBpm?: number;
    restingHeartRateBpm?: number;
    maxHeartRateBpmLast24h?: number;
    minHeartRateBpmLast24h?: number;
    heartRateWarning?: string;
    heartRateSeriesLast24h?: HealthTrendPoint[];
  };
  oxygen?: {
    latestSpO2Percent?: number;
    minSpO2PercentLast24h?: number;
    spO2SeriesLast24h?: HealthTrendPoint[];
  };
  stress?: {
    latestStressScore?: number;
    averageStressScoreToday?: number;
    hrvMs?: number;
    stressSeriesLast24h?: HealthTrendPoint[];
  };
  body?: {
    weightKg?: number;
    bmi?: number;
    bodyFatPercent?: number;
    skeletalMuscleKg?: number;
    bodyWaterPercent?: number;
    visceralFatLevel?: number;
  };
  bloodPressure?: {
    latestSystolicMmhg?: number;
    latestDiastolicMmhg?: number;
    bloodPressureSeriesLast30d?: HuaweiBloodPressurePoint[];
  };
  workouts?: HealthWorkoutRecord[];
};

export type HealthKitAllData = {
  source: HealthSnapshotSource;
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
  huawei?: HealthHuaweiData;
  workouts?: HealthWorkoutRecord[];
};

export type HealthSnapshot = HealthKitAllData;

type NativeHealthKitManager = {
  isHealthDataAvailable: () => Promise<boolean>;
  requestAuthorization: () => Promise<boolean>;
  getHealthSnapshot: () => Promise<HealthKitAllData>;
};

type NativeHuaweiHealthManager = {
  isHealthDataAvailable?: () => Promise<boolean>;
  requestAuthorization?: () => Promise<boolean>;
  getHealthSnapshot: () => Promise<HealthKitAllData>;
};

const { HealthKitManager, HuaweiHealthManager } = NativeModules as {
  HealthKitManager?: NativeHealthKitManager;
  HuaweiHealthManager?: NativeHuaweiHealthManager;
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(message));
      }, timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

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

function toHuaweiSleepStage(stage: HealthSleepStageOrUnknown): HuaweiSleepStage {
  switch (stage) {
    case 'asleepDeep':
      return 'deep';
    case 'asleepREM':
      return 'rem';
    case 'awake':
      return 'awake';
    case 'inBed':
      return 'nap';
    case 'asleepCore':
    case 'asleepUnspecified':
      return 'light';
    default:
      return 'unknown';
  }
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
    activeEnergyGoalKcal: 600,
    basalEnergyKcalToday: randomInt(1180, 1920),
    flightsClimbedToday: randomInt(0, 20),
    exerciseMinutesToday,
    exerciseGoalMinutes: 45,
    standHoursToday,
    standGoalHours: 12,
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

  const apneaSeed = Math.random();
  const apneaEventCountLast30d =
    apneaSeed < 0.68 ? 0 : apneaSeed < 0.9 ? randomInt(1, 2) : randomInt(3, 7);
  const apneaDurationMinutesLast30d =
    apneaEventCountLast30d > 0
      ? round(apneaEventCountLast30d * randomFloat(1.5, 6.5, 1), 1)
      : 0;
  const apneaRiskLevel: HealthSleepApneaRiskLevel =
    apneaEventCountLast30d === 0
      ? 'none'
      : apneaEventCountLast30d <= 2 && apneaDurationMinutesLast30d < 20
        ? 'watch'
        : 'high';
  const apneaReminder =
    apneaRiskLevel === 'none'
      ? '近30天未检测到睡眠呼吸暂停事件；若存在打鼾、晨起头痛或白天嗜睡，建议继续观察。'
      : apneaRiskLevel === 'watch'
        ? `近30天检测到 ${apneaEventCountLast30d} 次睡眠呼吸暂停事件，建议规律作息并持续追踪。`
        : `近30天检测到 ${apneaEventCountLast30d} 次睡眠呼吸暂停事件，建议到睡眠专科进一步评估。`;
  const latestApneaEventAt =
    apneaEventCountLast30d > 0
      ? new Date(now.getTime() - randomInt(1, 25) * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

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
    apnea: {
      eventCountLast30d: apneaEventCountLast30d,
      durationMinutesLast30d: apneaDurationMinutesLast30d,
      latestEventAt: latestApneaEventAt,
      riskLevel: apneaRiskLevel,
      reminder: apneaReminder,
    },
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
    passed ? randomInt(95, 100) : 0
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
    const fastingMmol = randomFloat(4.3, 6.2, 1);
    const eveningMmol = randomFloat(5.2, 10.8, 1);
    points.push({
      timestamp: isoDayOffset(now, -day, 7, randomInt(0, 40)),
      value: fastingMmol,
      unit: 'mmol/L',
    });
    points.push({
      timestamp: isoDayOffset(now, -day, 20, randomInt(0, 40)),
      value: eveningMmol,
      unit: 'mmol/L',
    });
  }

  const latestMmol = points[points.length - 1]?.value;
  return {
    bloodGlucoseMgDl: latestMmol ? round(latestMmol * 18, 1) : undefined,
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

export function buildAlertingMockSnapshot(): HealthKitAllData {
  const snapshot = buildMockSnapshot();
  const now = new Date();

  return {
    ...snapshot,
    generatedAt: now.toISOString(),
    note: 'Mock abnormal data generated for simulator proactive health review',
    activity: {
      ...snapshot.activity,
      stepsToday: 1280,
      activeEnergyKcalToday: 186,
      activeEnergyGoalKcal: 480,
      exerciseMinutesToday: 8,
      exerciseGoalMinutes: 45,
      standHoursToday: 3,
      standGoalHours: 12,
    },
    sleep: {
      ...snapshot.sleep,
      asleepMinutesLast36h: 278,
      sleepScore: 32,
      apnea: {
        eventCountLast30d: 4,
        durationMinutesLast30d: 31,
        latestEventAt: new Date(now.getTime() - 7 * 60 * 60 * 1000).toISOString(),
        riskLevel: 'watch',
        reminder: '夜间呼吸暂停样本提示需进一步关注',
      },
    },
    heart: {
      ...snapshot.heart,
      restingHeartRateBpm: 84,
      latestHeartRateBpm: 108,
      heartRateVariabilityMs: 18,
      vo2MaxMlKgMin: 29,
    },
    oxygen: {
      ...snapshot.oxygen,
      bloodOxygenPercent: 93,
    },
    metabolic: {
      ...snapshot.metabolic,
      bloodGlucoseMgDl: 162,
    },
    environment: {
      ...snapshot.environment,
      daylightMinutesToday: 8,
    },
    huawei: {
      ...snapshot.huawei,
      body: {
        ...snapshot.huawei?.body,
        bmi: 26.8,
      },
    },
  };
}

export async function loadAlertingMockHealthSnapshot(): Promise<HealthKitAllData> {
  return buildAlertingMockSnapshot();
}

function buildHuaweiHealthFallbackSnapshot(): HealthKitAllData {
  const now = new Date();
  const activity = buildMockActivityData(now);
  const sleep = buildMockSleepData(now);
  const heart = buildMockHeartData(now);
  const oxygen = buildMockOxygenData(now);
  const metabolic = buildMockMetabolicData(now);
  const environment = buildMockEnvironmentData(now);
  const body = buildMockBodyData(now);
  const workouts = buildMockWorkouts(now).map(item => ({
    ...item,
    averageHeartRateBpm: randomInt(98, 146),
    maxHeartRateBpm: randomInt(130, 178),
    sourceDevice: 'HUAWEI WATCH',
  }));

  const last24hMs = now.getTime() - 24 * 60 * 60 * 1000;
  const sleepSegmentsLast24h: HuaweiSleepSegment[] = (sleep.samplesLast36h ?? [])
    .filter(sample => {
      const endMs = new Date(sample.endDate).getTime();
      return Number.isFinite(endMs) && endMs >= last24hMs;
    })
    .slice(-180)
    .map(sample => {
      const startMs = new Date(sample.startDate).getTime();
      const endMs = new Date(sample.endDate).getTime();
      return {
        stage: toHuaweiSleepStage(sample.stage),
        startDate: sample.startDate,
        endDate: sample.endDate,
        durationMinutes: Number.isFinite(startMs) && Number.isFinite(endMs) ? round(Math.max(0, (endMs - startMs) / 60000), 1) : undefined,
      };
    });

  const stressSeriesLast24h = buildHourlySeries(now, 'score', (hour, passed) => {
    if (!passed) {
      return 0;
    }
    if (hour >= 9 && hour <= 18) {
      return randomInt(35, 78);
    }
    if (hour <= 6) {
      return randomInt(12, 30);
    }
    return randomInt(20, 56);
  }).filter(point => point.value > 0);

  const bloodPressureSeriesLast30d: HuaweiBloodPressurePoint[] = Array.from({ length: 14 }, (_, index) => {
    const timestamp = isoDayOffset(now, -(13 - index), 8, 30);
    return {
      timestamp,
      systolicMmhg: randomInt(108, 134),
      diastolicMmhg: randomInt(67, 88),
      unit: 'mmHg',
    };
  });

  const latestBloodPressure = bloodPressureSeriesLast30d[bloodPressureSeriesLast30d.length - 1];
  const latestStressScore = stressSeriesLast24h[stressSeriesLast24h.length - 1]?.value;
  const avgStressScore =
    stressSeriesLast24h.length > 0
      ? round(stressSeriesLast24h.reduce((sum, item) => sum + item.value, 0) / stressSeriesLast24h.length, 1)
      : undefined;
  const heartRateWarning =
    typeof heart.latestHeartRateBpm === 'number'
      ? heart.latestHeartRateBpm >= 130
        ? 'high'
        : heart.latestHeartRateBpm >= 115
        ? 'watch'
        : heart.latestHeartRateBpm <= 45
        ? 'low'
        : undefined
      : undefined;

  const huawei: HealthHuaweiData = {
    deviceModel: 'HUAWEI WATCH',
    appVersion: 'android-fallback',
    dataWindowStart: new Date(last24hMs).toISOString(),
    dataWindowEnd: now.toISOString(),
    activity: {
      stepsToday: activity.stepsToday,
      distanceKmToday: activity.distanceWalkingRunningKmToday,
      caloriesKcalToday: activity.activeEnergyKcalToday,
      floorsClimbedToday: activity.flightsClimbedToday,
      activeMinutesToday: activity.exerciseMinutesToday,
      moderateToVigorousMinutesToday: activity.exerciseMinutesToday,
      standingHoursToday: activity.standHoursToday,
      stepsSeriesToday: activity.stepsHourlySeriesToday,
      caloriesSeriesToday: activity.activeEnergyHourlySeriesToday,
      activeMinutesSeriesToday: activity.exerciseMinutesHourlySeriesToday,
    },
    sleep: {
      asleepMinutesLast24h: sleep.asleepMinutesLast36h,
      deepSleepMinutesLast24h: sleep.stageMinutesLast36h?.asleepDeepMinutes,
      lightSleepMinutesLast24h:
        (sleep.stageMinutesLast36h?.asleepCoreMinutes ?? 0) + (sleep.stageMinutesLast36h?.asleepUnspecifiedMinutes ?? 0),
      remSleepMinutesLast24h: sleep.stageMinutesLast36h?.asleepREMMinutes,
      awakeMinutesLast24h: sleep.awakeMinutesLast36h,
      napMinutesLast24h: randomInt(0, 35),
      sleepScore: sleep.sleepScore,
      bedTime: sleepSegmentsLast24h[0]?.startDate,
      wakeTime: sleepSegmentsLast24h[sleepSegmentsLast24h.length - 1]?.endDate,
      sleepSegmentsLast24h,
    },
    heart: {
      latestHeartRateBpm: heart.latestHeartRateBpm,
      restingHeartRateBpm: heart.restingHeartRateBpm,
      maxHeartRateBpmLast24h: Math.max(
        heart.latestHeartRateBpm ?? 0,
        ...((heart.heartRateSeriesLast24h ?? []).map(item => item.value))
      ),
      minHeartRateBpmLast24h:
        heart.heartRateSeriesLast24h && heart.heartRateSeriesLast24h.length > 0
          ? Math.min(...heart.heartRateSeriesLast24h.map(item => item.value))
          : undefined,
      heartRateWarning,
      heartRateSeriesLast24h: heart.heartRateSeriesLast24h,
    },
    oxygen: {
      latestSpO2Percent: oxygen.bloodOxygenPercent,
      minSpO2PercentLast24h:
        oxygen.bloodOxygenSeriesLast24h && oxygen.bloodOxygenSeriesLast24h.length > 0
          ? Math.min(...oxygen.bloodOxygenSeriesLast24h.map(item => item.value))
          : undefined,
      spO2SeriesLast24h: oxygen.bloodOxygenSeriesLast24h,
    },
    stress: {
      latestStressScore,
      averageStressScoreToday: avgStressScore,
      hrvMs: heart.heartRateVariabilityMs,
      stressSeriesLast24h,
    },
    body: {
      weightKg: body.bodyMassKg,
      bmi: body.bodyMassKg ? round(body.bodyMassKg / (1.72 * 1.72), 1) : undefined,
      bodyFatPercent: randomFloat(16.8, 25.6, 1),
      skeletalMuscleKg: randomFloat(28.2, 36.8, 1),
      bodyWaterPercent: randomFloat(51.2, 60.7, 1),
      visceralFatLevel: randomFloat(5.2, 11.3, 1),
    },
    bloodPressure: {
      latestSystolicMmhg: latestBloodPressure?.systolicMmhg,
      latestDiastolicMmhg: latestBloodPressure?.diastolicMmhg,
      bloodPressureSeriesLast30d,
    },
    workouts,
  };

  return {
    source: 'huawei_health',
    authorized: true,
    generatedAt: now.toISOString(),
    note: 'Android HuaweiHealth native module unavailable, returned Huawei-aligned fallback snapshot',
    activity,
    sleep,
    heart,
    oxygen,
    metabolic,
    environment,
    body,
    huawei,
    workouts,
  };
}

type RawHuaweiSnapshot = Partial<HealthKitAllData> & { source?: string };

function normalizeHuaweiSnapshot(rawSnapshot: RawHuaweiSnapshot): HealthKitAllData {
  const nowIso = new Date().toISOString();
  const sourceRaw = typeof rawSnapshot.source === 'string' ? rawSnapshot.source.trim().toLowerCase() : 'huawei_health';
  const normalizedSource: HealthSnapshotSource = sourceRaw === 'mock' ? 'mock' : 'huawei_health';
  const fallbackNow = new Date();

  const fallbackHuaweiData: HealthHuaweiData = {
    dataWindowStart: new Date(fallbackNow.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    dataWindowEnd: fallbackNow.toISOString(),
    activity: rawSnapshot.activity
      ? {
          stepsToday: rawSnapshot.activity.stepsToday,
          distanceKmToday: rawSnapshot.activity.distanceWalkingRunningKmToday,
          caloriesKcalToday: rawSnapshot.activity.activeEnergyKcalToday,
          floorsClimbedToday: rawSnapshot.activity.flightsClimbedToday,
          activeMinutesToday: rawSnapshot.activity.exerciseMinutesToday,
          moderateToVigorousMinutesToday: rawSnapshot.activity.exerciseMinutesToday,
          standingHoursToday: rawSnapshot.activity.standHoursToday,
          stepsSeriesToday: rawSnapshot.activity.stepsHourlySeriesToday,
          caloriesSeriesToday: rawSnapshot.activity.activeEnergyHourlySeriesToday,
          activeMinutesSeriesToday: rawSnapshot.activity.exerciseMinutesHourlySeriesToday,
        }
      : undefined,
    sleep: rawSnapshot.sleep
      ? {
          asleepMinutesLast24h: rawSnapshot.sleep.asleepMinutesLast36h,
          deepSleepMinutesLast24h: rawSnapshot.sleep.stageMinutesLast36h?.asleepDeepMinutes,
          lightSleepMinutesLast24h:
            (rawSnapshot.sleep.stageMinutesLast36h?.asleepCoreMinutes ?? 0) +
            (rawSnapshot.sleep.stageMinutesLast36h?.asleepUnspecifiedMinutes ?? 0),
          remSleepMinutesLast24h: rawSnapshot.sleep.stageMinutesLast36h?.asleepREMMinutes,
          awakeMinutesLast24h: rawSnapshot.sleep.awakeMinutesLast36h,
          sleepScore: rawSnapshot.sleep.sleepScore,
          sleepSegmentsLast24h: rawSnapshot.sleep.samplesLast36h?.map(sample => ({
            stage: toHuaweiSleepStage(sample.stage),
            startDate: sample.startDate,
            endDate: sample.endDate,
            durationMinutes: round(Math.max(0, (new Date(sample.endDate).getTime() - new Date(sample.startDate).getTime()) / 60000), 1),
          })),
        }
      : undefined,
    heart: rawSnapshot.heart
      ? {
          latestHeartRateBpm: rawSnapshot.heart.latestHeartRateBpm,
          restingHeartRateBpm: rawSnapshot.heart.restingHeartRateBpm,
          heartRateSeriesLast24h: rawSnapshot.heart.heartRateSeriesLast24h,
        }
      : undefined,
    oxygen: rawSnapshot.oxygen
      ? {
          latestSpO2Percent: rawSnapshot.oxygen.bloodOxygenPercent,
          spO2SeriesLast24h: rawSnapshot.oxygen.bloodOxygenSeriesLast24h,
        }
      : undefined,
    stress:
      typeof rawSnapshot.heart?.heartRateVariabilityMs === 'number'
        ? {
            hrvMs: rawSnapshot.heart.heartRateVariabilityMs,
          }
        : undefined,
    body: rawSnapshot.body
      ? {
          weightKg: rawSnapshot.body.bodyMassKg,
        }
      : undefined,
    bloodPressure:
      typeof rawSnapshot.heart?.systolicBloodPressureMmhg === 'number' &&
      typeof rawSnapshot.heart?.diastolicBloodPressureMmhg === 'number'
        ? {
            latestSystolicMmhg: rawSnapshot.heart.systolicBloodPressureMmhg,
            latestDiastolicMmhg: rawSnapshot.heart.diastolicBloodPressureMmhg,
          }
        : undefined,
    workouts: rawSnapshot.workouts,
  };

  return {
    source: normalizedSource,
    authorized: Boolean(rawSnapshot.authorized ?? true),
    generatedAt: rawSnapshot.generatedAt ?? nowIso,
    note: rawSnapshot.note,
    activity: rawSnapshot.activity,
    sleep: rawSnapshot.sleep,
    heart: rawSnapshot.heart,
    oxygen: rawSnapshot.oxygen,
    metabolic: rawSnapshot.metabolic,
    environment: rawSnapshot.environment,
    body: rawSnapshot.body,
    huawei: rawSnapshot.huawei ?? fallbackHuaweiData,
    workouts: rawSnapshot.workouts ?? rawSnapshot.huawei?.workouts ?? [],
  };
}

async function loadHuaweiSnapshotForAndroid(): Promise<HealthKitAllData> {
  if (!HuaweiHealthManager?.getHealthSnapshot) {
    return buildHuaweiHealthFallbackSnapshot();
  }

  const isAvailable = HuaweiHealthManager.isHealthDataAvailable
    ? await withTimeout(HuaweiHealthManager.isHealthDataAvailable(), 5000, '华为健康可用性检查超时，请重试')
    : true;
  if (!isAvailable) {
    throw new Error('当前设备不支持华为健康数据读取');
  }

  const authorized = HuaweiHealthManager.requestAuthorization
    ? await withTimeout(HuaweiHealthManager.requestAuthorization(), 15000, '华为健康授权超时，请在系统设置中确认后重试')
    : true;
  if (!authorized) {
    throw new Error('未授予华为健康数据读取权限');
  }

  try {
    const nativeSnapshot = await withTimeout(
      HuaweiHealthManager.getHealthSnapshot(),
      25000,
      '华为健康数据读取超时，请稍后重试'
    );
    return normalizeHuaweiSnapshot(nativeSnapshot);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error ?? '');
    if (/no data available for the specified predicate/i.test(rawMessage)) {
      return normalizeHuaweiSnapshot({
        source: 'huawei_health',
        authorized: true,
        generatedAt: new Date().toISOString(),
        note: '部分华为健康指标在当前时间范围暂无数据，已返回可用数据字段',
      });
    }
    throw error;
  }
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
  if (useMock) {
    return buildMockSnapshot();
  }

  if (Platform.OS === 'android') {
    return loadHuaweiSnapshotForAndroid();
  }

  if (Platform.OS !== 'ios') {
    return buildMockSnapshot();
  }

  if (!HealthKitManager) {
    throw new Error('HealthKit 原生模块不可用，请确认 iOS 工程已正确集成');
  }

  const isAvailable = await withTimeout(
    HealthKitManager.isHealthDataAvailable(),
    5000,
    'HealthKit 可用性检查超时，请重试'
  );
  if (!isAvailable) {
    throw new Error('当前设备不支持 HealthKit 数据读取');
  }

  const authorized = await withTimeout(
    HealthKitManager.requestAuthorization(),
    15000,
    'HealthKit 授权超时，请在系统设置中确认后重试'
  );
  if (!authorized) {
    throw new Error('未授予健康数据读取权限');
  }

  try {
    const nativeSnapshot = await withTimeout(
      HealthKitManager.getHealthSnapshot(),
      25000,
      'HealthKit 数据读取超时，请稍后重试'
    );
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
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error ?? '');
    if (/no data available for the specified predicate/i.test(rawMessage)) {
      return {
        source: 'healthkit',
        authorized: true,
        generatedAt: new Date().toISOString(),
        note: '部分健康指标在当前时间范围暂无数据，已返回可用数据字段',
        workouts: [],
      };
    }
    throw error;
  }
}

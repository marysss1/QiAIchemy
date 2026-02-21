import { NativeModules, Platform } from 'react-native';

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
};

export type HealthSleepData = {
  inBedMinutesLast36h?: number;
  asleepMinutesLast36h?: number;
  awakeMinutesLast36h?: number;
  sampleCountLast36h?: number;
  sleepScore?: number;
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
};

export type HealthOxygenData = {
  bloodOxygenPercent?: number;
};

export type HealthMetabolicData = {
  bloodGlucoseMgDl?: number;
};

export type HealthEnvironmentData = {
  daylightMinutesToday?: number;
};

export type HealthBodyData = {
  respiratoryRateBrpm?: number;
  bodyTemperatureCelsius?: number;
  bodyMassKg?: number;
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildMockWorkouts(now: Date): HealthWorkoutRecord[] {
  const count = randomInt(2, 6);
  const workouts: HealthWorkoutRecord[] = [];

  for (let i = 0; i < count; i += 1) {
    const durationMinutes = randomInt(18, 85);
    const end = new Date(now.getTime() - i * randomInt(20, 60) * 60 * 60 * 1000);
    const start = new Date(end.getTime() - durationMinutes * 60 * 1000);
    const distanceKm = round2(durationMinutes * (Math.random() * 0.11 + 0.05));
    workouts.push({
      activityTypeCode: 37,
      activityTypeName: 'walk',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      durationMinutes,
      totalEnergyKcal: randomInt(120, 680),
      totalDistanceKm: distanceKm,
    });
  }

  return workouts;
}

function buildMockSnapshot(): HealthKitAllData {
  const now = new Date();
  const hour = now.getHours();
  const dayProgress = Math.min(Math.max(hour / 24, 0), 1);
  const stepBase = 1200 + dayProgress * 8800;

  return {
    source: 'mock',
    authorized: true,
    generatedAt: now.toISOString(),
    note: 'Mock data',
    activity: {
      stepsToday: Math.max(Math.round(stepBase + (Math.random() - 0.5) * 900), 0),
      distanceWalkingRunningKmToday: round2(1.1 + dayProgress * 8.4 + (Math.random() - 0.5) * 0.9),
      activeEnergyKcalToday: randomInt(260, 980),
      basalEnergyKcalToday: randomInt(1100, 1900),
      flightsClimbedToday: randomInt(0, 18),
      exerciseMinutesToday: randomInt(8, 88),
      standHoursToday: randomInt(2, 14),
    },
    sleep: {
      inBedMinutesLast36h: randomInt(360, 620),
      asleepMinutesLast36h: randomInt(310, 540),
      awakeMinutesLast36h: randomInt(8, 62),
      sampleCountLast36h: randomInt(4, 20),
      sleepScore: randomInt(55, 96),
    },
    heart: {
      latestHeartRateBpm: randomInt(58, 112),
      restingHeartRateBpm: randomInt(49, 78),
      walkingHeartRateAverageBpm: randomInt(80, 125),
      heartRateVariabilityMs: randomInt(16, 78),
      vo2MaxMlKgMin: round2(26 + Math.random() * 18),
      atrialFibrillationBurdenPercent: round2(Math.random() * 2),
      systolicBloodPressureMmhg: randomInt(100, 136),
      diastolicBloodPressureMmhg: randomInt(61, 89),
    },
    oxygen: {
      bloodOxygenPercent: round2(95 + Math.random() * 5),
    },
    metabolic: {
      bloodGlucoseMgDl: round2(78 + Math.random() * 58),
    },
    environment: {
      daylightMinutesToday: randomInt(6, 165),
    },
    body: {
      respiratoryRateBrpm: round2(12 + Math.random() * 8),
      bodyTemperatureCelsius: round2(36 + Math.random() * 1.4),
      bodyMassKg: round2(45 + Math.random() * 40),
    },
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

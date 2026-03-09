import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Settings,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
  type AppStateStatus,
  type LayoutChangeEvent,
  type KeyboardEvent,
} from 'react-native';
import {
  loadAlertingMockHealthSnapshot,
  loadHealthSnapshot,
  type HealthSnapshot,
  type HealthWorkoutRecord,
} from './src/health/healthData';
import { HealthInsightsBoard } from './src/health/HealthInsightsBoard';
import { WellnessArticleShelf, type WellnessArticle } from './src/content/WellnessArticleShelf';

type AuthMode = 'login' | 'register';
type EditorMode = 'name' | 'password';
type UserGender = 'female' | 'male' | 'non_binary' | 'prefer_not_to_say';

type AuthUser = {
  id: string;
  username?: string;
  name?: string;
  email: string;
  age?: number;
  gender?: UserGender;
  heightCm?: number;
  weightKg?: number;
  experimentConsent?: boolean;
};

type AppPanel = 'home' | 'chat';

type Citation = {
  label: string;
  sourceTitle: string;
  sectionTitle?: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  createdAt?: string;
};

type ChatSessionType = 'manual' | 'login_health_review';

type ChatSessionRecord = {
  id: number;
  title: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  sessionType: ChatSessionType;
  riskAlertCodes: string[];
  messages: ChatMessage[];
};

type HealthRiskSignal = {
  code: string;
  title: string;
  severity: 'watch' | 'high';
  firstDetectedAt: string;
  lastDetectedAt: string;
  occurrenceCount: number;
  latestValue?: number;
  unit?: string;
  latestMessage: string;
  latestRecommendation: string;
};

type HealthProfileRecord = {
  latestSignals: HealthRiskSignal[];
  trackedSignals: HealthRiskSignal[];
  lastSnapshotGeneratedAt: string | null;
  lastSnapshotSource: string;
  llmHealthOverview?: string;
};

type SealLogoProps = {
  size?: number;
  style?: object;
};

const API_BASE_URL = 'http://43.138.212.17:2818';
const AUTO_UPLOAD_SERIES_LIMIT = 48;
const AUTO_UPLOAD_SLEEP_SAMPLES_LIMIT = 80;
const AUTO_HEALTH_SYNC_INTERVAL_MS = 60 * 60 * 1000;
const AUTO_HEALTH_SYNC_COOLDOWN_MS = 90 * 1000;
const HEALTH_ALERT_POPUP_COOLDOWN_MS = 2 * 60 * 1000;
const SHOW_HEALTH_RAW_PANEL = false;
// Debug switch: print full health snapshot JSON after each successful read.
const LOG_HEALTH_SNAPSHOT_JSON = true;
const REMEMBER_LOGIN_SETTINGS_KEY = 'qialchemy.rememberLogin.enabled';
const REMEMBER_LOGIN_ID_SETTINGS_KEY = 'qialchemy.rememberLogin.id';
const REMEMBER_PASSWORD_SETTINGS_KEY = 'qialchemy.rememberLogin.password';
const AUTH_TOKEN_SETTINGS_KEY = 'qialchemy.auth.token';
const AUTH_USER_SETTINGS_KEY = 'qialchemy.auth.user';
const AUTH_SESSION_STARTED_AT_SETTINGS_KEY = 'qialchemy.auth.startedAt';
const AUTH_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const API_ERROR_MESSAGE_MAP: Record<string, string> = {
  'Email already registered': '邮箱已被注册',
  'Username already registered': '用户名已被占用',
  'Invalid email or password': '邮箱或密码错误',
  'Invalid username or email or password': '用户名/邮箱或密码错误',
  'Invalid username format': '用户名格式不合法',
  'Failed to save health snapshot': '健康快照保存失败，请稍后重试',
  Unauthorized: '未授权，请重新登录',
  'Route not found': '接口不存在',
  'Validation failed': '请求参数不合法',
  'login or email is required': '请输入用户名或邮箱',
  'Experiment consent is required': '继续注册前必须同意参与实验',
};

const AVATAR_BG_COLORS = ['#a7342d', '#8a5d3b', '#7a4f2e', '#9c3a31', '#6c4d2f', '#8d6a45'];
const AVATAR_BORDER_COLORS = ['#c89f74', '#b78d65', '#c39768', '#c88b79', '#b98f62', '#c6a57e'];
const USERNAME_REGEX = /^[a-z0-9_][a-z0-9_.-]{2,23}$/;
const GENDER_OPTIONS: Array<{ value: UserGender; label: string }> = [
  { value: 'female', label: '女' },
  { value: 'male', label: '男' },
  { value: 'non_binary', label: '非二元' },
  { value: 'prefer_not_to_say', label: '不透露' },
];

function getGenderLabel(value: UserGender | undefined): string {
  return GENDER_OPTIONS.find(option => option.value === value)?.label ?? '--';
}

function normalizeApiBase(baseUrl = API_BASE_URL): string {
  return baseUrl.replace(/\/+$/, '');
}

function localizeErrorMessage(message: string, fallbackMessage: string): string {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    return fallbackMessage;
  }

  if (API_ERROR_MESSAGE_MAP[trimmedMessage]) {
    return API_ERROR_MESSAGE_MAP[trimmedMessage];
  }

  const normalized = trimmedMessage.toLowerCase();

  if (normalized.includes('network request failed') || normalized.includes('failed to fetch')) {
    return '网络请求失败，请确认后端服务已启动';
  }

  if (normalized.includes('timeout')) {
    return '请求超时，请稍后重试';
  }

  if (normalized.includes('json parse error')) {
    return '服务返回格式异常，请检查后端网关';
  }

  if (normalized.includes('no data available for the specified predicate')) {
    return '当前时间范围暂无可读健康样本，请先在健康App中产生记录后重试';
  }

  return trimmedMessage;
}

function toPlainChatText(markdownText: string): string {
  const normalized = markdownText.replace(/\r\n/g, '\n');
  const withoutFences = normalized.replace(/```[\s\S]*?```/g, block =>
    block.replace(/```[a-zA-Z0-9_-]*\n?/g, '').replace(/```/g, ''),
  );

  return withoutFences
    .replace(/\[C\d+\]/g, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/^\s*[-+*]\s+/gm, '• ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatMetric(value: number | undefined | null, digits = 0): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '--';
  }
  return value.toFixed(digits);
}

function toHours(valueMinutes: number | undefined | null, digits = 1): number | undefined {
  if (valueMinutes === undefined || valueMinutes === null || Number.isNaN(valueMinutes)) {
    return undefined;
  }
  return Number((valueMinutes / 60).toFixed(digits));
}

function formatHours(valueMinutes: number | undefined | null, digits = 1): string {
  const hours = toHours(valueMinutes, digits);
  if (hours === undefined) {
    return '--';
  }
  if (Math.abs(hours) < 1 && valueMinutes !== undefined && valueMinutes !== null) {
    return `${Math.round(valueMinutes)} 分钟`;
  }
  return `${hours.toFixed(digits)} 小时`;
}

function formatDurationFromHoursValue(valueHours: number): string {
  if (!Number.isFinite(valueHours)) {
    return '--';
  }
  if (Math.abs(valueHours) < 1) {
    return `${Math.round(valueHours * 60)} 分钟`;
  }
  return `${valueHours.toFixed(valueHours >= 10 ? 0 : 1).replace(/\.0$/, '')} 小时`;
}

function localizeLegacyHealthCopy(text: string): string {
  if (!text.trim()) {
    return '';
  }

  return text
    .replace(/\bVO2\s*Max\b/gi, '最大摄氧量')
    .replace(/\bHRV\b/gi, '心率变异性')
    .replace(/\bSpO2\b/gi, '血氧')
    .replace(/\bApple\s+Health\b/gi, '苹果健康')
    .replace(/\bHealthKit\b/gi, '苹果健康')
    .replace(/\bMove\b/gi, '活动')
    .replace(/\bExercise\b/gi, '锻炼')
    .replace(/\bStand\b/gi, '站立')
    .replace(/\bwalk\b/gi, '散步')
    .replace(/\brun\b/gi, '跑步')
    .replace(/\bcycle\b/gi, '骑行')
    .replace(/\bswim\b/gi, '游泳')
    .replace(/\byoga\b/gi, '瑜伽')
    .replace(/\bstrength\b/gi, '力量训练')
    .replace(/\bhiit\b/gi, '高强度间歇')
    .replace(/\bhike\b/gi, '徒步')
    .replace(/\bkcal\b/gi, '千卡')
    .replace(/\bml\/kg\/min\b/gi, '毫升/千克/分钟')
    .replace(/\bbrpm\b/gi, '次/分')
    .replace(/\bbpm\b/gi, '次/分')
    .replace(/\bREM\b/gi, '快速眼动')
    .replace(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)h\b/gi, (_match, current, goal) => {
      const currentHours = Number(current);
      const goalHours = Number(goal);
      if (!Number.isFinite(currentHours) || !Number.isFinite(goalHours)) {
        return `${current}/${goal}h`;
      }
      return `${formatDurationFromHoursValue(currentHours)}/${formatDurationFromHoursValue(goalHours)}`;
    })
    .replace(/(\d+(?:\.\d+)?)\s*h\b/gi, (_match, value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? formatDurationFromHoursValue(numeric) : `${value}h`;
    })
    .replace(/(\d+(?:\.\d+)?)\s*小时/g, (_match, value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? formatDurationFromHoursValue(numeric) : `${value} 小时`;
    });
}

function formatDateLabel(value: string | undefined): string {
  if (!value) {
    return '--';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return date.toLocaleString('zh-CN');
}

function mgDlToMmolL(value: number | undefined | null): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return undefined;
  }
  return value / 18;
}

function glucoseStatusZh(valueMmolL: number | undefined): string {
  if (valueMmolL === undefined || Number.isNaN(valueMmolL)) {
    return '无数据';
  }
  if (valueMmolL >= 11.1) {
    return '偏高';
  }
  if (valueMmolL >= 7.0) {
    return '偏高风险';
  }
  if (valueMmolL < 3.9) {
    return '偏低';
  }
  return '正常范围';
}

function truncateSeries(points: Array<{ timestamp: string; value: number; unit: string }> | undefined, limit: number) {
  if (!points || points.length <= limit) {
    return points;
  }
  return points.slice(points.length - limit);
}

function truncateTail<T>(items: T[] | undefined, limit: number): T[] | undefined {
  if (!items || items.length <= limit) {
    return items;
  }
  return items.slice(items.length - limit);
}

function truncateWorkouts(workouts: HealthWorkoutRecord[] | undefined, limit: number): HealthWorkoutRecord[] | undefined {
  if (!workouts || workouts.length <= limit) {
    return workouts;
  }
  return workouts.slice(0, limit);
}

function compactSnapshotForAutoUpload(snapshot: HealthSnapshot): HealthSnapshot {
  return {
    ...snapshot,
    profile: snapshot.profile
      ? {
          ...snapshot.profile,
        }
      : undefined,
    activity: snapshot.activity
      ? {
          ...snapshot.activity,
          stepsHourlySeriesToday: truncateSeries(snapshot.activity.stepsHourlySeriesToday, AUTO_UPLOAD_SERIES_LIMIT),
          activeEnergyHourlySeriesToday: truncateSeries(
            snapshot.activity.activeEnergyHourlySeriesToday,
            AUTO_UPLOAD_SERIES_LIMIT
          ),
          exerciseMinutesHourlySeriesToday: truncateSeries(
            snapshot.activity.exerciseMinutesHourlySeriesToday,
            AUTO_UPLOAD_SERIES_LIMIT
          ),
        }
      : undefined,
    sleep: snapshot.sleep
      ? {
          ...snapshot.sleep,
          samplesLast36h: snapshot.sleep.samplesLast36h?.slice(-AUTO_UPLOAD_SLEEP_SAMPLES_LIMIT),
        }
      : undefined,
    heart: snapshot.heart
      ? {
          ...snapshot.heart,
          heartRateSeriesLast24h: truncateSeries(snapshot.heart.heartRateSeriesLast24h, AUTO_UPLOAD_SERIES_LIMIT),
          restingHeartRateSeriesLast24h: truncateSeries(
            snapshot.heart.restingHeartRateSeriesLast24h,
            AUTO_UPLOAD_SERIES_LIMIT
          ),
          heartRateVariabilitySeriesLast24h: truncateSeries(
            snapshot.heart.heartRateVariabilitySeriesLast24h,
            AUTO_UPLOAD_SERIES_LIMIT
          ),
          heartRateVariabilitySeriesLast7d: truncateSeries(
            snapshot.heart.heartRateVariabilitySeriesLast7d,
            AUTO_UPLOAD_SERIES_LIMIT
          ),
        }
      : undefined,
    oxygen: snapshot.oxygen
      ? {
          ...snapshot.oxygen,
          bloodOxygenSeriesLast24h: truncateSeries(snapshot.oxygen.bloodOxygenSeriesLast24h, AUTO_UPLOAD_SERIES_LIMIT),
        }
      : undefined,
    metabolic: snapshot.metabolic
      ? {
          ...snapshot.metabolic,
          bloodGlucoseSeriesLast24h: truncateSeries(
            snapshot.metabolic.bloodGlucoseSeriesLast24h,
            AUTO_UPLOAD_SERIES_LIMIT
          ),
          bloodGlucoseSeriesLast7d: truncateSeries(snapshot.metabolic.bloodGlucoseSeriesLast7d, AUTO_UPLOAD_SERIES_LIMIT),
        }
      : undefined,
    environment: snapshot.environment
      ? {
          ...snapshot.environment,
          daylightSeriesLast7d: truncateSeries(snapshot.environment.daylightSeriesLast7d, AUTO_UPLOAD_SERIES_LIMIT),
        }
      : undefined,
    body: snapshot.body
      ? {
          ...snapshot.body,
          respiratoryRateSeriesLast7d: truncateSeries(snapshot.body.respiratoryRateSeriesLast7d, AUTO_UPLOAD_SERIES_LIMIT),
          bodyTemperatureSeriesLast7d: truncateSeries(
            snapshot.body.bodyTemperatureSeriesLast7d,
            AUTO_UPLOAD_SERIES_LIMIT
          ),
          bodyMassSeriesLast30d: truncateSeries(snapshot.body.bodyMassSeriesLast30d, AUTO_UPLOAD_SERIES_LIMIT),
        }
      : undefined,
    huawei: snapshot.huawei
      ? {
          ...snapshot.huawei,
          activity: snapshot.huawei.activity
            ? {
                ...snapshot.huawei.activity,
                stepsSeriesToday: truncateSeries(snapshot.huawei.activity.stepsSeriesToday, AUTO_UPLOAD_SERIES_LIMIT),
                caloriesSeriesToday: truncateSeries(snapshot.huawei.activity.caloriesSeriesToday, AUTO_UPLOAD_SERIES_LIMIT),
                activeMinutesSeriesToday: truncateSeries(
                  snapshot.huawei.activity.activeMinutesSeriesToday,
                  AUTO_UPLOAD_SERIES_LIMIT
                ),
              }
            : undefined,
          sleep: snapshot.huawei.sleep
            ? {
                ...snapshot.huawei.sleep,
                sleepSegmentsLast24h: truncateTail(snapshot.huawei.sleep.sleepSegmentsLast24h, AUTO_UPLOAD_SLEEP_SAMPLES_LIMIT),
              }
            : undefined,
          heart: snapshot.huawei.heart
            ? {
                ...snapshot.huawei.heart,
                heartRateSeriesLast24h: truncateSeries(
                  snapshot.huawei.heart.heartRateSeriesLast24h,
                  AUTO_UPLOAD_SERIES_LIMIT
                ),
              }
            : undefined,
          oxygen: snapshot.huawei.oxygen
            ? {
                ...snapshot.huawei.oxygen,
                spO2SeriesLast24h: truncateSeries(snapshot.huawei.oxygen.spO2SeriesLast24h, AUTO_UPLOAD_SERIES_LIMIT),
              }
            : undefined,
          stress: snapshot.huawei.stress
            ? {
                ...snapshot.huawei.stress,
                stressSeriesLast24h: truncateSeries(snapshot.huawei.stress.stressSeriesLast24h, AUTO_UPLOAD_SERIES_LIMIT),
              }
            : undefined,
          bloodPressure: snapshot.huawei.bloodPressure
            ? {
                ...snapshot.huawei.bloodPressure,
                bloodPressureSeriesLast30d: truncateTail(
                  snapshot.huawei.bloodPressure.bloodPressureSeriesLast30d,
                  AUTO_UPLOAD_SERIES_LIMIT
                ),
              }
            : undefined,
          workouts: truncateWorkouts(snapshot.huawei.workouts, 8),
        }
      : undefined,
    workouts: truncateWorkouts(snapshot.workouts, 8),
  };
}

function buildSnapshotStateKey(snapshot: HealthSnapshot): string {
  const compact = compactSnapshotForAutoUpload(snapshot);
  const payload = JSON.stringify({
    source: compact.source,
    authorized: compact.authorized,
    profile: compact.profile,
    activity: compact.activity,
    sleep: compact.sleep,
    heart: compact.heart,
    oxygen: compact.oxygen,
    metabolic: compact.metabolic,
    environment: compact.environment,
    body: compact.body,
    huawei: compact.huawei,
    workouts: compact.workouts,
  });
  return String(hashCode(payload));
}

function buildSleepStateKey(snapshot: HealthSnapshot): string {
  const sleep = snapshot.sleep;
  if (!sleep) {
    return 'sleep:none';
  }
  const payload = JSON.stringify({
    sleepScore: sleep.sleepScore,
    asleepMinutesLast36h: sleep.asleepMinutesLast36h,
    inBedMinutesLast36h: sleep.inBedMinutesLast36h,
    awakeMinutesLast36h: sleep.awakeMinutesLast36h,
    sampleCountLast36h: sleep.sampleCountLast36h,
    stageMinutesLast36h: sleep.stageMinutesLast36h,
    apnea: sleep.apnea,
    latestSamples: sleep.samplesLast36h?.slice(-6).map(item => ({
      stage: item.stage,
      startDate: item.startDate,
      endDate: item.endDate,
    })),
  });
  return `sleep:${hashCode(payload)}`;
}

function buildSleepAdvicePrompt(snapshot: HealthSnapshot): string {
  const sleep = snapshot.sleep;
  const heart = snapshot.heart;
  const oxygen = snapshot.oxygen;

  return [
    '请基于以下健康快照给出中医导向的睡眠建议。',
    '要求：只输出 4 条内容（1. 睡眠状态判断 2. 今晚建议 3. 未来7天调理 4. 何时就医），每条简洁可执行。',
    '所有涉及睡眠、日照、运动、卧床等时长，超过 1 小时再写小时；不足 1 小时请直接换算成分钟。',
    `睡眠评分: ${sleep?.sleepScore ?? '未知'}`,
    `入睡时长(36h): ${formatHours(sleep?.asleepMinutesLast36h)}`,
    `在床时长(36h): ${formatHours(sleep?.inBedMinutesLast36h)}`,
    `睡眠呼吸暂停事件(30d): ${sleep?.apnea?.eventCountLast30d ?? '未知'}`,
    `睡眠呼吸暂停风险: ${sleep?.apnea?.riskLevel ?? '未知'}`,
    `最新心率: ${heart?.latestHeartRateBpm ?? '未知'} 次/分`,
    `心率变异性: ${heart?.heartRateVariabilityMs ?? '未知'} 毫秒`,
    `血氧: ${oxygen?.bloodOxygenPercent ?? '未知'} %`,
  ].join('\n');
}

function isSnapshotSparse(snapshot: HealthSnapshot): boolean {
  const metricValues = [
    snapshot.activity?.stepsToday,
    snapshot.activity?.activeEnergyKcalToday,
    snapshot.activity?.exerciseMinutesToday,
    snapshot.activity?.standHoursToday,
    snapshot.sleep?.asleepMinutesLast36h,
    snapshot.sleep?.sleepScore,
    snapshot.heart?.restingHeartRateBpm,
    snapshot.heart?.heartRateVariabilityMs,
    snapshot.heart?.vo2MaxMlKgMin,
    snapshot.oxygen?.bloodOxygenPercent,
    snapshot.metabolic?.bloodGlucoseMgDl,
    snapshot.environment?.daylightMinutesToday,
    snapshot.body?.bodyMassKg,
    snapshot.huawei?.body?.bmi,
  ].filter(value => typeof value === 'number' && Number.isFinite(value));

  const hasWorkoutRecords = Boolean(snapshot.workouts && snapshot.workouts.length > 0);
  return metricValues.length < 4 && !hasWorkoutRecords;
}

function formatSignalValue(signal: HealthRiskSignal): string {
  if (signal.latestValue === undefined || signal.latestValue === null || Number.isNaN(signal.latestValue)) {
    return '';
  }
  const raw = signal.unit ? ` (${signal.latestValue}${signal.unit})` : ` (${signal.latestValue})`;
  return localizeLegacyHealthCopy(raw);
}

function formatAlertValueForFingerprint(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'na';
  }
  return value.toFixed(1);
}

function buildHealthAlertFingerprint(signals: HealthRiskSignal[]): string {
  return [...signals]
    .sort((left, right) => left.code.localeCompare(right.code))
    .map(
      signal =>
        `${signal.code}:${signal.severity}:${formatAlertValueForFingerprint(signal.latestValue)}:${localizeLegacyHealthCopy(signal.latestMessage)}`
    )
    .join('|');
}

function buildHealthAlertDialogMessage(signals: HealthRiskSignal[]): string {
  const topSignals = signals.slice(0, 3).map(
    (signal, index) => `${index + 1}. ${signal.title}：${localizeLegacyHealthCopy(signal.latestMessage)}`
  );

  const footer =
    signals.length > 3 ? `另有 ${signals.length - 3} 项提醒，建议进入详细分析查看。` : '建议尽快查看详细分析并及时调整当天作息。';

  return ['刚读取到新的健康提醒：', ...topSignals, footer].join('\n');
}

function buildProactiveHealthPrompt(signals: HealthRiskSignal[]): string {
  const signalLines = signals.map(
    (signal, index) =>
      `${index + 1}. ${signal.title}${formatSignalValue(signal)}：${localizeLegacyHealthCopy(signal.latestMessage)}；建议关注：${localizeLegacyHealthCopy(signal.latestRecommendation)}`
  );

  return [
    '系统在用户刚登录时自动读取了最新健康数据，并识别到一些值得主动干预的异常信号。',
    '请你直接以中医健康助手身份发起一次主动关怀，不要先反问用户。',
    '输出要求：',
    '1. 先用“本次健康数据提示你目前主要有以下症状/异常线索：”开头，列出 3-6 条症状或异常。',
    '2. 再用中医角度概括可能的失衡方向，例如气血不足、肝郁脾虚、痰湿内阻等，但不要下医疗诊断。',
    '3. 再给出 4-6 条今天就能执行的调理建议，尽量量化。',
    '4. 最后补 1 条红旗提醒，说明什么情况下应线下就医。',
    '5. 全程中文，语气像系统主动提醒，避免空泛套话。',
    '6. 所有短时长建议（少于1小时）统一换算成分钟，只有超过1小时再写小时。',
    '',
    '当前识别到的异常：',
    ...signalLines,
  ].join('\n');
}

function haveSameRiskAlertCodes(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function hashCode(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.abs((hash * 31 + input.charCodeAt(i)) % 2147483647);
  }
  return hash;
}

function buildAvatar(user: AuthUser | null, seed: number): { glyph: string; bg: string; border: string } {
  const display = user?.name?.trim() || user?.email || 'QiAlchemy';
  const fallbackGlyphs = ['岐', '灵', '元', '术', '木', '火', '土', '金', '水', '养'];
  const firstChar = display.charAt(0);
  const hasWordChar = /[A-Za-z0-9\u4e00-\u9fa5]/.test(firstChar);
  const glyph = hasWordChar ? firstChar.toUpperCase() : fallbackGlyphs[seed % fallbackGlyphs.length];

  const combinedHash = hashCode(`${display}-${seed}`);
  const bg = AVATAR_BG_COLORS[combinedHash % AVATAR_BG_COLORS.length];
  const border = AVATAR_BORDER_COLORS[combinedHash % AVATAR_BORDER_COLORS.length];
  return { glyph, bg, border };
}

async function readApiResponse<T>(response: Response): Promise<{ data: T | null; rawText: string }> {
  const rawText = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  const firstChar = rawText.trimStart().charAt(0);
  const looksLikeJson =
    contentType.includes('application/json') || firstChar === '{' || firstChar === '[';

  if (!looksLikeJson) {
    return { data: null, rawText };
  }

  try {
    return { data: (rawText ? JSON.parse(rawText) : {}) as T, rawText };
  } catch {
    return { data: null, rawText };
  }
}

function SealLogo({ size = 40, style }: SealLogoProps): React.JSX.Element {
  const radius = Math.max(8, Math.round(size * 0.22));
  const inset = Math.max(4, Math.round(size * 0.12));
  const corner = Math.max(4, Math.round(size * 0.16));
  const glyphSize = Math.max(14, Math.round(size * 0.46));

  return (
    <View style={[styles.sealLogoFrame, { width: size, height: size, borderRadius: radius }, style]}>
      <View
        style={[
          styles.sealLogoCore,
          {
            top: inset,
            right: inset,
            bottom: inset,
            left: inset,
            borderRadius: Math.max(6, Math.round(radius * 0.7)),
          },
        ]}
      >
        <Text
          style={[
            styles.sealLogoGlyph,
            {
              fontSize: glyphSize,
              lineHeight: Math.round(glyphSize * 1.05),
            },
          ]}
        >
          岐
        </Text>
      </View>
      <View style={[styles.sealLogoCorner, styles.sealLogoCornerTopLeft, { width: corner, height: corner }]} />
      <View
        style={[styles.sealLogoCorner, styles.sealLogoCornerTopRight, { width: corner, height: corner }]}
      />
      <View
        style={[styles.sealLogoCorner, styles.sealLogoCornerBottomLeft, { width: corner, height: corner }]}
      />
      <View
        style={[styles.sealLogoCorner, styles.sealLogoCornerBottomRight, { width: corner, height: corner }]}
      />
      <View style={styles.sealLogoGloss} />
    </View>
  );
}

function SnapshotRawPanel({ snapshot }: { snapshot: HealthSnapshot }): React.JSX.Element {
  const latestWorkouts = (snapshot.workouts ?? []).slice(0, 3);
  const glucoseMmolL = mgDlToMmolL(snapshot.metabolic?.bloodGlucoseMgDl);
  const sourceLabel =
    snapshot.source === 'mock'
      ? '演示样本'
      : snapshot.source === 'huawei_health'
      ? '华为健康'
      : '苹果健康真机';

  const rows = [
    {
      label: '活动趋势点',
      value: `${snapshot.activity?.stepsHourlySeriesToday?.length ?? 0} / ${snapshot.activity?.activeEnergyHourlySeriesToday?.length ?? 0} / ${snapshot.activity?.exerciseMinutesHourlySeriesToday?.length ?? 0}`,
      note: `步数/活动能量/运动时长 · 圆环目标 行气 ${formatMetric(snapshot.activity?.activeEnergyGoalKcal)} 千卡 / 强身 ${formatHours(snapshot.activity?.exerciseGoalMinutes)} / 立身 ${formatMetric(snapshot.activity?.standGoalHours)} 小时`,
    },
    {
      label: '睡眠样本',
      value: `${snapshot.sleep?.samplesLast36h?.length ?? 0}`,
      note: `分期统计: 浅睡 ${formatHours(snapshot.sleep?.stageMinutesLast36h?.asleepCoreMinutes)}, 深睡 ${formatHours(snapshot.sleep?.stageMinutesLast36h?.asleepDeepMinutes)}, 快速眼动 ${formatHours(snapshot.sleep?.stageMinutesLast36h?.asleepREMMinutes)}, 呼吸暂停 ${formatMetric(snapshot.sleep?.apnea?.eventCountLast30d)} 次`,
    },
    {
      label: '心率趋势点',
      value: `${snapshot.heart?.heartRateSeriesLast24h?.length ?? 0}`,
      note: `心率变异性趋势点: ${snapshot.heart?.heartRateVariabilitySeriesLast7d?.length ?? 0}`,
    },
    {
      label: '血氧趋势点',
      value: `${snapshot.oxygen?.bloodOxygenSeriesLast24h?.length ?? 0}`,
      note: `最新血氧: ${formatMetric(snapshot.oxygen?.bloodOxygenPercent, 0)} %`,
    },
    {
      label: '代谢趋势点',
      value: `${snapshot.metabolic?.bloodGlucoseSeriesLast7d?.length ?? 0}`,
      note: `最新血糖: ${formatMetric(glucoseMmolL, 1)} mmol/L（${glucoseStatusZh(glucoseMmolL)}）`,
    },
    {
      label: '环境趋势点',
      value: `${snapshot.environment?.daylightSeriesLast7d?.length ?? 0}`,
      note: `今日日照: ${formatHours(snapshot.environment?.daylightMinutesToday)}`,
    },
    {
      label: '体征趋势点',
      value: `${snapshot.body?.respiratoryRateSeriesLast7d?.length ?? 0} / ${snapshot.heart?.heartRateVariabilitySeriesLast7d?.length ?? 0} / ${snapshot.body?.bodyMassSeriesLast30d?.length ?? 0}`,
      note: '呼吸频率/心率变异性/体重',
    },
  ];

  return (
    <View style={styles.rawPanel}>
      <Text style={styles.rawPanelTitle}>全量字段核验面板</Text>
      <Text style={styles.rawPanelMeta}>采集时间：{formatDateLabel(snapshot.generatedAt)}</Text>
      <Text style={styles.rawPanelMeta}>数据源：{sourceLabel}</Text>

      <View style={styles.rawRowWrap}>
        {rows.map(row => (
          <View key={row.label} style={styles.rawRowCard}>
            <Text style={styles.rawLabel}>{row.label}</Text>
            <Text style={styles.rawValue}>{row.value}</Text>
            <Text style={styles.rawNote}>{row.note}</Text>
          </View>
        ))}
      </View>

      <View style={styles.rawWorkoutCard}>
        <Text style={styles.rawWorkoutTitle}>最近运动记录（最近 3 条）</Text>
        {latestWorkouts.length === 0 ? (
          <Text style={styles.rawWorkoutText}>暂无记录</Text>
        ) : (
          latestWorkouts.map((workout: HealthWorkoutRecord, index) => (
            <Text key={`${workout.startDate ?? 'unknown'}-${index}`} style={styles.rawWorkoutText}>
              {index + 1}. {workout.activityTypeName ?? workout.activityTypeCode ?? '未知'} ·
              时长 {formatHours(workout.durationMinutes)} ·
              能量 {formatMetric(workout.totalEnergyKcal)} 千卡 ·
              距离 {formatMetric(workout.totalDistanceKm, 2)} km
            </Text>
          ))
        )}
      </View>
    </View>
  );
}

function getSettingsBridge():
  | {
      get: (key: string) => unknown;
      set: (settings: Record<string, unknown>) => void;
    }
  | null {
  if (Platform.OS !== 'ios') {
    return null;
  }

  return {
    get: (key: string) => {
      try {
        const settingsBridge = Settings as
          | {
              get?: (targetKey: string) => unknown;
            }
          | undefined;
        if (!settingsBridge || typeof settingsBridge.get !== 'function') {
          return undefined;
        }
        return settingsBridge.get(key);
      } catch {
        return undefined;
      }
    },
    set: (settings: Record<string, unknown>) => {
      try {
        const settingsBridge = Settings as
          | {
              set?: (nextSettings: Record<string, unknown>) => void;
            }
          | undefined;
        if (!settingsBridge || typeof settingsBridge.set !== 'function') {
          return;
        }
        settingsBridge.set(settings);
      } catch {
        return;
      }
    },
  };
}

function readRememberedLogin(): { enabled: boolean; loginId: string; password: string } {
  const settingsBridge = getSettingsBridge();
  if (!settingsBridge) {
    return { enabled: false, loginId: '', password: '' };
  }

  try {
    const rawEnabled = settingsBridge.get(REMEMBER_LOGIN_SETTINGS_KEY);
    const enabled =
      rawEnabled === undefined || rawEnabled === null ? true : !(rawEnabled === false || rawEnabled === 'false');

    const rawLoginId = settingsBridge.get(REMEMBER_LOGIN_ID_SETTINGS_KEY);
    const rawPassword = settingsBridge.get(REMEMBER_PASSWORD_SETTINGS_KEY);

    return {
      enabled,
      loginId: typeof rawLoginId === 'string' ? rawLoginId : '',
      password: typeof rawPassword === 'string' ? rawPassword : '',
    };
  } catch {
    return { enabled: false, loginId: '', password: '' };
  }
}

function persistRememberedLogin(enabled: boolean, loginId = '', password = ''): void {
  const settingsBridge = getSettingsBridge();
  if (!settingsBridge) {
    return;
  }

  try {
    if (!enabled) {
      settingsBridge.set({
        [REMEMBER_LOGIN_SETTINGS_KEY]: false,
        [REMEMBER_LOGIN_ID_SETTINGS_KEY]: '',
        [REMEMBER_PASSWORD_SETTINGS_KEY]: '',
      });
      return;
    }

    settingsBridge.set({
      [REMEMBER_LOGIN_SETTINGS_KEY]: true,
      [REMEMBER_LOGIN_ID_SETTINGS_KEY]: loginId.trim(),
      [REMEMBER_PASSWORD_SETTINGS_KEY]: password,
    });
  } catch {
    return;
  }
}

function readPersistedAuthSession(): { token: string; user: AuthUser | null; startedAtMs: number | null } {
  const settingsBridge = getSettingsBridge();
  if (!settingsBridge) {
    return { token: '', user: null, startedAtMs: null };
  }

  try {
    const rawToken = settingsBridge.get(AUTH_TOKEN_SETTINGS_KEY);
    const rawUser = settingsBridge.get(AUTH_USER_SETTINGS_KEY);
    const rawStartedAt = settingsBridge.get(AUTH_SESSION_STARTED_AT_SETTINGS_KEY);

    const token = typeof rawToken === 'string' ? rawToken.trim() : '';
    const startedAtMs =
      typeof rawStartedAt === 'number'
        ? rawStartedAt
        : typeof rawStartedAt === 'string'
          ? Number(rawStartedAt)
          : NaN;

    if (!token || !Number.isFinite(startedAtMs) || Date.now() - startedAtMs > AUTH_SESSION_MAX_AGE_MS) {
      return { token: '', user: null, startedAtMs: null };
    }

    let user: AuthUser | null = null;
    if (typeof rawUser === 'string' && rawUser.trim()) {
      try {
        const parsed = JSON.parse(rawUser) as Partial<AuthUser>;
        if (parsed && typeof parsed.id === 'string' && typeof parsed.email === 'string') {
          user = {
            id: parsed.id,
            email: parsed.email,
            username: parsed.username,
            name: parsed.name,
            age: parsed.age,
            gender: parsed.gender,
            heightCm: parsed.heightCm,
            weightKg: parsed.weightKg,
            experimentConsent: parsed.experimentConsent,
          };
        }
      } catch {
        user = null;
      }
    }

    return { token, user, startedAtMs };
  } catch {
    return { token: '', user: null, startedAtMs: null };
  }
}

function persistAuthSession(token: string, user: AuthUser, startedAtMs = Date.now()): void {
  const settingsBridge = getSettingsBridge();
  if (!settingsBridge) {
    return;
  }

  try {
    settingsBridge.set({
      [AUTH_TOKEN_SETTINGS_KEY]: token,
      [AUTH_USER_SETTINGS_KEY]: JSON.stringify(user),
      [AUTH_SESSION_STARTED_AT_SETTINGS_KEY]: String(startedAtMs),
    });
  } catch {
    return;
  }
}

function clearPersistedAuthSession(): void {
  const settingsBridge = getSettingsBridge();
  if (!settingsBridge) {
    return;
  }

  try {
    settingsBridge.set({
      [AUTH_TOKEN_SETTINGS_KEY]: '',
      [AUTH_USER_SETTINGS_KEY]: '',
      [AUTH_SESSION_STARTED_AT_SETTINGS_KEY]: '',
    });
  } catch {
    return;
  }
}

function App(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#f6eddd" />
      <LoginScreen />
    </SafeAreaView>
  );
}

function LoginScreen(): React.JSX.Element {
  const rememberedLoginAtLaunch = useMemo(() => readRememberedLogin(), []);
  const restoredAuthAtLaunch = useMemo(() => readPersistedAuthSession(), []);
  const [mode, setMode] = useState<AuthMode>('login');
  const [rememberCredentials, setRememberCredentials] = useState(rememberedLoginAtLaunch.enabled);
  const [loginId, setLoginId] = useState(rememberedLoginAtLaunch.loginId);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<UserGender | ''>('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [experimentConsent, setExperimentConsent] = useState(false);
  const [consentModalVisible, setConsentModalVisible] = useState(false);
  const [password, setPassword] = useState(rememberedLoginAtLaunch.password);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameHint, setUsernameHint] = useState('');
  const [token, setToken] = useState('');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(restoredAuthAtLaunch.user);
  const [loading, setLoading] = useState(false);

  const [testMode, setTestMode] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthSnapshot, setHealthSnapshot] = useState<HealthSnapshot | null>(null);
  const [healthError, setHealthError] = useState('');
  const [healthProfile, setHealthProfile] = useState<HealthProfileRecord | null>(null);
  const [sleepAdvice, setSleepAdvice] = useState('');
  const [sleepAdviceLoading, setSleepAdviceLoading] = useState(false);
  const [sleepAdviceUpdatedAt, setSleepAdviceUpdatedAt] = useState<string | null>(null);
  const [wellnessArticles, setWellnessArticles] = useState<WellnessArticle[]>([]);
  const [wellnessArticlesLoading, setWellnessArticlesLoading] = useState(false);
  const [wellnessArticlesError, setWellnessArticlesError] = useState('');
  const [wellnessArticlesUpdatedAt, setWellnessArticlesUpdatedAt] = useState<string | null>(null);
  const [visualReady, setVisualReady] = useState(false);
  const [activePanel, setActivePanel] = useState<AppPanel>('home');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatKeyboardInset, setChatKeyboardInset] = useState(0);
  const [chatComposerHeight, setChatComposerHeight] = useState(74);
  const [chatSessionId, setChatSessionId] = useState(0);
  const [chatSessions, setChatSessions] = useState<ChatSessionRecord[]>([]);
  const [chatDrawerVisible, setChatDrawerVisible] = useState(false);

  const [profilePanelVisible, setProfilePanelVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('name');
  const [editorValue, setEditorValue] = useState('');
  const [avatarSeed, setAvatarSeed] = useState(() => Math.floor(Math.random() * 100000));
  const chatScrollRef = useRef<ScrollView | null>(null);
  const healthSyncInFlightRef = useRef(false);
  const lastSnapshotStateKeyRef = useRef<string | null>(null);
  const latestSnapshotRef = useRef<HealthSnapshot | null>(null);
  const lastSleepStateKeyRef = useRef<string | null>(null);
  const sleepAdviceInFlightRef = useRef(false);
  const lastChatHealthSessionIdRef = useRef<number | null>(null);
  const lastBootstrapTokenRef = useRef<string | null>(null);
  const authRestoreCheckedRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const lastAutoHealthSyncAtRef = useRef(0);
  const lastHealthAlertFingerprintRef = useRef<string | null>(null);
  const lastHealthAlertAtRef = useRef(0);

  const canUseHealth = Boolean(token);
  const isAndroid = Platform.OS === 'android';
  const healthPanelTitle = isAndroid ? '华为健康同步与建议' : '苹果健康同步与建议';
  const healthHintText = isAndroid
    ? '可手动同步华为健康数据，也可用演示样本预览界面；登录后会自动同步一次健康数据，正式聊天会在每个新会话首条消息前再读取一次。'
    : '可手动同步苹果健康数据；每次进入应用、切回前台以及每隔一小时都会自动同步一次，正式聊天也会在新会话首条消息前再读取一次。';
  const healthRealButtonText = isAndroid ? '同步华为健康数据' : '同步苹果健康数据';
  const visualPlaceholderText = isAndroid
    ? '点击“同步华为健康数据”或“使用演示样本”后，这里会展示你的健康总览与养生建议。'
    : '点击“同步苹果健康数据”后，这里会展示你的健康总览与养生建议。';

  const avatar = useMemo(() => buildAvatar(currentUser, avatarSeed), [currentUser, avatarSeed]);
  const normalizedUsername = username.trim().toLowerCase();
  const normalizedLoginId = loginId.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const registerBlocked =
    mode === 'register' &&
    (usernameChecking ||
      usernameAvailable === false ||
      (normalizedUsername.length > 0 && !USERNAME_REGEX.test(normalizedUsername)));
  const currentSessionTitle = useMemo(() => {
    if (chatSessionId <= 0) {
      return '中医智能对话';
    }
    return chatSessions.find(item => item.id === chatSessionId)?.title ?? '新对话';
  }, [chatSessionId, chatSessions]);
  const currentSessionType = useMemo(() => {
    if (chatSessionId <= 0) {
      return 'manual' as ChatSessionType;
    }
    return chatSessions.find(item => item.id === chatSessionId)?.sessionType ?? 'manual';
  }, [chatSessionId, chatSessions]);

  useEffect(() => {
    if (authRestoreCheckedRef.current) {
      return;
    }
    authRestoreCheckedRef.current = true;

    if (!restoredAuthAtLaunch.token) {
      clearPersistedAuthSession();
      return;
    }

    let cancelled = false;
    const restoreSession = async () => {
      setLoading(true);
      try {
        const normalizedBase = normalizeApiBase();
        const response = await fetch(`${normalizedBase}/api/auth/me`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${restoredAuthAtLaunch.token}` },
        });
        const { data } = await readApiResponse<{ message?: string; user?: AuthUser }>(response);

        if (!response.ok || !data?.user) {
          throw new Error(localizeErrorMessage(data?.message ?? '', '登录状态已失效'));
        }

        if (cancelled) {
          return;
        }

        setToken(restoredAuthAtLaunch.token);
        setCurrentUser(data.user);
        persistAuthSession(
          restoredAuthAtLaunch.token,
          data.user,
          restoredAuthAtLaunch.startedAtMs ?? Date.now()
        );
      } catch {
        clearPersistedAuthSession();
        if (!cancelled) {
          setToken('');
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    restoreSession().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [restoredAuthAtLaunch]);

  const createMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const scrollChatToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      chatScrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    const handleKeyboardFrameChange = (event: KeyboardEvent) => {
      const nextInset = Math.max(event.endCoordinates.height - 6, 0);
      setChatKeyboardInset(nextInset);
      scrollChatToBottom(false);
    };

    const handleKeyboardDidShow = (event: KeyboardEvent) => {
      const nextInset = Math.max(event.endCoordinates.height - 6, 0);
      setChatKeyboardInset(nextInset);
      scrollChatToBottom(false);
    };

    const handleKeyboardHide = () => {
      setChatKeyboardInset(0);
      scrollChatToBottom(false);
    };

    const frameSubscription = Keyboard.addListener('keyboardWillChangeFrame', handleKeyboardFrameChange);
    const didShowSubscription = Keyboard.addListener('keyboardDidShow', handleKeyboardDidShow);
    const hideSubscription = Keyboard.addListener('keyboardWillHide', handleKeyboardHide);
    const didHideSubscription = Keyboard.addListener('keyboardDidHide', handleKeyboardHide);

    return () => {
      frameSubscription.remove();
      didShowSubscription.remove();
      hideSubscription.remove();
      didHideSubscription.remove();
    };
  }, [scrollChatToBottom]);

  const getSessionTitle = useCallback((messages: ChatMessage[]): string => {
    const firstUser = messages.find(item => item.role === 'user');
    if (!firstUser?.content) {
      return '新对话';
    }

    const normalized = firstUser.content.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return '新对话';
    }

    return normalized.length > 16 ? `${normalized.slice(0, 16)}...` : normalized;
  }, []);

  const upsertChatSession = useCallback(
    (
      sessionId: number,
      messages: ChatMessage[],
      options?: Partial<Pick<ChatSessionRecord, 'createdAt' | 'summary' | 'sessionType' | 'riskAlertCodes' | 'title'>>
    ) => {
      const nowIso = new Date().toISOString();
      setChatSessions(prev => {
        const existing = prev.find(item => item.id === sessionId);
        const createdAt = existing?.createdAt ?? options?.createdAt ?? nowIso;
        const sameMessages = existing ? JSON.stringify(existing.messages) === JSON.stringify(messages) : false;
        const nextTitle =
          options?.title ?? (sameMessages ? existing?.title ?? getSessionTitle(messages) : getSessionTitle(messages));
        const updatedRecord: ChatSessionRecord = {
          id: sessionId,
          title: nextTitle,
          summary: options?.summary ?? existing?.summary ?? '',
          createdAt,
          updatedAt: sameMessages ? existing?.updatedAt ?? nowIso : nowIso,
          sessionType: options?.sessionType ?? existing?.sessionType ?? 'manual',
          riskAlertCodes: options?.riskAlertCodes ?? existing?.riskAlertCodes ?? [],
          messages,
        };
        const merged = [updatedRecord, ...prev.filter(item => item.id !== sessionId)];
        merged.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return merged;
      });
    },
    [getSessionTitle]
  );

  const startNewChat = useCallback(
    ({
      showAlert = false,
      introText,
      title,
      summary,
      sessionType = 'manual',
      riskAlertCodes = [],
    }: {
      showAlert?: boolean;
      introText?: string;
      title?: string;
      summary?: string;
      sessionType?: ChatSessionType;
      riskAlertCodes?: string[];
    } = {}) => {
      const nextSessionId = Math.max(chatSessionId, ...chatSessions.map(item => item.id), 0) + 1;
      const initialMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content:
          introText ??
          '新对话已开始。请告诉我你最近最困扰的健康问题，我会结合中医思路给出7天可执行建议。',
        createdAt: new Date().toISOString(),
      };

      setChatSessionId(nextSessionId);
      setChatMessages([initialMessage]);
      setChatInput('');
      setChatDrawerVisible(false);

      const createdAt = new Date().toISOString();
      setChatSessions(prev => {
        const initialRecord: ChatSessionRecord = {
          id: nextSessionId,
          title: title ?? '新对话',
          summary: summary ?? '',
          createdAt,
          updatedAt: createdAt,
          sessionType,
          riskAlertCodes,
          messages: [initialMessage],
        };
        const merged = [initialRecord, ...prev.filter(item => item.id !== nextSessionId)];
        merged.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return merged;
      });

      if (showAlert) {
        Alert.alert('已开始新会话', '已清空历史上下文，避免不同会话内容互相干扰');
      }

      return { sessionId: nextSessionId, initialMessage };
    },
    [chatSessionId, chatSessions]
  );

  const checkUsernameAvailable = async (
    rawUsername: string
  ): Promise<{ available: boolean; message?: string }> => {
    const normalized = rawUsername.trim().toLowerCase();

    if (!USERNAME_REGEX.test(normalized)) {
      return {
        available: false,
        message: '用户名需为 3-24 位小写字母/数字，可包含 _ . -',
      };
    }

    const normalizedBase = normalizeApiBase();
    const response = await fetch(
      `${normalizedBase}/api/auth/username-available?username=${encodeURIComponent(normalized)}`
    );
    const { data } = await readApiResponse<{ available?: boolean; message?: string }>(response);

    if (!response.ok || typeof data?.available !== 'boolean') {
      const fallbackMessage =
        response.status >= 500
          ? `服务暂时不可用（HTTP ${response.status}）`
          : `用户名校验失败（HTTP ${response.status}）`;
      throw new Error(localizeErrorMessage(data?.message ?? '', fallbackMessage));
    }

    return { available: data.available };
  };

  const fetchHealthProfile = useCallback(async (): Promise<HealthProfileRecord | null> => {
    if (!token) {
      return null;
    }

    const normalizedBase = normalizeApiBase();
    const response = await fetch(`${normalizedBase}/api/health/profile`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const { data } = await readApiResponse<{ message?: string; profile?: HealthProfileRecord }>(response);

    if (!response.ok || !data?.profile) {
      const fallbackMessage =
        response.status >= 500
          ? `服务暂时不可用（HTTP ${response.status}）`
          : `健康画像加载失败（HTTP ${response.status}）`;
      throw new Error(localizeErrorMessage(data?.message ?? '', fallbackMessage));
    }

    return data.profile;
  }, [token]);

  const fetchStoredChatSessions = useCallback(async (): Promise<ChatSessionRecord[]> => {
    if (!token) {
      return [];
    }

    const normalizedBase = normalizeApiBase();
    const response = await fetch(`${normalizedBase}/api/agent/sessions`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const { data } = await readApiResponse<{ message?: string; sessions?: ChatSessionRecord[] }>(response);

    if (!response.ok || !Array.isArray(data?.sessions)) {
      const fallbackMessage =
        response.status >= 500
          ? `服务暂时不可用（HTTP ${response.status}）`
          : `历史会话加载失败（HTTP ${response.status}）`;
      throw new Error(localizeErrorMessage(data?.message ?? '', fallbackMessage));
    }

    return data.sessions.map(session => ({
      id: session.id,
      title: session.title,
      summary: session.summary ?? '',
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      sessionType: session.sessionType ?? 'manual',
      riskAlertCodes: session.riskAlertCodes ?? [],
      messages: (session.messages ?? []).map(message => ({
        id: message.id,
        role: message.role,
        content: message.content,
        citations: message.citations,
        createdAt: message.createdAt,
      })),
    }));
  }, [token]);

  const loadWellnessArticles = useCallback(async (options?: { forceSync?: boolean }) => {
    const normalizedBase = normalizeApiBase();
    setWellnessArticlesLoading(true);
    setWellnessArticlesError('');

    try {
      const query = new URLSearchParams({ limit: '6' });
      if (options?.forceSync) {
        query.set('forceSync', '1');
      }
      const response = await fetch(`${normalizedBase}/api/content/articles?${query.toString()}`);
      const { data } = await readApiResponse<{
        message?: string;
        articles?: WellnessArticle[];
        lastSyncedAt?: string | null;
      }>(response);

      if (!response.ok || !Array.isArray(data?.articles)) {
        const fallbackMessage =
          response.status >= 500
            ? `服务暂时不可用（HTTP ${response.status}）`
            : `养生文章加载失败（HTTP ${response.status}）`;
        throw new Error(localizeErrorMessage(data?.message ?? '', fallbackMessage));
      }

      setWellnessArticles(
        data.articles.map((article) => ({
          slug: article.slug,
          title: article.title,
          summary: article.summary,
          author: article.author,
          sourceName: article.sourceName,
          sourceSection: article.sourceSection,
          sourceDomain: article.sourceDomain,
          sourceUrl: article.sourceUrl,
          publishedAt: article.publishedAt,
          coverImageUrl: article.coverImageUrl,
          contentBlocks: Array.isArray(article.contentBlocks) ? article.contentBlocks : [],
          tags: Array.isArray(article.tags) ? article.tags : [],
          updatedAt: article.updatedAt,
        }))
      );
      setWellnessArticlesUpdatedAt(data.lastSyncedAt ?? null);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '';
      setWellnessArticlesError(localizeErrorMessage(rawMessage, '养生文章加载失败'));
    } finally {
      setWellnessArticlesLoading(false);
    }
  }, []);

  const persistChatSessionToServer = useCallback(
    async (sessionId: number, messages: ChatMessage[], meta?: Partial<ChatSessionRecord>): Promise<ChatSessionRecord | null> => {
      if (!token || sessionId <= 0 || messages.length === 0) {
        return null;
      }

      const normalizedBase = normalizeApiBase();
      const response = await fetch(`${normalizedBase}/api/agent/sessions/${sessionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionType: meta?.sessionType ?? 'manual',
          riskAlertCodes: meta?.riskAlertCodes ?? [],
          messages: messages.map(message => ({
            id: message.id,
            role: message.role,
            content: message.content,
            citations: message.citations,
            createdAt: message.createdAt ?? new Date().toISOString(),
          })),
        }),
      });

      const { data } = await readApiResponse<{ message?: string; session?: ChatSessionRecord }>(response);
      if (!response.ok || !data?.session) {
        const fallbackMessage =
          response.status >= 500
            ? `服务暂时不可用（HTTP ${response.status}）`
            : `会话保存失败（HTTP ${response.status}）`;
        throw new Error(localizeErrorMessage(data?.message ?? '', fallbackMessage));
      }

      const nextSession: ChatSessionRecord = {
        id: data.session.id,
        title: data.session.title,
        summary: data.session.summary ?? '',
        createdAt: data.session.createdAt,
        updatedAt: data.session.updatedAt,
        sessionType: data.session.sessionType ?? meta?.sessionType ?? 'manual',
        riskAlertCodes: data.session.riskAlertCodes ?? meta?.riskAlertCodes ?? [],
        messages: (data.session.messages ?? []).map(message => ({
          id: message.id,
          role: message.role,
          content: message.content,
          citations: message.citations,
          createdAt: message.createdAt,
        })),
      };

      upsertChatSession(nextSession.id, nextSession.messages, nextSession);
      return nextSession;
    },
    [token, upsertChatSession]
  );

  const uploadHealthSnapshotToServer = useCallback(
    async (
      snapshot: HealthSnapshot,
      syncReason: 'manual' | 'auto' | 'chat'
    ): Promise<{ alerts: HealthRiskSignal[] }> => {
      if (!token) {
        return { alerts: [] };
      }

      const normalizedBase = normalizeApiBase();
      const response = await fetch(`${normalizedBase}/api/health/snapshots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          syncReason,
          snapshot: compactSnapshotForAutoUpload(snapshot),
        }),
      });
      const { data } = await readApiResponse<{
        message?: string;
        alerts?: HealthRiskSignal[];
        user?: AuthUser;
      }>(response);

      if (!response.ok) {
        const fallbackMessage =
          response.status >= 500
            ? `服务暂时不可用（HTTP ${response.status}）`
            : `健康数据同步失败（HTTP ${response.status}）`;
        throw new Error(localizeErrorMessage(data?.message ?? '', fallbackMessage));
      }

      if (data?.user) {
        setCurrentUser(data.user);
        const persistedSession = readPersistedAuthSession();
        persistAuthSession(token, data.user, persistedSession.startedAtMs ?? Date.now());
      }

      return {
        alerts: Array.isArray(data?.alerts) ? data.alerts : [],
      };
    },
    [token]
  );

  const startProactiveLoginReview = useCallback(
    async (
      snapshot: HealthSnapshot,
      signals: HealthRiskSignal[],
      existingSessions: ChatSessionRecord[],
      options: {
        vibrate?: boolean;
      } = {}
    ): Promise<void> => {
      if (!token || signals.length === 0) {
        return;
      }

      const normalizedBase = normalizeApiBase();
      const signalCodes = signals.map(item => item.code);
      const reusableSession = existingSessions.find(session => {
        if (session.sessionType !== 'login_health_review' || session.messages.length !== 1) {
          return false;
        }
        if (!haveSameRiskAlertCodes(session.riskAlertCodes ?? [], signalCodes)) {
          return false;
        }
        const lastUpdatedAt = new Date(session.updatedAt).getTime();
        if (!Number.isFinite(lastUpdatedAt)) {
          return false;
        }
        return Date.now() - lastUpdatedAt < 12 * 60 * 60 * 1000;
      });
      const nextSessionId =
        reusableSession?.id ?? Math.max(chatSessionId, ...existingSessions.map(item => item.id), 0) + 1;
      if (options.vibrate !== false) {
        Vibration.vibrate();
      }
      setActivePanel('chat');
      setTestMode(false);
      setChatDrawerVisible(false);
      setProfilePanelVisible(false);
      setChatLoading(true);
      try {
        const response = await fetch(`${normalizedBase}/api/agent/chat/health`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: buildProactiveHealthPrompt(signals),
            topK: 6,
            history: [],
            latestHealthSnapshot: snapshot,
          }),
        });

        const { data } = await readApiResponse<{
          message?: string;
          answer?: string;
          citations?: Array<{ label?: string; sourceTitle?: string; sectionTitle?: string }>;
        }>(response);

        if (!response.ok || typeof data?.answer !== 'string') {
          const fallbackMessage =
            response.status >= 500
              ? `服务暂时不可用（HTTP ${response.status}）`
              : `主动健康分析失败（HTTP ${response.status}）`;
          throw new Error(localizeErrorMessage(data?.message ?? '', fallbackMessage));
        }

        const assistantMessage: ChatMessage = {
          id: createMessageId(),
          role: 'assistant',
          content: toPlainChatText(data.answer),
          citations: (data.citations ?? [])
            .filter(item => item.label && item.sourceTitle)
            .map(item => ({
              label: item.label as string,
              sourceTitle: item.sourceTitle as string,
              sectionTitle: item.sectionTitle,
            })),
          createdAt: new Date().toISOString(),
        };
        const assistantCreatedAt = assistantMessage.createdAt ?? new Date().toISOString();

        const nextRecord: ChatSessionRecord = {
          id: nextSessionId,
          title: '登录健康分析',
          summary: signals.slice(0, 2).map(item => item.title).join('、'),
          createdAt: reusableSession?.createdAt ?? assistantCreatedAt,
          updatedAt: assistantCreatedAt,
          sessionType: 'login_health_review',
          riskAlertCodes: signalCodes,
          messages: [assistantMessage],
        };

        setChatSessionId(nextSessionId);
        setChatMessages(nextRecord.messages);
        setChatInput('');
        upsertChatSession(nextRecord.id, nextRecord.messages, nextRecord);
        await persistChatSessionToServer(nextRecord.id, nextRecord.messages, nextRecord);
        lastChatHealthSessionIdRef.current = nextSessionId;
      } finally {
        setChatLoading(false);
      }
    },
    [token, chatSessionId, persistChatSessionToServer, upsertChatSession]
  );

  const presentHealthRiskAlert = useCallback(
    (
      snapshot: HealthSnapshot,
      signals: HealthRiskSignal[],
      existingSessions: ChatSessionRecord[]
    ): void => {
      if (!token || signals.length === 0) {
        return;
      }

      const fingerprint = buildHealthAlertFingerprint(signals);
      const now = Date.now();
      if (
        lastHealthAlertFingerprintRef.current === fingerprint &&
        now - lastHealthAlertAtRef.current < HEALTH_ALERT_POPUP_COOLDOWN_MS
      ) {
        return;
      }

      lastHealthAlertFingerprintRef.current = fingerprint;
      lastHealthAlertAtRef.current = now;
      Vibration.vibrate([0, 180, 120, 180]);

      Alert.alert('发现健康提醒', buildHealthAlertDialogMessage(signals), [
        { text: '稍后查看', style: 'cancel' },
        {
          text: '查看分析',
          onPress: () => {
            startProactiveLoginReview(snapshot, signals, existingSessions, { vibrate: false }).catch(() => {});
          },
        },
      ]);
    },
    [token, startProactiveLoginReview]
  );

  useEffect(() => {
    if (mode !== 'register') {
      setUsernameChecking(false);
      setUsernameAvailable(null);
      setUsernameHint('');
      return;
    }

    if (!normalizedUsername) {
      setUsernameChecking(false);
      setUsernameAvailable(null);
      setUsernameHint('');
      return;
    }

    if (!USERNAME_REGEX.test(normalizedUsername)) {
      setUsernameChecking(false);
      setUsernameAvailable(false);
      setUsernameHint('用户名需为 3-24 位小写字母/数字，可包含 _ . -');
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setUsernameChecking(true);
      try {
        const result = await checkUsernameAvailable(normalizedUsername);
        if (cancelled) {
          return;
        }
        setUsernameAvailable(result.available);
        setUsernameHint(result.available ? '用户名可用' : '用户名已被占用');
      } catch (error) {
        if (cancelled) {
          return;
        }
        const rawMessage = error instanceof Error ? error.message : '';
        setUsernameAvailable(null);
        setUsernameHint(localizeErrorMessage(rawMessage, '用户名校验失败'));
      } finally {
        if (!cancelled) {
          setUsernameChecking(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, normalizedUsername]);

  useEffect(() => {
    if (activePanel === 'chat' && chatMessages.length > 0) {
      scrollChatToBottom(true);
    }
  }, [activePanel, chatMessages.length, scrollChatToBottom]);

  useEffect(() => {
    if (chatSessionId <= 0 || chatMessages.length === 0) {
      return;
    }
    upsertChatSession(chatSessionId, chatMessages);
  }, [chatMessages, chatSessionId, upsertChatSession]);

  const onSubmit = async () => {
    const normalizedBase = normalizeApiBase();

    if (!password.trim()) {
      Alert.alert('提示', '密码不能为空');
      return;
    }

    if (mode === 'login' && !normalizedLoginId) {
      Alert.alert('提示', '用户名或邮箱不能为空');
      return;
    }

    if (mode === 'register' && !normalizedUsername) {
      Alert.alert('提示', '注册模式下请填写用户名');
      return;
    }

    if (mode === 'register' && !normalizedEmail) {
      Alert.alert('提示', '注册模式下请填写邮箱');
      return;
    }

    if (mode === 'register' && !age.trim()) {
      Alert.alert('提示', '注册模式下请填写年龄');
      return;
    }

    if (mode === 'register' && !gender) {
      Alert.alert('提示', '注册模式下请选择性别');
      return;
    }

    if (mode === 'register' && !heightCm.trim()) {
      Alert.alert('提示', '注册模式下请填写身高');
      return;
    }

    if (mode === 'register' && !weightKg.trim()) {
      Alert.alert('提示', '注册模式下请填写体重');
      return;
    }

    if (mode === 'register' && !USERNAME_REGEX.test(normalizedUsername)) {
      Alert.alert('提示', '用户名需为 3-24 位小写字母/数字，可包含 _ . -');
      return;
    }

    if (mode === 'register' && usernameChecking) {
      Alert.alert('提示', '正在校验用户名，请稍候');
      return;
    }

    if (mode === 'register' && usernameAvailable === false) {
      Alert.alert('提示', '用户名已被占用，请更换');
      return;
    }

    if (password.trim().length < 8) {
      Alert.alert('提示', '密码至少8位');
      return;
    }

    if (mode === 'register' && confirmPassword.trim() !== password.trim()) {
      Alert.alert('提示', '两次输入的密码不一致');
      return;
    }

    const parsedAge = Number(age.trim());
    const parsedHeightCm = Number(heightCm.trim());
    const parsedWeightKg = Number(weightKg.trim());

    if (mode === 'register' && (!Number.isFinite(parsedAge) || parsedAge <= 0 || parsedAge > 120)) {
      Alert.alert('提示', '年龄请输入 1-120 之间的数字');
      return;
    }

    if (mode === 'register' && (!Number.isFinite(parsedHeightCm) || parsedHeightCm < 50 || parsedHeightCm > 250)) {
      Alert.alert('提示', '身高请输入 50-250 cm 之间的数字');
      return;
    }

    if (mode === 'register' && (!Number.isFinite(parsedWeightKg) || parsedWeightKg < 20 || parsedWeightKg > 300)) {
      Alert.alert('提示', '体重请输入 20-300 kg 之间的数字');
      return;
    }

    if (mode === 'register' && !experimentConsent) {
      setConsentModalVisible(true);
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';

      let body: Record<string, string | number | boolean>;
      if (mode === 'login') {
        body = { login: normalizedLoginId, password: password.trim() };
      } else {
        const latestUsernameCheck = await checkUsernameAvailable(normalizedUsername);
        if (!latestUsernameCheck.available) {
          throw new Error('用户名已被占用');
        }
        body = {
          username: normalizedUsername,
          email: normalizedEmail,
          password: password.trim(),
          age: parsedAge,
          gender,
          heightCm: parsedHeightCm,
          weightKg: parsedWeightKg,
          experimentConsent,
          ...(name.trim() ? { name: name.trim() } : {}),
        };
      }

      const response = await fetch(`${normalizedBase}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const { data } = await readApiResponse<{
        message?: string;
        token?: string;
        user?: AuthUser;
      }>(response);

      if (!response.ok || !data?.token || !data?.user) {
        const fallbackMessage =
          response.status >= 500
            ? `服务暂时不可用（HTTP ${response.status}）`
            : `请求失败（HTTP ${response.status}）`;
        throw new Error(localizeErrorMessage(data?.message ?? '', fallbackMessage));
      }

      setToken(data.token);
      setCurrentUser(data.user);
      persistAuthSession(data.token, data.user);
      setAvatarSeed(Math.floor(Math.random() * 100000));

      const loginIdToRemember =
        mode === 'login' ? normalizedLoginId : normalizedUsername || normalizedEmail;
      const passwordToRemember = password.trim();
      persistRememberedLogin(rememberCredentials, loginIdToRemember, passwordToRemember);

      setPassword(rememberCredentials ? passwordToRemember : '');
      setConfirmPassword('');
      setLoginId(rememberCredentials ? loginIdToRemember : '');
      setUsername('');
      setEmail('');
      setAge('');
      setGender('');
      setHeightCm('');
      setWeightKg('');
      setExperimentConsent(false);
      setConsentModalVisible(false);
      setTestMode(false);
      setHealthSnapshot(null);
      setHealthError('');
      setHealthProfile(null);
      setVisualReady(false);
      setActivePanel('home');
      setChatInput('');
      setChatMessages([]);
      setChatLoading(false);
      setChatSessionId(0);
      setChatSessions([]);
      setChatDrawerVisible(false);
      setProfilePanelVisible(false);
      lastChatHealthSessionIdRef.current = null;

      Alert.alert('成功', mode === 'login' ? '登录成功' : '注册并登录成功');
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '';
      const message = localizeErrorMessage(rawMessage, '网络错误，请稍后重试');
      Alert.alert('失败', message);
    } finally {
      setLoading(false);
    }
  };

  const onFetchMe = async () => {
    if (!token) {
      return;
    }

    setLoading(true);
    try {
      const normalizedBase = normalizeApiBase();
      const response = await fetch(`${normalizedBase}/api/auth/me`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const { data } = await readApiResponse<{ message?: string; user?: AuthUser }>(response);

      if (!response.ok || !data?.user) {
        const fallbackMessage =
          response.status >= 500
            ? `服务暂时不可用（HTTP ${response.status}）`
            : `获取用户信息失败（HTTP ${response.status}）`;
        throw new Error(localizeErrorMessage(data?.message ?? '', fallbackMessage));
      }

      setCurrentUser(data.user);
      const persistedSession = readPersistedAuthSession();
      persistAuthSession(token, data.user, persistedSession.startedAtMs ?? Date.now());
      setProfilePanelVisible(false);
      Alert.alert('成功', '资料已刷新');
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '';
      const message = localizeErrorMessage(rawMessage, '请求失败，请稍后重试');
      Alert.alert('失败', message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSleepAdvice = useCallback(
    async (snapshot: HealthSnapshot): Promise<void> => {
      if (!token || !snapshot.sleep || sleepAdviceInFlightRef.current) {
        return;
      }

      const sleepKey = buildSleepStateKey(snapshot);
      if (sleepKey === lastSleepStateKeyRef.current) {
        return;
      }

      sleepAdviceInFlightRef.current = true;
      setSleepAdviceLoading(true);

      try {
        const normalizedBase = normalizeApiBase();
        const response = await fetch(`${normalizedBase}/api/agent/chat/health`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: buildSleepAdvicePrompt(snapshot),
            topK: 4,
            history: [],
            latestHealthSnapshot: snapshot,
          }),
        });

        const { data } = await readApiResponse<{ message?: string; answer?: string }>(response);
        if (!response.ok || typeof data?.answer !== 'string') {
          const fallbackMessage =
            response.status >= 500
              ? `服务暂时不可用（HTTP ${response.status}）`
              : `睡眠建议获取失败（HTTP ${response.status}）`;
          throw new Error(localizeErrorMessage(data?.message ?? '', fallbackMessage));
        }

        setSleepAdvice(toPlainChatText(data.answer));
        setSleepAdviceUpdatedAt(new Date().toISOString());
        lastSleepStateKeyRef.current = sleepKey;
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : '';
        setSleepAdvice(`睡眠建议暂不可用：${localizeErrorMessage(rawMessage, '请稍后重试')}`);
      } finally {
        sleepAdviceInFlightRef.current = false;
        setSleepAdviceLoading(false);
      }
    },
    [token]
  );

  const syncHealthSnapshot = useCallback(
    async ({
      forceMock = false,
      silent = false,
      syncReason = 'manual',
      fallbackToAlertingMock = false,
    }: {
      forceMock?: boolean;
      silent?: boolean;
      syncReason?: 'manual' | 'auto' | 'chat';
      fallbackToAlertingMock?: boolean;
    }): Promise<{ snapshot: HealthSnapshot | null; alerts: HealthRiskSignal[] }> => {
      if (!token) {
        return { snapshot: null, alerts: [] };
      }

      if (healthSyncInFlightRef.current) {
        return { snapshot: latestSnapshotRef.current, alerts: [] };
      }
      healthSyncInFlightRef.current = true;

      if (!silent) {
        setHealthLoading(true);
      }
      setHealthError('');

      try {
        let snapshot = forceMock ? await loadAlertingMockHealthSnapshot() : await loadHealthSnapshot(false);
        if (!forceMock && fallbackToAlertingMock && isSnapshotSparse(snapshot)) {
          snapshot = await loadAlertingMockHealthSnapshot();
        }
        if (LOG_HEALTH_SNAPSHOT_JSON) {
          try {
            console.log(`[health] snapshot_json=${JSON.stringify(snapshot)}`);
          } catch (stringifyError) {
            console.log('[health] snapshot stringify failed', stringifyError);
          }
        }

        const nextSnapshotStateKey = buildSnapshotStateKey(snapshot);
        const snapshotChanged = nextSnapshotStateKey !== lastSnapshotStateKeyRef.current;

        if (snapshotChanged) {
          setHealthSnapshot(snapshot);
          latestSnapshotRef.current = snapshot;
          lastSnapshotStateKeyRef.current = nextSnapshotStateKey;
          setVisualReady(true);
        }

        fetchSleepAdvice(snapshot).catch(() => {});

        const { alerts } = await uploadHealthSnapshotToServer(snapshot, syncReason);
        try {
          const profile = await fetchHealthProfile();
          if (profile) {
            setHealthProfile(profile);
          }
        } catch {
          // Keep chat flow usable even if profile refresh fails.
        }
        return {
          snapshot: snapshotChanged ? snapshot : latestSnapshotRef.current ?? snapshot,
          alerts,
        };
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : '';
        setHealthError(localizeErrorMessage(rawMessage, '读取健康数据失败'));
        return { snapshot: null, alerts: [] };
      } finally {
        healthSyncInFlightRef.current = false;
        if (!silent) {
          setHealthLoading(false);
        }
      }
    },
    [token, fetchSleepAdvice, uploadHealthSnapshotToServer, fetchHealthProfile]
  );

  const ensureHealthSnapshotForChatSession = useCallback(
    async (sessionId: number): Promise<HealthSnapshot | null> => {
      if (!token || sessionId <= 0) {
        return null;
      }

      if (lastChatHealthSessionIdRef.current === sessionId && latestSnapshotRef.current) {
        return latestSnapshotRef.current;
      }

      const result = await syncHealthSnapshot({
        silent: true,
        syncReason: 'chat',
        fallbackToAlertingMock: false,
      });
      if (result.snapshot) {
        lastChatHealthSessionIdRef.current = sessionId;
      }
      return result.snapshot;
    },
    [token, syncHealthSnapshot]
  );

  useEffect(() => {
    if (!token) {
      lastBootstrapTokenRef.current = null;
      setHealthProfile(null);
      return;
    }

    if (lastBootstrapTokenRef.current === token) {
      return;
    }
    lastBootstrapTokenRef.current = token;

    let cancelled = false;
    const bootstrap = async () => {
      setLoading(true);
      try {
        const sessions = await fetchStoredChatSessions();
        if (cancelled) {
          return;
        }
        setChatSessions(sessions);

        const healthSyncResult = await syncHealthSnapshot({
          silent: true,
          syncReason: 'auto',
          fallbackToAlertingMock: false,
        });
        if (cancelled) {
          return;
        }

        const profile = await fetchHealthProfile();
        if (cancelled) {
          return;
        }
        setHealthProfile(profile);
        lastAutoHealthSyncAtRef.current = Date.now();

        if (Platform.OS === 'ios' && healthSyncResult.snapshot && healthSyncResult.alerts.length > 0) {
          presentHealthRiskAlert(healthSyncResult.snapshot, healthSyncResult.alerts, sessions);
        }
      } catch (error) {
        if (!cancelled) {
          const rawMessage = error instanceof Error ? error.message : '';
          setHealthError(localizeErrorMessage(rawMessage, '初始化用户数据失败'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    bootstrap().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [token, fetchStoredChatSessions, syncHealthSnapshot, fetchHealthProfile, presentHealthRiskAlert]);

  const runAutoHealthSync = useCallback(
    async (
      options: {
        existingSessions?: ChatSessionRecord[];
        bypassCooldown?: boolean;
      } = {}
    ): Promise<void> => {
      if (!token || Platform.OS !== 'ios') {
        return;
      }

      const now = Date.now();
      if (
        !options.bypassCooldown &&
        now - lastAutoHealthSyncAtRef.current < AUTO_HEALTH_SYNC_COOLDOWN_MS
      ) {
        return;
      }

      lastAutoHealthSyncAtRef.current = now;
      const result = await syncHealthSnapshot({
        silent: true,
        syncReason: 'auto',
        fallbackToAlertingMock: false,
      });

      if (result.snapshot && result.alerts.length > 0) {
        presentHealthRiskAlert(result.snapshot, result.alerts, options.existingSessions ?? chatSessions);
      }
    },
    [chatSessions, presentHealthRiskAlert, syncHealthSnapshot, token]
  );

  useEffect(() => {
    if (!token || Platform.OS !== 'ios') {
      return;
    }

    appStateRef.current = AppState.currentState;
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const wasInactive = appStateRef.current === 'inactive' || appStateRef.current === 'background';
      appStateRef.current = nextState;
      if (wasInactive && nextState === 'active') {
        runAutoHealthSync({ bypassCooldown: true }).catch(() => {});
      }
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
    const intervalId = setInterval(() => {
      if (appStateRef.current === 'active') {
        runAutoHealthSync().catch(() => {});
      }
    }, AUTO_HEALTH_SYNC_INTERVAL_MS);

    return () => {
      appStateSubscription.remove();
      clearInterval(intervalId);
    };
  }, [token, runAutoHealthSync]);

  useEffect(() => {
    if (!token) {
      setWellnessArticles([]);
      setWellnessArticlesError('');
      setWellnessArticlesUpdatedAt(null);
      return;
    }

    loadWellnessArticles().catch(() => {});
  }, [token, loadWellnessArticles]);

  const onLoadHealthData = async (useMock = false) => {
    if (!canUseHealth) {
      Alert.alert('提示', '请先登录后再读取健康数据');
      return;
    }

    await syncHealthSnapshot({
      forceMock: useMock,
      silent: false,
      syncReason: useMock ? 'manual' : 'manual',
      fallbackToAlertingMock: useMock,
    });
  };

  const onOpenFreshChat = () => {
    if (!token) {
      Alert.alert('提示', '请先登录');
      return;
    }

    setTestMode(false);
    setActivePanel('chat');
    setProfilePanelVisible(false);
    startNewChat({ showAlert: false });
  };

  const onOpenHealthAssistant = () => {
    if (!token) {
      Alert.alert('提示', '请先登录');
      return;
    }

    setTestMode(true);
    setActivePanel('home');
    setProfilePanelVisible(false);
    setChatDrawerVisible(false);
  };

  const chatComposerBottomOffset = Platform.OS === 'ios' ? chatKeyboardInset : 0;
  const chatScrollBottomPadding = chatComposerHeight + chatComposerBottomOffset + 18;

  const onOpenChatSession = (sessionId: number) => {
    const target = chatSessions.find(item => item.id === sessionId);
    if (!target) {
      return;
    }
    setChatSessionId(target.id);
    setChatMessages(target.messages);
    setChatInput('');
    setChatDrawerVisible(false);
    setActivePanel('chat');
    setTestMode(false);
  };

  const onSendChat = async () => {
    const question = chatInput.trim();
    if (!question) {
      return;
    }
    if (!token) {
      Alert.alert('提示', '请先登录');
      return;
    }
    if (chatLoading) {
      return;
    }

    const normalizedBase = normalizeApiBase();
    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content: question,
      createdAt: new Date().toISOString(),
    };
    const previousTurns = chatMessages
      .filter(item => item.role === 'user' || item.role === 'assistant')
      .slice(-12)
      .map(item => ({ role: item.role, content: item.content }));

    setChatInput('');
    setChatDrawerVisible(false);
    setChatMessages(prev => [...prev, userMessage]);
    setChatLoading(true);
    try {
      const latestSnapshotForChat = await ensureHealthSnapshotForChatSession(chatSessionId);

      const response = await fetch(`${normalizedBase}/api/agent/chat/health`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: question,
          topK: 6,
          history: previousTurns,
          latestHealthSnapshot: latestSnapshotForChat ?? undefined,
        }),
      });

      const { data } = await readApiResponse<{
        message?: string;
        answer?: string;
        citations?: Array<{ label?: string; sourceTitle?: string; sectionTitle?: string }>;
      }>(response);

      if (!response.ok || !data?.answer) {
        const fallbackMessage =
          response.status >= 500
            ? `服务暂时不可用（HTTP ${response.status}）`
            : `对话失败（HTTP ${response.status}）`;
        throw new Error(localizeErrorMessage(data?.message ?? '', fallbackMessage));
      }

      const citations: Citation[] = (data.citations ?? [])
        .filter(item => item.label && item.sourceTitle)
        .map(item => ({
          label: item.label as string,
          sourceTitle: item.sourceTitle as string,
          sectionTitle: item.sectionTitle,
        }));
      const plainAnswer = toPlainChatText(data.answer as string);
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: plainAnswer,
        citations,
        createdAt: new Date().toISOString(),
      };

      const nextMessages = [...chatMessages, userMessage, assistantMessage];
      setChatMessages(nextMessages);
      const existingSession = chatSessions.find(item => item.id === chatSessionId);
      persistChatSessionToServer(chatSessionId, nextMessages, existingSession ?? undefined).catch(() => {});
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '';
      const message = localizeErrorMessage(rawMessage, '网络错误，请稍后重试');
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: `本次请求失败：${message}`,
        createdAt: new Date().toISOString(),
      };
      const nextMessages = [...chatMessages, userMessage, assistantMessage];
      setChatMessages(nextMessages);
      const existingSession = chatSessions.find(item => item.id === chatSessionId);
      persistChatSessionToServer(chatSessionId, nextMessages, existingSession ?? undefined).catch(() => {});
    } finally {
      setChatLoading(false);
    }
  };

  const onLogout = () => {
    healthSyncInFlightRef.current = false;
    lastSnapshotStateKeyRef.current = null;
    latestSnapshotRef.current = null;
    lastSleepStateKeyRef.current = null;
    sleepAdviceInFlightRef.current = false;
    lastChatHealthSessionIdRef.current = null;
    lastAutoHealthSyncAtRef.current = 0;
    lastHealthAlertFingerprintRef.current = null;
    lastHealthAlertAtRef.current = 0;
    setChatKeyboardInset(0);
    clearPersistedAuthSession();
    const rememberedLogin = readRememberedLogin();
    setToken('');
    setCurrentUser(null);
    setLoginId(rememberedLogin.enabled ? rememberedLogin.loginId : '');
    setUsername('');
    setEmail('');
    setAge('');
    setGender('');
    setHeightCm('');
    setWeightKg('');
    setExperimentConsent(false);
    setConsentModalVisible(false);
    setName('');
    setPassword(rememberedLogin.enabled ? rememberedLogin.password : '');
    setRememberCredentials(rememberedLogin.enabled);
    setConfirmPassword('');
    setUsernameChecking(false);
    setUsernameAvailable(null);
    setUsernameHint('');
    setHealthSnapshot(null);
    setHealthError('');
    setHealthProfile(null);
    setSleepAdvice('');
    setSleepAdviceLoading(false);
    setSleepAdviceUpdatedAt(null);
    setVisualReady(false);
    setTestMode(false);
    setActivePanel('home');
    setChatInput('');
    setChatMessages([]);
    setChatLoading(false);
    setChatSessionId(0);
    setChatSessions([]);
    setChatDrawerVisible(false);
    setProfilePanelVisible(false);
    setEditorVisible(false);
    setMode('login');
    lastBootstrapTokenRef.current = null;
  };

  const onToggleRememberCredentials = useCallback(() => {
    setRememberCredentials(prev => {
      const next = !prev;
      persistRememberedLogin(next, loginId, password);
      return next;
    });
  }, [loginId, password]);

  const openNicknameEditor = () => {
    setEditorMode('name');
    setEditorValue(currentUser?.name ?? '');
    setEditorVisible(true);
    setProfilePanelVisible(false);
  };

  const openPasswordEditor = () => {
    setEditorMode('password');
    setEditorValue('');
    setEditorVisible(true);
    setProfilePanelVisible(false);
  };

  const onSaveEditor = () => {
    const value = editorValue.trim();

    if (editorMode === 'name') {
      if (!value) {
        Alert.alert('提示', '昵称不能为空');
        return;
      }
      setCurrentUser(prev => (prev ? { ...prev, name: value } : prev));
      setEditorVisible(false);
      Alert.alert('成功', '昵称已更新（本地演示）');
      return;
    }

    if (value.length < 8) {
      Alert.alert('提示', '密码至少8位');
      return;
    }

    setEditorVisible(false);
    Alert.alert('成功', '密码已更新（本地演示）');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.inkHaloTop} />
      <View style={styles.inkHaloBottom} />

      {token ? (
        <>
          {profilePanelVisible ? (
            <>
              <Pressable
                style={styles.profileOverlay}
                onPress={() => setProfilePanelVisible(false)}
              />
              <View style={styles.profilePanel}>
                <Text style={styles.profilePanelTitle}>用户中心</Text>
                <Text style={styles.profilePanelMeta}>用户名：{currentUser?.username ?? '--'}</Text>
                <Text style={styles.profilePanelMeta}>{currentUser?.email ?? '--'}</Text>
                <Text style={styles.profilePanelMeta}>
                  {currentUser?.age ? `${currentUser.age} 岁` : '--'} · {getGenderLabel(currentUser?.gender)}
                </Text>
                <Text style={styles.profilePanelMeta}>
                  身高 {currentUser?.heightCm ?? '--'} cm · 体重 {currentUser?.weightKg ?? '--'} kg
                </Text>
                <Pressable style={styles.profileItemButton} onPress={openNicknameEditor}>
                  <Text style={styles.profileItemText}>更改昵称</Text>
                </Pressable>
                <Pressable style={styles.profileItemButton} onPress={openPasswordEditor}>
                  <Text style={styles.profileItemText}>更改密码</Text>
                </Pressable>
                <Pressable style={styles.profileItemButton} onPress={onFetchMe}>
                  <Text style={styles.profileItemText}>刷新资料</Text>
                </Pressable>
                <Pressable style={styles.profileDangerButton} onPress={onLogout}>
                  <Text style={styles.profileDangerText}>退出登录</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </>
      ) : null}

      <KeyboardAvoidingView
        behavior={
          Platform.OS === 'ios' && activePanel === 'chat'
            ? undefined
            : Platform.OS === 'ios'
              ? 'padding'
              : 'height'
        }
        keyboardVerticalOffset={0}
        style={styles.flex}
      >
        {token && activePanel === 'chat' ? (
          <View style={styles.chatFullscreen}>
            <View style={styles.chatSurface}>
              <View style={styles.chatPanel}>
                <View style={styles.chatHeaderTopRow}>
                  <Pressable
                    style={styles.chatBackButton}
                    onPress={() => {
                      setActivePanel('home');
                      setTestMode(false);
                      setChatDrawerVisible(false);
                    }}
                  >
                    <Text style={styles.chatBackButtonText}>首页</Text>
                  </Pressable>
                  <View style={styles.chatHeaderTitleBlock}>
                    <Text numberOfLines={1} style={styles.chatHeaderTitle}>
                      中医智能对话
                    </Text>
                    <Text numberOfLines={1} style={styles.chatHeaderSubtitle}>
                      {currentSessionType === 'login_health_review' ? '主动健康提醒' : '当前对话'}
                      {' · '}
                      {currentSessionTitle}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.chatProfileButton}
                    onPress={() => setProfilePanelVisible(prev => !prev)}
                  >
                    <View
                      style={[
                        styles.chatProfileCircle,
                        { backgroundColor: avatar.bg, borderColor: avatar.border },
                      ]}
                    >
                      <Text style={styles.avatarText}>{avatar.glyph}</Text>
                    </View>
                  </Pressable>
                </View>

                <View style={styles.chatToolbarRow}>
                  <Pressable
                    style={styles.chatToolbarSecondaryButton}
                    onPress={() => setChatDrawerVisible(prev => !prev)}
                  >
                    <Text style={styles.chatToolbarSecondaryText}>历史</Text>
                  </Pressable>
                  <Pressable
                    style={styles.chatToolbarPrimaryButton}
                    onPress={() => startNewChat({ showAlert: true })}
                  >
                    <Text style={styles.chatToolbarPrimaryText}>新对话</Text>
                  </Pressable>
                </View>

                {chatDrawerVisible ? (
                  <>
                    <Pressable
                      style={styles.chatDrawerBackdrop}
                      onPress={() => setChatDrawerVisible(false)}
                    />
                    <View style={styles.chatDrawerPanel}>
                      <View style={styles.chatDrawerHeader}>
                        <Text style={styles.chatDrawerTitle}>历史会话</Text>
                        <Pressable
                          style={styles.chatDrawerNewButton}
                          onPress={() => startNewChat({ showAlert: true })}
                        >
                          <Text style={styles.chatDrawerNewText}>新建</Text>
                        </Pressable>
                      </View>
                      <ScrollView
                        style={styles.chatDrawerScroll}
                        contentContainerStyle={styles.chatDrawerScrollContent}
                        showsVerticalScrollIndicator
                      >
                        {chatSessions.length === 0 ? (
                          <Text style={styles.chatDrawerEmpty}>暂无历史会话</Text>
                        ) : (
                          chatSessions.map(session => (
                            <Pressable
                              key={`session-${session.id}`}
                              style={[
                                styles.chatDrawerItem,
                                session.id === chatSessionId && styles.chatDrawerItemActive,
                              ]}
                              onPress={() => onOpenChatSession(session.id)}
                            >
                              <Text
                                style={[
                                  styles.chatDrawerItemTitle,
                                  session.id === chatSessionId && styles.chatDrawerItemTitleActive,
                                ]}
                              >
                                {session.title}
                              </Text>
                              {session.summary ? (
                                <Text numberOfLines={2} style={styles.chatDrawerItemSummary}>
                                  {session.summary}
                                </Text>
                              ) : null}
                              <Text style={styles.chatDrawerItemMeta}>
                                {session.sessionType === 'login_health_review' ? '健康提醒' : '对话'}
                                {' · '}
                                {formatDateLabel(session.updatedAt)}
                              </Text>
                            </Pressable>
                          ))
                        )}
                      </ScrollView>
                    </View>
                  </>
                ) : null}

                <ScrollView
                  ref={chatScrollRef}
                  style={styles.chatScroll}
                  contentContainerStyle={[
                    styles.chatScrollContent,
                    { paddingBottom: chatScrollBottomPadding },
                  ]}
                  automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator
                  onContentSizeChange={() => scrollChatToBottom(true)}
                >
                  {chatMessages.map(item => (
                    <View
                      key={item.id}
                      style={[
                        styles.chatBubble,
                        item.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chatBubbleRole,
                          item.role === 'user'
                            ? styles.chatBubbleRoleUser
                            : styles.chatBubbleRoleAssistant,
                        ]}
                      >
                        {item.role === 'user' ? '你' : '岐元灵术'}
                      </Text>
                      <Text
                        style={[
                          styles.chatBubbleText,
                          item.role === 'user'
                            ? styles.chatBubbleTextUser
                            : styles.chatBubbleTextAssistant,
                        ]}
                      >
                        {item.content}
                      </Text>
                    </View>
                  ))}
                </ScrollView>

                <View
                  style={[
                    styles.chatComposer,
                    chatKeyboardInset > 0 ? styles.chatComposerRaised : null,
                    { bottom: 12 + chatComposerBottomOffset },
                  ]}
                  onLayout={(event: LayoutChangeEvent) => {
                    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
                    if (Math.abs(nextHeight - chatComposerHeight) >= 2) {
                      setChatComposerHeight(nextHeight);
                    }
                  }}
                >
                  <TextInput
                    style={styles.chatInput}
                    value={chatInput}
                    onChangeText={setChatInput}
                    onFocus={() => scrollChatToBottom(false)}
                    placeholder="输入你的问题，如：最近焦虑失眠，给我7天计划"
                    placeholderTextColor="#9b8469"
                    multiline
                    editable={!chatLoading}
                  />
                  <Pressable
                    style={[styles.chatSendButton, chatLoading && styles.buttonDisabled]}
                    onPress={onSendChat}
                    disabled={chatLoading}
                  >
                    <Text style={styles.chatSendText}>{chatLoading ? '等待回信...' : '发送'}</Text>
                  </Pressable>
                </View>

                {chatLoading ? (
                  <View style={styles.chatLoadingOverlay}>
                    <View style={styles.chatLoadingCard}>
                      <SealLogo size={42} style={styles.chatLoadingSeal} />
                      <Text style={styles.chatLoadingTitle}>岐元灵术正在推演方略</Text>
                      <Text style={styles.chatLoadingSubtitle}>
                        正在检索经典与健康数据，请稍候
                      </Text>
                      <ActivityIndicator color="#a7342d" style={styles.chatLoadingSpinner} />
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        ) : (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.contentScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {token ? (
              <View style={styles.compactTitleRow}>
                <View style={styles.compactTitleBrand}>
                  <SealLogo size={34} style={styles.compactTitleSeal} />
                  <View style={styles.compactTitleTextWrap}>
                    <Text style={styles.compactCnTitle}>岐元灵术</Text>
                    <Text style={styles.compactSubtitle}>中医养生与 AI 融合实验</Text>
                  </View>
                </View>
                <Pressable
                  style={styles.compactAvatarButton}
                  onPress={() => setProfilePanelVisible(prev => !prev)}
                >
                  <View
                    style={[
                      styles.compactAvatarCircle,
                      { backgroundColor: avatar.bg, borderColor: avatar.border },
                    ]}
                  >
                    <Text style={styles.avatarText}>{avatar.glyph}</Text>
                  </View>
                </Pressable>
              </View>
            ) : (
              <View style={styles.titleBlock}>
                <SealLogo size={44} style={styles.titleSeal} />
                <Text style={styles.cnTitle}>岐元灵术</Text>
                <Text style={styles.enTitle}>QiAlchemy</Text>
                <Text style={styles.subtitle}>中医养生与AI融合实验</Text>
              </View>
            )}

            {!token ? (
              <View style={styles.card}>
                <View style={styles.tabWrap}>
                  <Pressable
                    style={[styles.tabButton, mode === 'login' && styles.tabButtonActive]}
                    onPress={() => {
                      setMode('login');
                      setConfirmPassword('');
                      setConsentModalVisible(false);
                      setUsernameChecking(false);
                      setUsernameAvailable(null);
                      setUsernameHint('');
                    }}
                  >
                    <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>登录</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.tabButton, mode === 'register' && styles.tabButtonActive]}
                    onPress={() => {
                      setMode('register');
                      setLoginId('');
                      setConsentModalVisible(false);
                    }}
                  >
                    <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>注册</Text>
                  </Pressable>
                </View>

                {mode === 'login' ? (
                  <>
                    <Text style={styles.label}>账号</Text>
                    <TextInput
                      autoCapitalize="none"
                      placeholder="请输入用户名或邮箱"
                      placeholderTextColor="#99866b"
                      style={styles.input}
                      value={loginId}
                      onChangeText={setLoginId}
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.label}>用户名</Text>
                    <TextInput
                      autoCapitalize="none"
                      placeholder="请输入用户名（3-24位）"
                      placeholderTextColor="#99866b"
                      style={styles.input}
                      value={username}
                      onChangeText={setUsername}
                    />
                    {usernameChecking ? (
                      <Text style={styles.usernameHint}>正在校验用户名...</Text>
                    ) : usernameHint ? (
                      <Text
                        style={[
                          styles.usernameHint,
                          usernameAvailable === true
                            ? styles.usernameHintSuccess
                            : styles.usernameHintError,
                        ]}
                      >
                        {usernameHint}
                      </Text>
                    ) : (
                      <Text style={styles.usernameHint}>
                        用户名仅支持小写字母、数字和 `_.-` 组合
                      </Text>
                    )}

                    <Text style={styles.label}>昵称（可选）</Text>
                    <TextInput
                      autoCapitalize="none"
                      placeholder="请输入昵称"
                      placeholderTextColor="#99866b"
                      style={styles.input}
                      value={name}
                      onChangeText={setName}
                    />

                    <Text style={styles.label}>邮箱</Text>
                    <TextInput
                      autoCapitalize="none"
                      keyboardType="email-address"
                      placeholder="请输入邮箱地址"
                      placeholderTextColor="#99866b"
                      style={styles.input}
                      value={email}
                      onChangeText={setEmail}
                    />

                    <Text style={styles.label}>年龄</Text>
                    <TextInput
                      keyboardType="number-pad"
                      placeholder="请输入年龄"
                      placeholderTextColor="#99866b"
                      style={styles.input}
                      value={age}
                      onChangeText={setAge}
                    />

                    <Text style={styles.label}>性别</Text>
                    <View style={styles.genderOptionRow}>
                      {GENDER_OPTIONS.map(option => (
                        <Pressable
                          key={option.value}
                          style={[
                            styles.genderOptionChip,
                            gender === option.value && styles.genderOptionChipActive,
                          ]}
                          onPress={() => setGender(option.value)}
                        >
                          <Text
                            style={[
                              styles.genderOptionText,
                              gender === option.value && styles.genderOptionTextActive,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={styles.inlineInputRow}>
                      <View style={styles.inlineInputGroup}>
                        <Text style={styles.label}>身高（cm）</Text>
                        <TextInput
                          keyboardType="decimal-pad"
                          placeholder="170"
                          placeholderTextColor="#99866b"
                          style={styles.input}
                          value={heightCm}
                          onChangeText={setHeightCm}
                        />
                      </View>
                      <View style={styles.inlineInputGroup}>
                        <Text style={styles.label}>体重（kg）</Text>
                        <TextInput
                          keyboardType="decimal-pad"
                          placeholder="60"
                          placeholderTextColor="#99866b"
                          style={styles.input}
                          value={weightKg}
                          onChangeText={setWeightKg}
                        />
                      </View>
                    </View>
                  </>
                )}

                <Text style={styles.label}>密码</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="off"
                  textContentType="none"
                  importantForAutofill="no"
                  autoCorrect={false}
                  spellCheck={false}
                  placeholder={mode === 'login' ? '请输入密码' : '请设置密码（至少8位）'}
                  placeholderTextColor="#99866b"
                  secureTextEntry
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                />

                {mode === 'login' ? (
                  <Pressable style={styles.rememberRow} onPress={onToggleRememberCredentials}>
                    <View
                      style={[
                        styles.rememberCheckbox,
                        rememberCredentials && styles.rememberCheckboxChecked,
                      ]}
                    >
                      {rememberCredentials ? <Text style={styles.rememberCheckmark}>✓</Text> : null}
                    </View>
                    <Text style={styles.rememberText}>记住账号和密码</Text>
                  </Pressable>
                ) : null}

                {mode === 'register' ? (
                  <>
                    <Text style={styles.label}>确认密码</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoComplete="off"
                      textContentType="none"
                      importantForAutofill="no"
                      autoCorrect={false}
                      spellCheck={false}
                      placeholder="请再次输入密码"
                      placeholderTextColor="#99866b"
                      secureTextEntry
                      style={styles.input}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                    />

                    <Pressable
                      style={styles.rememberRow}
                      onPress={() => setExperimentConsent(prev => !prev)}
                    >
                      <View
                        style={[
                          styles.rememberCheckbox,
                          experimentConsent && styles.rememberCheckboxChecked,
                        ]}
                      >
                        {experimentConsent ? <Text style={styles.rememberCheckmark}>✓</Text> : null}
                      </View>
                      <Text style={styles.rememberText}>我愿意参与实验并授权匿名分析</Text>
                    </Pressable>
                  </>
                ) : null}

                <Pressable
                  style={[styles.button, (loading || registerBlocked) && styles.buttonDisabled]}
                  onPress={onSubmit}
                  disabled={loading || registerBlocked}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff5ef" />
                  ) : (
                    <Text style={styles.buttonText}>{mode === 'login' ? '登录' : '注册并登录'}</Text>
                  )}
                </Pressable>

                <Text style={styles.helperText}>登录后可开始你的中医养生AI对话</Text>
              </View>
            ) : null}

            {token && !testMode ? (
              <>
                <View style={[styles.card, styles.homeEntryCard]}>
                  <Text style={styles.testHomeTitle}>欢迎回来，{currentUser?.name || '同学'}</Text>
                  <Text style={styles.testHomeDesc}>从这里开始新对话，或进入健康小助手查看苹果健康提醒与中青年养生文章。</Text>
                  <View style={styles.homePrimaryActionRow}>
                    <Pressable
                      style={[styles.button, styles.homePrimaryActionButton]}
                      onPress={onOpenFreshChat}
                    >
                      <Text style={styles.buttonText}>新对话</Text>
                      <Text style={styles.homePrimaryActionMeta}>开始一次新的中医分析</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.secondaryButton, styles.testEntryButton]}
                      onPress={onOpenHealthAssistant}
                    >
                      <Text style={styles.secondaryButtonText}>健康小助手</Text>
                      <Text style={styles.homeSecondaryActionMeta}>同步苹果健康并查看中青年养生秘笈</Text>
                    </Pressable>
                  </View>
                </View>

                {healthProfile ? (
                  <View style={styles.card}>
                    <Text style={styles.healthProfileTitle}>个人健康记录</Text>
                    <Text style={styles.healthProfileMeta}>
                      {healthProfile.lastSnapshotGeneratedAt
                        ? `最近更新：${formatDateLabel(healthProfile.lastSnapshotGeneratedAt)}`
                        : '最近尚未同步健康快照'}
                    </Text>
                    {healthProfile.llmHealthOverview ? (
                      <Text style={styles.healthProfileOverview}>
                        {localizeLegacyHealthCopy(healthProfile.llmHealthOverview)}
                      </Text>
                    ) : null}
                    {healthProfile.latestSignals.length > 0 ? (
                      <>
                        <Text style={styles.healthProfileSectionTitle}>本次登录识别到的异常</Text>
                        {healthProfile.latestSignals.slice(0, 5).map(signal => (
                          <View key={`latest-${signal.code}`} style={styles.healthProfileItem}>
                            <Text style={styles.healthProfileItemTitle}>
                              {signal.severity === 'high' ? '高' : '中'} · {signal.title}
                            </Text>
                            <Text style={styles.healthProfileItemText}>
                              {localizeLegacyHealthCopy(signal.latestMessage)}
                            </Text>
                          </View>
                        ))}
                      </>
                    ) : (
                      <Text style={styles.healthProfileEmpty}>本次登录未识别到明显异常信号。</Text>
                    )}

                    {healthProfile.trackedSignals.length > 0 ? (
                      <>
                        <Text style={styles.healthProfileSectionTitle}>历史累计记录</Text>
                        {healthProfile.trackedSignals.slice(0, 4).map(signal => (
                          <View key={`tracked-${signal.code}`} style={styles.healthProfileItem}>
                            <Text style={styles.healthProfileItemTitle}>
                              {signal.title} · 共 {signal.occurrenceCount} 次
                            </Text>
                            <Text style={styles.healthProfileItemText}>
                              最近：{formatDateLabel(signal.lastDetectedAt)}
                            </Text>
                          </View>
                        ))}
                      </>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : null}

            {token && testMode ? (
              <View style={[styles.card, styles.cardExpanded]}>
                <View style={styles.testModeHeader}>
                  <Text style={styles.testModeTitle}>健康小助手</Text>
                  <Pressable style={styles.testModeBackButton} onPress={() => setTestMode(false)}>
                    <Text style={styles.testModeBackText}>返回</Text>
                  </Pressable>
                </View>

                <Text style={styles.healthTitle}>{healthPanelTitle}</Text>
                <Text style={styles.healthHint}>{healthHintText}</Text>

                <View style={styles.healthActionRow}>
                  <Pressable
                    style={[styles.healthActionButton, healthLoading && styles.buttonDisabled]}
                    onPress={() => onLoadHealthData(false)}
                    disabled={healthLoading}
                  >
                    <Text style={styles.healthActionText}>{healthRealButtonText}</Text>
                  </Pressable>
                  {isAndroid ? (
                    <Pressable
                      style={[
                        styles.healthActionButton,
                        styles.healthActionButtonSecondary,
                        healthLoading && styles.buttonDisabled,
                      ]}
                      onPress={() => onLoadHealthData(true)}
                      disabled={healthLoading}
                    >
                      <Text style={styles.healthActionText}>使用演示样本</Text>
                    </Pressable>
                  ) : null}
                </View>

                {healthError ? <Text style={styles.healthError}>{healthError}</Text> : null}
                {(sleepAdviceLoading || sleepAdvice) && visualReady ? (
                  <View style={styles.sleepAdviceCard}>
                    <View style={styles.sleepAdviceHeader}>
                      <Text style={styles.sleepAdviceTitle}>中医睡眠建议</Text>
                      {sleepAdviceUpdatedAt ? (
                        <Text style={styles.sleepAdviceTime}>{formatDateLabel(sleepAdviceUpdatedAt)}</Text>
                      ) : null}
                    </View>
                    {sleepAdviceLoading ? (
                      <View style={styles.sleepAdviceLoadingRow}>
                        <ActivityIndicator size="small" color="#a53c32" />
                        <Text style={styles.sleepAdviceLoadingText}>正在生成睡眠调理建议...</Text>
                      </View>
                    ) : (
                      <Text style={styles.sleepAdviceText}>{sleepAdvice}</Text>
                    )}
                  </View>
                ) : null}

                <ScrollView
                  style={styles.visualScroll}
                  contentContainerStyle={styles.visualScrollContent}
                  showsVerticalScrollIndicator
                >
                  {visualReady && healthSnapshot ? (
                    <HealthInsightsBoard snapshot={healthSnapshot} />
                  ) : (
                    <View style={styles.visualPlaceholder}>
                      <Text style={styles.visualPlaceholderText}>{visualPlaceholderText}</Text>
                    </View>
                  )}
                  {visualReady && healthSnapshot && SHOW_HEALTH_RAW_PANEL ? (
                    <SnapshotRawPanel snapshot={healthSnapshot} />
                  ) : null}
                  <WellnessArticleShelf
                    articles={wellnessArticles}
                    error={wellnessArticlesError}
                    loading={wellnessArticlesLoading}
                    lastSyncedAt={wellnessArticlesUpdatedAt}
                    onRefresh={() => {
                      loadWellnessArticles({ forceSync: true }).catch(() => {});
                    }}
                  />
                </ScrollView>
              </View>
            ) : null}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <Modal
        visible={consentModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.editorModalMask}>
          <View style={styles.editorModalCard}>
            <Text style={styles.editorTitle}>参与实验确认</Text>
            <Text style={styles.consentModalText}>
              新账户继续注册前，必须勾选同意参与实验。我们会结合你的基础资料与健康数据做账号级建模，并默认只用于当前实验。
            </Text>
            <Pressable style={styles.rememberRow} onPress={() => setExperimentConsent(prev => !prev)}>
              <View
                style={[
                  styles.rememberCheckbox,
                  experimentConsent && styles.rememberCheckboxChecked,
                ]}
              >
                {experimentConsent ? <Text style={styles.rememberCheckmark}>✓</Text> : null}
              </View>
              <Text style={styles.rememberText}>我已了解并同意参与实验</Text>
            </Pressable>
            <Pressable
              style={[styles.editorConfirmButton, !experimentConsent && styles.buttonDisabled]}
              disabled={!experimentConsent}
              onPress={() => setConsentModalVisible(false)}
            >
              <Text style={styles.editorConfirmText}>继续注册</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditorVisible(false)}
      >
        <View style={styles.editorModalMask}>
          <View style={styles.editorModalCard}>
            <Text style={styles.editorTitle}>{editorMode === 'name' ? '更改昵称' : '更改密码'}</Text>
            <TextInput
              style={styles.editorInput}
              placeholder={editorMode === 'name' ? '请输入新的昵称' : '请输入新的密码（至少8位）'}
              placeholderTextColor="#9a876f"
              value={editorValue}
              onChangeText={setEditorValue}
              secureTextEntry={editorMode === 'password'}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.editorActionRow}>
              <Pressable style={styles.editorCancelButton} onPress={() => setEditorVisible(false)}>
                <Text style={styles.editorCancelText}>取消</Text>
              </Pressable>
              <Pressable style={styles.editorConfirmButton} onPress={onSaveEditor}>
                <Text style={styles.editorConfirmText}>保存</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
    backgroundColor: '#f6eddd',
  },
  inkHaloTop: {
    position: 'absolute',
    top: -100,
    right: -50,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(176, 47, 36, 0.12)',
  },
  inkHaloBottom: {
    position: 'absolute',
    left: -70,
    bottom: -120,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(55, 28, 16, 0.08)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  contentSpacing: {
    paddingTop: 30,
    paddingBottom: 24,
  },
  contentScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 40,
  },
  titleBlock: {
    paddingTop: 8,
  },
  compactTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  compactTitleBrand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  compactTitleSeal: {
    marginBottom: 0,
  },
  compactTitleTextWrap: {
    flex: 1,
  },
  compactAvatarButton: {
    marginLeft: 12,
  },
  compactAvatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 5,
  },
  compactCnTitle: {
    color: '#2f2115',
    fontSize: 24,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'STKaiti' : 'serif',
  },
  compactSubtitle: {
    marginTop: 2,
    color: '#7c664d',
    fontSize: 12,
    lineHeight: 18,
  },
  titleSeal: {
    marginBottom: 14,
  },
  sealLogoFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8c2f28',
    borderWidth: 1,
    borderColor: '#b95a4d',
    overflow: 'hidden',
    shadowColor: '#4f1e1a',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 3,
  },
  sealLogoCore: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8e9d8',
    borderWidth: 1,
    borderColor: '#e5b78f',
  },
  sealLogoGlyph: {
    color: '#8a3028',
    fontWeight: '700',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'STKaiti' : 'serif',
  },
  sealLogoCorner: {
    position: 'absolute',
    backgroundColor: 'rgba(246, 216, 187, 0.95)',
    borderRadius: 2,
  },
  sealLogoCornerTopLeft: {
    top: 3,
    left: 3,
  },
  sealLogoCornerTopRight: {
    top: 3,
    right: 3,
  },
  sealLogoCornerBottomLeft: {
    bottom: 3,
    left: 3,
  },
  sealLogoCornerBottomRight: {
    bottom: 3,
    right: 3,
  },
  sealLogoGloss: {
    position: 'absolute',
    top: 2,
    left: 4,
    width: '60%',
    height: '36%',
    borderRadius: 8,
    backgroundColor: 'rgba(255, 241, 225, 0.25)',
    transform: [{ rotate: '-14deg' }],
  },
  cnTitle: {
    color: '#2f2115',
    fontSize: 34,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'STKaiti' : 'serif',
  },
  enTitle: {
    marginTop: 8,
    color: '#6c4f34',
    fontSize: 24,
    fontWeight: '600',
  },
  subtitle: {
    marginTop: 8,
    color: '#7c664d',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    marginTop: 22,
    borderWidth: 1,
    borderColor: 'rgba(94, 62, 32, 0.2)',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 252, 246, 0.92)',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
  },
  cardExpanded: {
    flex: 1,
    minHeight: 380,
  },
  tabWrap: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ceb28e',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f8efe0',
  },
  tabButtonActive: {
    backgroundColor: '#a7342d',
    borderColor: '#a7342d',
  },
  tabText: {
    color: '#6f5339',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff5ef',
  },
  label: {
    color: '#5f4227',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d8c4a7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#2f2115',
    marginBottom: 16,
    backgroundColor: '#fffdf8',
  },
  inlineInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineInputGroup: {
    flex: 1,
  },
  genderOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  genderOptionChip: {
    borderWidth: 1,
    borderColor: '#d8c4a7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fffdf8',
  },
  genderOptionChipActive: {
    borderColor: '#a7342d',
    backgroundColor: '#fff2eb',
  },
  genderOptionText: {
    color: '#75583a',
    fontSize: 13,
    fontWeight: '600',
  },
  genderOptionTextActive: {
    color: '#a7342d',
  },
  rememberRow: {
    marginTop: -8,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rememberCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#c9b395',
    backgroundColor: '#fffdf8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rememberCheckboxChecked: {
    borderColor: '#a7342d',
    backgroundColor: '#a7342d',
  },
  rememberCheckmark: {
    color: '#fff8f1',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 12,
  },
  rememberText: {
    color: '#75583a',
    fontSize: 13,
    fontWeight: '500',
  },
  usernameHint: {
    marginTop: -10,
    marginBottom: 14,
    marginLeft: 2,
    color: '#8e7659',
    fontSize: 12,
    lineHeight: 16,
  },
  usernameHintSuccess: {
    color: '#2f7a45',
    fontWeight: '600',
  },
  usernameHintError: {
    color: '#9e3328',
    fontWeight: '600',
  },
  button: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#b13c2f',
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  buttonText: {
    color: '#fff5ef',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryButton: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#b13c2f',
    backgroundColor: '#fff6f2',
  },
  secondaryButtonText: {
    color: '#9b362b',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  helperText: {
    marginTop: 12,
    color: '#8e7659',
    fontSize: 12,
    textAlign: 'center',
  },
  chatFullscreen: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  chatSurface: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(94, 62, 32, 0.2)',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 252, 246, 0.94)',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  chatPanel: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  chatHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  chatHeaderTitleBlock: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  chatHeaderTitle: {
    textAlign: 'center',
    color: '#553b24',
    fontSize: 20,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'STKaiti' : 'serif',
  },
  chatHeaderSubtitle: {
    marginTop: 4,
    color: '#8c7358',
    fontSize: 11,
    fontWeight: '600',
  },
  chatBackButton: {
    width: 68,
    borderWidth: 1,
    borderColor: '#cdb28d',
    borderRadius: 999,
    paddingVertical: 8,
    backgroundColor: '#f8efe0',
    alignItems: 'center',
  },
  chatBackButtonText: {
    color: '#6f5339',
    fontSize: 12,
    fontWeight: '700',
  },
  chatProfileButton: {
    width: 68,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatProfileCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 4,
  },
  chatToolbarRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  chatToolbarPrimaryButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#b13c2f',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatToolbarPrimaryText: {
    color: '#fff5ef',
    fontSize: 14,
    fontWeight: '700',
  },
  chatToolbarSecondaryButton: {
    width: 92,
    borderWidth: 1,
    borderColor: '#d4bb97',
    borderRadius: 12,
    backgroundColor: '#fbf4e8',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatToolbarSecondaryText: {
    color: '#6f5339',
    fontSize: 14,
    fontWeight: '700',
  },
  chatDrawerBackdrop: {
    position: 'absolute',
    top: 98,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    zIndex: 55,
    borderRadius: 14,
  },
  chatDrawerPanel: {
    position: 'absolute',
    top: 98,
    left: 0,
    bottom: 64,
    width: '78%',
    borderWidth: 1,
    borderColor: '#d7bf9c',
    backgroundColor: '#fff8ee',
    borderRadius: 12,
    zIndex: 60,
    paddingHorizontal: 10,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 8,
  },
  chatDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  chatDrawerTitle: {
    color: '#5f4329',
    fontSize: 14,
    fontWeight: '700',
  },
  chatDrawerNewButton: {
    borderWidth: 1,
    borderColor: '#b13c2f',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#fff1ec',
  },
  chatDrawerNewText: {
    color: '#a7342d',
    fontSize: 12,
    fontWeight: '700',
  },
  chatDrawerScroll: {
    flex: 1,
  },
  chatDrawerScrollContent: {
    gap: 6,
    paddingBottom: 16,
  },
  chatDrawerEmpty: {
    color: '#8a6f54',
    fontSize: 12,
    lineHeight: 18,
  },
  chatDrawerItem: {
    borderWidth: 1,
    borderColor: 'rgba(111, 83, 57, 0.08)',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 253, 248, 0.88)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chatDrawerItemActive: {
    borderColor: '#b13c2f',
    backgroundColor: '#fff3ec',
  },
  chatDrawerItemTitle: {
    color: '#61462d',
    fontSize: 14,
    fontWeight: '700',
  },
  chatDrawerItemTitleActive: {
    color: '#a7342d',
  },
  chatDrawerItemSummary: {
    marginTop: 4,
    color: '#70563d',
    fontSize: 12,
    lineHeight: 18,
  },
  chatDrawerItemMeta: {
    marginTop: 4,
    color: '#8c7358',
    fontSize: 11,
  },
  chatScroll: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: 'rgba(94, 62, 32, 0.18)',
    borderRadius: 14,
    backgroundColor: 'rgba(255, 252, 246, 0.82)',
  },
  chatScrollContent: {
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 10,
  },
  chatBubble: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  chatBubbleUser: {
    marginLeft: 42,
    backgroundColor: '#b13c2f',
    borderColor: '#a7342d',
  },
  chatBubbleAssistant: {
    marginRight: 42,
    backgroundColor: '#fffdf8',
    borderColor: '#d8c4a7',
  },
  chatBubbleRole: {
    marginBottom: 5,
    fontSize: 11,
    fontWeight: '700',
  },
  chatBubbleRoleUser: {
    color: '#f8dfd8',
  },
  chatBubbleRoleAssistant: {
    color: '#7f6246',
  },
  chatBubbleText: {
    fontSize: 14,
    lineHeight: 21,
  },
  chatBubbleTextUser: {
    color: '#fff7f2',
  },
  chatBubbleTextAssistant: {
    color: '#2f2115',
  },
  chatComposer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(94, 62, 32, 0.12)',
    borderRadius: 16,
    backgroundColor: 'rgba(255, 250, 240, 0.98)',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  chatComposerRaised: {
    shadowOpacity: 0.12,
  },
  chatInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: '#d8c4a7',
    borderRadius: 12,
    backgroundColor: '#fffdf8',
    color: '#2f2115',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
  },
  chatSendButton: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#a7342d',
  },
  chatSendText: {
    color: '#fff5ef',
    fontSize: 14,
    fontWeight: '700',
  },
  chatLoadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(44, 25, 12, 0.26)',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  chatLoadingCard: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ceb28e',
    backgroundColor: '#fffaf0',
    paddingHorizontal: 18,
    paddingVertical: 18,
    alignItems: 'center',
  },
  chatLoadingSeal: {
    marginBottom: 10,
  },
  chatLoadingTitle: {
    color: '#4c311d',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'STKaiti' : 'serif',
  },
  chatLoadingSubtitle: {
    marginTop: 8,
    color: '#7a6248',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  chatLoadingSpinner: {
    marginTop: 12,
  },
  testEntryButton: {
    flex: 1,
    minHeight: 114,
    marginTop: 0,
    justifyContent: 'center',
  },
  homeEntryCard: {
    gap: 14,
  },
  homePrimaryActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  homePrimaryActionButton: {
    flex: 1,
    minHeight: 114,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
  },
  homePrimaryActionMeta: {
    marginTop: 6,
    color: '#f8dfd7',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  homeSecondaryActionMeta: {
    marginTop: 6,
    color: '#8a6b4e',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  homeTertiaryAction: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  homeTertiaryActionText: {
    color: '#8a6544',
    fontSize: 12,
    fontWeight: '600',
  },
  testHomeTitle: {
    color: '#5f4227',
    fontSize: 20,
    fontWeight: '700',
  },
  testHomeDesc: {
    color: '#7d6449',
    fontSize: 14,
    lineHeight: 20,
  },
  healthProfileTitle: {
    color: '#5f4227',
    fontSize: 17,
    fontWeight: '700',
  },
  healthProfileMeta: {
    marginTop: 4,
    color: '#8a6f54',
    fontSize: 11,
  },
  healthProfileOverview: {
    marginTop: 10,
    color: '#6d533a',
    fontSize: 12,
    lineHeight: 18,
  },
  healthProfileSectionTitle: {
    marginTop: 12,
    marginBottom: 6,
    color: '#68492f',
    fontSize: 12,
    fontWeight: '700',
  },
  healthProfileItem: {
    borderWidth: 1,
    borderColor: '#e0cfb6',
    borderRadius: 12,
    backgroundColor: '#fff8ef',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 6,
  },
  healthProfileItemTitle: {
    color: '#5a3f28',
    fontSize: 12,
    fontWeight: '700',
  },
  healthProfileItemText: {
    marginTop: 4,
    color: '#7b654d',
    fontSize: 11,
    lineHeight: 16,
  },
  healthProfileEmpty: {
    marginTop: 10,
    color: '#7e6549',
    fontSize: 12,
    lineHeight: 18,
  },
  testModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  testModeTitle: {
    color: '#5c4027',
    fontSize: 18,
    fontWeight: '700',
  },
  testModeBackButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#b88f67',
    backgroundColor: '#f8efe0',
  },
  testModeBackText: {
    color: '#7a5438',
    fontSize: 12,
    fontWeight: '700',
  },
  healthTitle: {
    marginTop: 10,
    color: '#5f4227',
    fontSize: 14,
    fontWeight: '700',
  },
  healthHint: {
    marginTop: 4,
    color: '#846b50',
    fontSize: 12,
    lineHeight: 18,
  },
  healthActionRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  healthActionButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#b13c2f',
  },
  healthActionButtonSecondary: {
    backgroundColor: '#9b7350',
  },
  healthActionText: {
    color: '#fff5ef',
    fontSize: 13,
    fontWeight: '700',
  },
  healthStatusText: {
    marginTop: 8,
    color: '#6d543a',
    fontSize: 12,
  },
  healthError: {
    marginTop: 8,
    color: '#a7342d',
    fontSize: 12,
  },
  sleepAdviceCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#dbc3a3',
    borderRadius: 12,
    backgroundColor: '#fffaf2',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  sleepAdviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sleepAdviceTitle: {
    color: '#5a3d23',
    fontSize: 13,
    fontWeight: '700',
  },
  sleepAdviceTime: {
    color: '#8b7257',
    fontSize: 10,
  },
  sleepAdviceText: {
    color: '#61482d',
    fontSize: 12,
    lineHeight: 18,
  },
  sleepAdviceLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sleepAdviceLoadingText: {
    color: '#7b6247',
    fontSize: 12,
  },
  visualScroll: {
    marginTop: 10,
    flex: 1,
  },
  visualScrollContent: {
    paddingBottom: 28,
  },
  visualPlaceholder: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#d8c4a7',
    borderRadius: 12,
    backgroundColor: '#fffdf8',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  visualPlaceholderText: {
    color: '#7e684f',
    fontSize: 12,
    lineHeight: 18,
  },
  rawPanel: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(94, 62, 32, 0.22)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(245, 237, 222, 0.96)',
  },
  rawPanelTitle: {
    color: '#573c22',
    fontSize: 14,
    fontWeight: '700',
  },
  rawPanelMeta: {
    marginTop: 4,
    color: '#7a6348',
    fontSize: 11,
  },
  rawRowWrap: {
    marginTop: 8,
    gap: 8,
  },
  rawRowCard: {
    borderWidth: 1,
    borderColor: '#dcc8a9',
    borderRadius: 10,
    backgroundColor: '#fffaf1',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rawLabel: {
    color: '#67492f',
    fontSize: 12,
    fontWeight: '700',
  },
  rawValue: {
    marginTop: 2,
    color: '#513825',
    fontSize: 13,
    fontWeight: '700',
  },
  rawNote: {
    marginTop: 3,
    color: '#80684d',
    fontSize: 11,
  },
  rawWorkoutCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#d9c2a1',
    borderRadius: 10,
    backgroundColor: '#fffaf1',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rawWorkoutTitle: {
    color: '#5f4329',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  rawWorkoutText: {
    color: '#735b40',
    fontSize: 11,
    marginBottom: 3,
    lineHeight: 16,
  },
  avatarText: {
    color: '#fff6ee',
    fontSize: 20,
    fontWeight: '700',
  },
  profileOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    zIndex: 35,
  },
  profilePanel: {
    position: 'absolute',
    top: 112,
    right: 16,
    width: 214,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d9bf9c',
    backgroundColor: '#fffaf1',
    paddingHorizontal: 10,
    paddingVertical: 10,
    zIndex: 40,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  profilePanelTitle: {
    color: '#5a3e25',
    fontSize: 13,
    fontWeight: '700',
  },
  profilePanelMeta: {
    marginTop: 2,
    marginBottom: 8,
    color: '#7f674d',
    fontSize: 11,
  },
  profileItemButton: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#dfc8a8',
    backgroundColor: '#fbf3e6',
    paddingVertical: 8,
    alignItems: 'center',
    marginBottom: 6,
  },
  profileItemText: {
    color: '#664a2f',
    fontSize: 12,
    fontWeight: '700',
  },
  profileDangerButton: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#b13c2f',
    backgroundColor: '#fff4f1',
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 2,
  },
  profileDangerText: {
    color: '#9e3328',
    fontSize: 12,
    fontWeight: '700',
  },
  editorModalMask: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.24)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  editorModalCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d7c0a0',
    backgroundColor: '#fffaf1',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  editorTitle: {
    color: '#5f4329',
    fontSize: 16,
    fontWeight: '700',
  },
  consentModalText: {
    marginTop: 10,
    color: '#71563c',
    fontSize: 13,
    lineHeight: 20,
  },
  editorInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#d8c4a7',
    borderRadius: 10,
    backgroundColor: '#fffdf8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#2f2115',
    fontSize: 15,
  },
  editorActionRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  editorCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ceb28e',
    borderRadius: 10,
    backgroundColor: '#f8efe0',
    alignItems: 'center',
    paddingVertical: 10,
  },
  editorCancelText: {
    color: '#6f5339',
    fontSize: 14,
    fontWeight: '700',
  },
  editorConfirmButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#b13c2f',
    borderRadius: 10,
    backgroundColor: '#b13c2f',
    alignItems: 'center',
    paddingVertical: 10,
  },
  editorConfirmText: {
    color: '#fff5ef',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default App;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Alert,
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
  View,
} from 'react-native';
import {
  loadHealthSnapshot,
  type HealthSnapshot,
  type HealthWorkoutRecord,
} from './src/health/healthData';
import { HealthInsightsBoard } from './src/health/HealthInsightsBoard';

type AuthMode = 'login' | 'register';
type EditorMode = 'name' | 'password';

type AuthUser = {
  id: string;
  username?: string;
  name?: string;
  email: string;
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
};

type ChatSessionRecord = {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type HealthRiskAlertSeverity = 'watch' | 'high';

type HealthRiskAlert = {
  code: string;
  severity: HealthRiskAlertSeverity;
  title: string;
  message: string;
  recommendation?: string;
  value?: number;
  unit?: string;
  triggeredAt?: string;
};

type SealLogoProps = {
  size?: number;
  style?: object;
};

const API_BASE_URL = 'http://43.138.212.17:2818';
const HEALTH_SYNC_INTERVAL_MS = 5 * 60 * 1000;
// Temporary switch: mute 5-minute auto sync/upload while validating iOS HealthKit reads.
const MUTE_AUTO_HEALTH_SYNC = true;
// Temporary switch: mute health snapshot POST to backend to avoid server pressure.
const MUTE_HEALTH_SNAPSHOT_POST = true;
// Debug switch: print full health snapshot JSON after each successful read.
const LOG_HEALTH_SNAPSHOT_JSON = true;
const REMEMBER_LOGIN_SETTINGS_KEY = 'qialchemy.rememberLogin.enabled';
const REMEMBER_LOGIN_ID_SETTINGS_KEY = 'qialchemy.rememberLogin.id';
const REMEMBER_PASSWORD_SETTINGS_KEY = 'qialchemy.rememberLogin.password';
const API_ERROR_MESSAGE_MAP: Record<string, string> = {
  'Email already registered': '邮箱已被注册',
  'Username already registered': '用户名已被占用',
  'Invalid email or password': '邮箱或密码错误',
  'Invalid username or email or password': '用户名/邮箱或密码错误',
  'Invalid username format': '用户名格式不合法',
  Unauthorized: '未授权，请重新登录',
  'Route not found': '接口不存在',
  'Validation failed': '请求参数不合法',
  'login or email is required': '请输入用户名或邮箱',
};

const AVATAR_BG_COLORS = ['#a7342d', '#8a5d3b', '#7a4f2e', '#9c3a31', '#6c4d2f', '#8d6a45'];
const AVATAR_BORDER_COLORS = ['#c89f74', '#b78d65', '#c39768', '#c88b79', '#b98f62', '#c6a57e'];
const USERNAME_REGEX = /^[a-z0-9_][a-z0-9_.-]{2,23}$/;

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

  const rows = [
    {
      label: '活动趋势点',
      value: `${snapshot.activity?.stepsHourlySeriesToday?.length ?? 0} / ${snapshot.activity?.activeEnergyHourlySeriesToday?.length ?? 0} / ${snapshot.activity?.exerciseMinutesHourlySeriesToday?.length ?? 0}`,
      note: `步数/活动能量/运动分钟 · 圆环目标 Move ${formatMetric(snapshot.activity?.activeEnergyGoalKcal)} kcal / Exercise ${formatMetric(snapshot.activity?.exerciseGoalMinutes)} min / Stand ${formatMetric(snapshot.activity?.standGoalHours)} h`,
    },
    {
      label: '睡眠样本',
      value: `${snapshot.sleep?.samplesLast36h?.length ?? 0}`,
      note: `分期统计: Core ${formatMetric(snapshot.sleep?.stageMinutesLast36h?.asleepCoreMinutes)} min, Deep ${formatMetric(snapshot.sleep?.stageMinutesLast36h?.asleepDeepMinutes)} min, REM ${formatMetric(snapshot.sleep?.stageMinutesLast36h?.asleepREMMinutes)} min, Apnea ${formatMetric(snapshot.sleep?.apnea?.eventCountLast30d)} 次`,
    },
    {
      label: '心率趋势点',
      value: `${snapshot.heart?.heartRateSeriesLast24h?.length ?? 0}`,
      note: `HRV 趋势点: ${snapshot.heart?.heartRateVariabilitySeriesLast7d?.length ?? 0}`,
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
      note: `今日日照: ${formatMetric(snapshot.environment?.daylightMinutesToday)} 分钟`,
    },
    {
      label: '体征趋势点',
      value: `${snapshot.body?.respiratoryRateSeriesLast7d?.length ?? 0} / ${snapshot.heart?.heartRateVariabilitySeriesLast7d?.length ?? 0} / ${snapshot.body?.bodyMassSeriesLast30d?.length ?? 0}`,
      note: '呼吸/HRV/体重',
    },
  ];

  return (
    <View style={styles.rawPanel}>
      <Text style={styles.rawPanelTitle}>全量字段核验面板</Text>
      <Text style={styles.rawPanelMeta}>采集时间：{formatDateLabel(snapshot.generatedAt)}</Text>
      <Text style={styles.rawPanelMeta}>数据源：{snapshot.source === 'mock' ? 'Mock' : 'HealthKit 真机'}</Text>

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
        <Text style={styles.rawWorkoutTitle}>最近运动记录（Top 3）</Text>
        {latestWorkouts.length === 0 ? (
          <Text style={styles.rawWorkoutText}>暂无记录</Text>
        ) : (
          latestWorkouts.map((workout: HealthWorkoutRecord, index) => (
            <Text key={`${workout.startDate ?? 'unknown'}-${index}`} style={styles.rawWorkoutText}>
              {index + 1}. {workout.activityTypeName ?? workout.activityTypeCode ?? '未知'} ·
              时长 {formatMetric(workout.durationMinutes)} 分钟 ·
              能量 {formatMetric(workout.totalEnergyKcal)} kcal ·
              距离 {formatMetric(workout.totalDistanceKm, 2)} km
            </Text>
          ))
        )}
      </View>
    </View>
  );
}

function readRememberedLogin(): { enabled: boolean; loginId: string; password: string } {
  if (Platform.OS !== 'ios') {
    return { enabled: false, loginId: '', password: '' };
  }

  const rawEnabled = Settings.get(REMEMBER_LOGIN_SETTINGS_KEY);
  const enabled =
    rawEnabled === undefined || rawEnabled === null ? true : !(rawEnabled === false || rawEnabled === 'false');

  const rawLoginId = Settings.get(REMEMBER_LOGIN_ID_SETTINGS_KEY);
  const rawPassword = Settings.get(REMEMBER_PASSWORD_SETTINGS_KEY);

  return {
    enabled,
    loginId: typeof rawLoginId === 'string' ? rawLoginId : '',
    password: typeof rawPassword === 'string' ? rawPassword : '',
  };
}

function persistRememberedLogin(enabled: boolean, loginId = '', password = ''): void {
  if (Platform.OS !== 'ios') {
    return;
  }

  if (!enabled) {
    Settings.set({
      [REMEMBER_LOGIN_SETTINGS_KEY]: false,
      [REMEMBER_LOGIN_ID_SETTINGS_KEY]: '',
      [REMEMBER_PASSWORD_SETTINGS_KEY]: '',
    });
    return;
  }

  Settings.set({
    [REMEMBER_LOGIN_SETTINGS_KEY]: true,
    [REMEMBER_LOGIN_ID_SETTINGS_KEY]: loginId.trim(),
    [REMEMBER_PASSWORD_SETTINGS_KEY]: password,
  });
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
  const [mode, setMode] = useState<AuthMode>('login');
  const [rememberCredentials, setRememberCredentials] = useState(rememberedLoginAtLaunch.enabled);
  const [loginId, setLoginId] = useState(rememberedLoginAtLaunch.loginId);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(rememberedLoginAtLaunch.password);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameHint, setUsernameHint] = useState('');
  const [token, setToken] = useState('');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);

  const [testMode, setTestMode] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthSnapshot, setHealthSnapshot] = useState<HealthSnapshot | null>(null);
  const [healthError, setHealthError] = useState('');
  const [healthAuthorized, setHealthAuthorized] = useState<boolean | null>(null);
  const [autoHealthSyncEnabled, setAutoHealthSyncEnabled] = useState(false);
  const [autoHealthSyncing, setAutoHealthSyncing] = useState(false);
  const [lastHealthSyncAt, setLastHealthSyncAt] = useState<string | null>(null);
  const [lastHealthUploadAt, setLastHealthUploadAt] = useState<string | null>(null);
  const [lastHealthSource, setLastHealthSource] = useState<'healthkit' | 'mock' | null>(null);
  const [visualReady, setVisualReady] = useState(false);
  const [activePanel, setActivePanel] = useState<AppPanel>('home');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSessionId, setChatSessionId] = useState(0);
  const [chatSessions, setChatSessions] = useState<ChatSessionRecord[]>([]);
  const [chatDrawerVisible, setChatDrawerVisible] = useState(false);
  const [riskAlertPermission, setRiskAlertPermission] = useState<boolean | null>(null);
  const [lastRiskAlertFingerprint, setLastRiskAlertFingerprint] = useState<string | null>(null);

  const [profilePanelVisible, setProfilePanelVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('name');
  const [editorValue, setEditorValue] = useState('');
  const [avatarSeed, setAvatarSeed] = useState(() => Math.floor(Math.random() * 100000));
  const chatScrollRef = useRef<ScrollView | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const healthSyncInFlightRef = useRef(false);
  const healthSyncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canUseHealth = Boolean(token);

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
      return '会话 #1';
    }
    return chatSessions.find(item => item.id === chatSessionId)?.title ?? `会话 #${chatSessionId}`;
  }, [chatSessionId, chatSessions]);

  const createMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const scrollChatToBottom = (animated = true) => {
    requestAnimationFrame(() => {
      chatScrollRef.current?.scrollToEnd({ animated });
    });
  };

  const getSessionTitle = useCallback((messages: ChatMessage[], sessionId: number): string => {
    const firstUser = messages.find(item => item.role === 'user');
    if (!firstUser?.content) {
      return `会话 #${sessionId}`;
    }

    const normalized = firstUser.content.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return `会话 #${sessionId}`;
    }

    return normalized.length > 16 ? `${normalized.slice(0, 16)}...` : normalized;
  }, []);

  const upsertChatSession = useCallback(
    (sessionId: number, messages: ChatMessage[], createdAtHint?: string) => {
      const nowIso = new Date().toISOString();
      setChatSessions(prev => {
        const nextTitle = getSessionTitle(messages, sessionId);
        const existing = prev.find(item => item.id === sessionId);
        const createdAt = existing?.createdAt ?? createdAtHint ?? nowIso;
        const updatedRecord: ChatSessionRecord = {
          id: sessionId,
          title: nextTitle,
          createdAt,
          updatedAt: nowIso,
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
    }: { showAlert?: boolean; introText?: string; title?: string } = {}) => {
      const nextSessionId = chatSessionId + 1;
      const initialMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content:
          introText ??
          '新对话已开始。请告诉我你最近最困扰的健康问题，我会结合中医思路给出7天可执行建议。',
      };

      setChatSessionId(nextSessionId);
      setChatMessages([initialMessage]);
      setChatInput('');
      setChatDrawerVisible(false);

      const createdAt = new Date().toISOString();
      setChatSessions(prev => {
        const initialRecord: ChatSessionRecord = {
          id: nextSessionId,
          title: title ?? `会话 #${nextSessionId}`,
          createdAt,
          updatedAt: createdAt,
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
    [chatSessionId]
  );

  const askRiskAlertPermission = useCallback((): Promise<boolean> => {
    return new Promise(resolve => {
      Alert.alert(
        '风险弹窗权限',
        '检测到健康异常时，是否允许应用弹窗提醒并引导你进入新对话？',
        [
          {
            text: '暂不允许',
            style: 'cancel',
            onPress: () => {
              setRiskAlertPermission(false);
              resolve(false);
            },
          },
          {
            text: '允许',
            onPress: () => {
              setRiskAlertPermission(true);
              resolve(true);
            },
          },
        ],
        { cancelable: false }
      );
    });
  }, []);

  const ensureRiskAlertPermission = useCallback(async (): Promise<boolean> => {
    if (riskAlertPermission !== null) {
      return riskAlertPermission;
    }
    return askRiskAlertPermission();
  }, [askRiskAlertPermission, riskAlertPermission]);

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
  }, [activePanel, chatMessages.length]);

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

    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';

      let body: Record<string, string>;
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
      setTestMode(false);
      setHealthSnapshot(null);
      setHealthError('');
      setHealthAuthorized(null);
      setAutoHealthSyncEnabled(false);
      setAutoHealthSyncing(false);
      setLastHealthSyncAt(null);
      setLastHealthUploadAt(null);
      setLastHealthSource(null);
      setVisualReady(false);
      setActivePanel('home');
      setChatInput('');
      setChatMessages([]);
      setChatLoading(false);
      setChatSessionId(0);
      setChatSessions([]);
      setChatDrawerVisible(false);
      setRiskAlertPermission(null);
      setLastRiskAlertFingerprint(null);
      setProfilePanelVisible(false);

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

  const uploadHealthSnapshotToBackend = useCallback(
    async (snapshot: HealthSnapshot): Promise<{ uploadedAt: string; alerts: HealthRiskAlert[] }> => {
      if (!token) {
        throw new Error('未登录，无法上传健康快照');
      }

      const normalizedBase = normalizeApiBase();
      const response = await fetch(`${normalizedBase}/api/health/snapshots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ snapshot }),
      });

      const { data } = await readApiResponse<{
        message?: string;
        uploadedAt?: string;
        alerts?: HealthRiskAlert[];
      }>(response);
      if (!response.ok || !data?.uploadedAt) {
        const fallbackMessage =
          response.status >= 500
            ? `服务暂时不可用（HTTP ${response.status}）`
            : `健康快照上传失败（HTTP ${response.status}）`;
        throw new Error(localizeErrorMessage(data?.message ?? '', fallbackMessage));
      }
      return { uploadedAt: data.uploadedAt, alerts: data.alerts ?? [] };
    },
    [token]
  );

  const buildRiskAlertFingerprint = useCallback((alerts: HealthRiskAlert[]): string => {
    return alerts
      .map(item => `${item.code}:${item.severity}`)
      .sort()
      .join('|');
  }, []);

  const buildRiskConversationPrompt = useCallback((alerts: HealthRiskAlert[]): string => {
    const lines = alerts.map(
      (item, index) =>
        `${index + 1}. ${item.title}：${item.message}${item.recommendation ? `（建议：${item.recommendation}）` : ''}`
    );
    return [
      '我刚收到系统健康风险提醒，请按轻重缓急解释风险，并给我今天和未来7天可执行建议：',
      ...lines,
    ].join('\n');
  }, []);

  const openRiskConversation = useCallback(
    (alerts: HealthRiskAlert[]) => {
      setProfilePanelVisible(false);
      setTestMode(false);
      setActivePanel('chat');
      const started = startNewChat({
        showAlert: false,
        introText:
          '检测到健康风险提醒。已在输入框生成问题草稿，点击“发送”即可让我先解释风险，再给出行动计划。',
        title: '健康风险跟进',
      });
      setChatInput(buildRiskConversationPrompt(alerts));
      setChatDrawerVisible(false);
      upsertChatSession(started.sessionId, [started.initialMessage], new Date().toISOString());
    },
    [buildRiskConversationPrompt, startNewChat, upsertChatSession]
  );

  const handleRiskAlerts = useCallback(
    async (alerts: HealthRiskAlert[]) => {
      if (alerts.length === 0) {
        setLastRiskAlertFingerprint(null);
        return;
      }

      const allowed = await ensureRiskAlertPermission();
      if (!allowed) {
        return;
      }

      const fingerprint = buildRiskAlertFingerprint(alerts);
      if (lastRiskAlertFingerprint === fingerprint) {
        return;
      }

      setLastRiskAlertFingerprint(fingerprint);
      const body = alerts
        .map(
          (item, index) =>
            `${index + 1}. ${item.title}\n${item.message}${item.recommendation ? `\n建议：${item.recommendation}` : ''}`
        )
        .join('\n\n');

      Alert.alert('健康风险提醒', body, [
        { text: '稍后处理', style: 'cancel' },
        {
          text: '立即进入新对话',
          onPress: () => {
            openRiskConversation(alerts);
          },
        },
      ]);
    },
    [
      buildRiskAlertFingerprint,
      ensureRiskAlertPermission,
      lastRiskAlertFingerprint,
      openRiskConversation,
    ]
  );

  const syncHealthSnapshot = useCallback(
    async ({
      forceMock = false,
      silent = false,
      reason = 'manual',
    }: {
      forceMock?: boolean;
      silent?: boolean;
      reason?: 'manual' | 'auto' | 'chat';
    }): Promise<HealthSnapshot | null> => {
      if (!token) {
        return null;
      }

      if (healthSyncInFlightRef.current) {
        return null;
      }
      healthSyncInFlightRef.current = true;

      if (!silent) {
        setHealthLoading(true);
      }
      if (reason === 'auto') {
        setAutoHealthSyncing(true);
      }
      setHealthError('');

      try {
        const snapshot = await loadHealthSnapshot(forceMock);
        if (LOG_HEALTH_SNAPSHOT_JSON) {
          try {
            console.log(`[health][${reason}] snapshot_json=${JSON.stringify(snapshot)}`);
          } catch (stringifyError) {
            console.log('[health] snapshot stringify failed', stringifyError);
          }
        }

        setHealthSnapshot(snapshot);
        setVisualReady(true);
        setHealthAuthorized(Boolean(snapshot.authorized));
        setLastHealthSource(snapshot.source);

        const nowIso = new Date().toISOString();
        setLastHealthSyncAt(nowIso);

        if (MUTE_HEALTH_SNAPSHOT_POST) {
          setLastHealthUploadAt(null);
        } else {
          try {
            const uploaded = await uploadHealthSnapshotToBackend(snapshot);
            setLastHealthUploadAt(uploaded.uploadedAt);
            await handleRiskAlerts(uploaded.alerts ?? []);
          } catch (uploadError) {
            const uploadMessage = uploadError instanceof Error ? uploadError.message : '';
            setHealthError(localizeErrorMessage(uploadMessage, '健康数据读取成功，但上传失败'));
          }
        }

        return snapshot;
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : '';
        setHealthError(localizeErrorMessage(rawMessage, '读取健康数据失败'));
        return null;
      } finally {
        healthSyncInFlightRef.current = false;
        if (!silent) {
          setHealthLoading(false);
        }
        if (reason === 'auto') {
          setAutoHealthSyncing(false);
        }
      }
    },
    [token, uploadHealthSnapshotToBackend, handleRiskAlerts]
  );

  const ensureFreshHealthSnapshotForChat = useCallback(async (): Promise<HealthSnapshot | null> => {
    if (!token) {
      return null;
    }

    const current = healthSnapshot;
    if (!current?.generatedAt) {
      return syncHealthSnapshot({ silent: true, reason: 'chat' });
    }

    const generatedAtMs = new Date(current.generatedAt).getTime();
    if (!Number.isFinite(generatedAtMs)) {
      return syncHealthSnapshot({ silent: true, reason: 'chat' });
    }

    const ageMs = Date.now() - generatedAtMs;
    if (ageMs >= HEALTH_SYNC_INTERVAL_MS) {
      return syncHealthSnapshot({ silent: true, reason: 'chat' });
    }

    return current;
  }, [token, healthSnapshot, syncHealthSnapshot]);

  const onLoadHealthData = async (useMock = false) => {
    if (!canUseHealth) {
      Alert.alert('提示', '请先登录后再读取健康数据');
      return;
    }

    setAutoHealthSyncEnabled(!MUTE_AUTO_HEALTH_SYNC);
    void ensureRiskAlertPermission();
    await syncHealthSnapshot({
      forceMock: useMock,
      silent: false,
      reason: 'manual',
    });
  };

  useEffect(() => {
    if (!token || !autoHealthSyncEnabled || MUTE_AUTO_HEALTH_SYNC) {
      if (healthSyncTimerRef.current) {
        clearInterval(healthSyncTimerRef.current);
        healthSyncTimerRef.current = null;
      }
      setAutoHealthSyncing(false);
      return;
    }

    const runAutoSync = async () => {
      await syncHealthSnapshot({ forceMock: false, silent: true, reason: 'auto' });
    };

    runAutoSync();
    healthSyncTimerRef.current = setInterval(runAutoSync, HEALTH_SYNC_INTERVAL_MS);

    return () => {
      if (healthSyncTimerRef.current) {
        clearInterval(healthSyncTimerRef.current);
        healthSyncTimerRef.current = null;
      }
      setAutoHealthSyncing(false);
    };
  }, [token, autoHealthSyncEnabled, syncHealthSnapshot]);

  useEffect(() => {
    if (!token || !autoHealthSyncEnabled || MUTE_AUTO_HEALTH_SYNC) {
      return;
    }

    const subscription = AppState.addEventListener('change', nextState => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;
      if ((prevState === 'background' || prevState === 'inactive') && nextState === 'active') {
        syncHealthSnapshot({ forceMock: false, silent: true, reason: 'auto' }).catch(() => {});
      }
    });

    return () => {
      subscription.remove();
    };
  }, [token, autoHealthSyncEnabled, syncHealthSnapshot]);

  const onOpenChat = () => {
    if (!token) {
      Alert.alert('提示', '请先登录');
      return;
    }
    setTestMode(false);
    setActivePanel('chat');
    if (chatSessionId <= 0 || chatMessages.length === 0) {
      startNewChat({ showAlert: false });
    }
    setChatDrawerVisible(false);
    setProfilePanelVisible(false);
  };

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
      const latestSnapshotForChat = await ensureFreshHealthSnapshotForChat();

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

      setChatMessages(prev => [
        ...prev,
        {
          id: createMessageId(),
          role: 'assistant',
          content: plainAnswer,
          citations,
        },
      ]);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '';
      const message = localizeErrorMessage(rawMessage, '网络错误，请稍后重试');
      setChatMessages(prev => [
        ...prev,
        {
          id: createMessageId(),
          role: 'assistant',
          content: `本次请求失败：${message}`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const onLogout = () => {
    if (healthSyncTimerRef.current) {
      clearInterval(healthSyncTimerRef.current);
      healthSyncTimerRef.current = null;
    }
    healthSyncInFlightRef.current = false;
    const rememberedLogin = readRememberedLogin();
    setToken('');
    setCurrentUser(null);
    setLoginId(rememberedLogin.enabled ? rememberedLogin.loginId : '');
    setUsername('');
    setEmail('');
    setName('');
    setPassword(rememberedLogin.enabled ? rememberedLogin.password : '');
    setRememberCredentials(rememberedLogin.enabled);
    setConfirmPassword('');
    setUsernameChecking(false);
    setUsernameAvailable(null);
    setUsernameHint('');
    setHealthSnapshot(null);
    setHealthError('');
    setHealthAuthorized(null);
    setAutoHealthSyncEnabled(false);
    setAutoHealthSyncing(false);
    setLastHealthSyncAt(null);
    setLastHealthUploadAt(null);
    setLastHealthSource(null);
    setVisualReady(false);
    setTestMode(false);
    setActivePanel('home');
    setChatInput('');
    setChatMessages([]);
    setChatLoading(false);
    setChatSessionId(0);
    setChatSessions([]);
    setChatDrawerVisible(false);
    setRiskAlertPermission(null);
    setLastRiskAlertFingerprint(null);
    setProfilePanelVisible(false);
    setEditorVisible(false);
    setMode('login');
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
          <Pressable
            style={styles.avatarButton}
            onPress={() => setProfilePanelVisible(prev => !prev)}
          >
            <View
              style={[
                styles.avatarCircle,
                { backgroundColor: avatar.bg, borderColor: avatar.border },
              ]}
            >
              <Text style={styles.avatarText}>{avatar.glyph}</Text>
            </View>
          </Pressable>

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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        {token && activePanel === 'chat' ? (
          <View style={styles.chatFullscreen}>
            <View style={styles.chatSurface}>
              <View style={styles.chatPanel}>
                <View style={styles.chatHeaderRow}>
                  <Pressable
                    style={styles.chatHeaderButton}
                    onPress={() => setChatDrawerVisible(prev => !prev)}
                  >
                    <Text style={styles.chatHeaderButtonText}>会话历史</Text>
                  </Pressable>
                  <Text style={styles.chatHeaderTitle}>中医智能对话</Text>
                  <View style={styles.chatHeaderActionGroup}>
                    <Pressable
                      style={styles.chatHeaderButtonCompact}
                      onPress={() => {
                        setActivePanel('home');
                        setTestMode(false);
                        setChatDrawerVisible(false);
                      }}
                    >
                      <Text style={styles.chatHeaderButtonText}>首页</Text>
                    </Pressable>
                    <Pressable
                      style={styles.chatHeaderButtonCompact}
                      onPress={() => startNewChat({ showAlert: true })}
                    >
                      <Text style={styles.chatHeaderButtonText}>新聊天</Text>
                    </Pressable>
                  </View>
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
                              <Text style={styles.chatDrawerItemMeta}>
                                {formatDateLabel(session.updatedAt)} · {session.messages.length} 条消息
                              </Text>
                            </Pressable>
                          ))
                        )}
                      </ScrollView>
                    </View>
                  </>
                ) : null}

                <View style={styles.chatSessionRow}>
                  <Text style={styles.chatSessionTag}>会话 #{chatSessionId}（独立上下文）</Text>
                  <Text style={styles.chatSessionTitle}>{currentSessionTitle}</Text>
                </View>
                <Text style={styles.chatPromptHint}>
                  左侧会话历史支持快速回看和切换旧对话。
                </Text>
                {riskAlertPermission !== null ? (
                  <Text style={styles.chatRiskPermissionStatus}>
                    风险弹窗权限：{riskAlertPermission ? '已允许' : '未允许'}
                  </Text>
                ) : null}

                <ScrollView
                  ref={chatScrollRef}
                  style={styles.chatScroll}
                  contentContainerStyle={styles.chatScrollContent}
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
                      {item.role === 'assistant' && item.citations && item.citations.length > 0 ? (
                        <View style={styles.chatCitationBox}>
                          {item.citations.slice(0, 3).map((citation, idx) => (
                            <Text key={`${item.id}-c-${idx}`} style={styles.chatCitationText}>
                              {citation.label} · {citation.sourceTitle}
                              {citation.sectionTitle ? ` · ${citation.sectionTitle}` : ''}
                            </Text>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.chatComposer}>
                  <TextInput
                    style={styles.chatInput}
                    value={chatInput}
                    onChangeText={setChatInput}
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
          <View style={[styles.content, styles.contentSpacing]}>
            <View style={styles.titleBlock}>
              <SealLogo size={44} style={styles.titleSeal} />
              <Text style={styles.cnTitle}>岐元灵术</Text>
              <Text style={styles.enTitle}>QiAlchemy</Text>
              <Text style={styles.subtitle}>中医养生与AI融合实验</Text>
            </View>

            {!token ? (
              <View style={styles.card}>
                <View style={styles.tabWrap}>
                  <Pressable
                    style={[styles.tabButton, mode === 'login' && styles.tabButtonActive]}
                    onPress={() => {
                      setMode('login');
                      setConfirmPassword('');
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
              <View style={styles.card}>
                <Text style={styles.testHomeTitle}>欢迎回来，{currentUser?.name || '同学'}</Text>
                <Text style={styles.testHomeDesc}>请选择功能入口：开始聊天或进入测试模式。</Text>
                <View style={styles.testEntryRow}>
                  <Pressable style={[styles.button, styles.testEntryButton]} onPress={onOpenChat}>
                    <Text style={styles.buttonText}>开始聊天</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryButton, styles.testEntryButton]}
                    onPress={() => setTestMode(true)}
                  >
                    <Text style={styles.secondaryButtonText}>测试模式</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {token && testMode ? (
              <View style={[styles.card, styles.cardExpanded]}>
                <View style={styles.testModeHeader}>
                  <Text style={styles.testModeTitle}>测试模式</Text>
                  <Pressable style={styles.testModeBackButton} onPress={() => setTestMode(false)}>
                    <Text style={styles.testModeBackText}>返回</Text>
                  </Pressable>
                </View>

                <Text style={styles.healthTitle}>HealthKit 全量数据读取</Text>
                <Text style={styles.healthHint}>点击读取真实数据或 Mock 数据，读取后进入可视化页面。</Text>

                <View style={styles.healthActionRow}>
                  <Pressable
                    style={[styles.healthActionButton, healthLoading && styles.buttonDisabled]}
                    onPress={() => onLoadHealthData(false)}
                    disabled={healthLoading}
                  >
                    <Text style={styles.healthActionText}>读取真实数据</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.healthActionButton,
                      styles.healthActionButtonSecondary,
                      healthLoading && styles.buttonDisabled,
                    ]}
                    onPress={() => onLoadHealthData(true)}
                    disabled={healthLoading}
                  >
                    <Text style={styles.healthActionText}>读取 Mock 数据</Text>
                  </Pressable>
                </View>

                {healthError ? <Text style={styles.healthError}>{healthError}</Text> : null}

                {visualReady && healthSnapshot ? (
                  <ScrollView
                    style={styles.visualScroll}
                    contentContainerStyle={styles.visualScrollContent}
                    showsVerticalScrollIndicator
                  >
                    <HealthInsightsBoard snapshot={healthSnapshot} />
                    <SnapshotRawPanel snapshot={healthSnapshot} />
                  </ScrollView>
                ) : (
                  <View style={styles.visualPlaceholder}>
                    <Text style={styles.visualPlaceholderText}>
                      点击“读取 Mock 数据”后，将进入中国风健康数据可视化页面（可上下滑动）。
                    </Text>
                  </View>
                )}
              </View>
            ) : null}
          </View>
        )}
      </KeyboardAvoidingView>

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
  titleBlock: {
    paddingTop: 8,
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
  chatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  chatHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#553b24',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'STKaiti' : 'serif',
  },
  chatHeaderButton: {
    minWidth: 86,
    borderWidth: 1,
    borderColor: '#cdb28d',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: '#f8efe0',
    alignItems: 'center',
  },
  chatHeaderActionGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  chatHeaderButtonCompact: {
    minWidth: 58,
    borderWidth: 1,
    borderColor: '#cdb28d',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 8,
    backgroundColor: '#f8efe0',
    alignItems: 'center',
  },
  chatHeaderButtonText: {
    color: '#6f5339',
    fontSize: 12,
    fontWeight: '700',
  },
  chatDrawerBackdrop: {
    position: 'absolute',
    top: 46,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    zIndex: 55,
    borderRadius: 14,
  },
  chatDrawerPanel: {
    position: 'absolute',
    top: 46,
    left: 0,
    bottom: 64,
    width: '72%',
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
    gap: 8,
    paddingBottom: 16,
  },
  chatDrawerEmpty: {
    color: '#8a6f54',
    fontSize: 12,
    lineHeight: 18,
  },
  chatDrawerItem: {
    borderWidth: 1,
    borderColor: '#dfccb0',
    borderRadius: 10,
    backgroundColor: '#fffdf8',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chatDrawerItemActive: {
    borderColor: '#b13c2f',
    backgroundColor: '#fff2eb',
  },
  chatDrawerItemTitle: {
    color: '#61462d',
    fontSize: 13,
    fontWeight: '700',
  },
  chatDrawerItemTitleActive: {
    color: '#a7342d',
  },
  chatDrawerItemMeta: {
    marginTop: 4,
    color: '#8c7358',
    fontSize: 11,
  },
  chatSessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  chatSessionTag: {
    color: '#8c7258',
    fontSize: 12,
  },
  chatSessionTitle: {
    flex: 1,
    textAlign: 'right',
    color: '#6f5338',
    fontSize: 12,
    fontWeight: '600',
  },
  chatPromptHint: {
    marginBottom: 8,
    color: '#8a6f54',
    fontSize: 11,
    lineHeight: 16,
  },
  chatRiskPermissionStatus: {
    marginBottom: 8,
    color: '#8a6f54',
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
  chatCitationBox: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(94, 62, 32, 0.18)',
    paddingTop: 6,
    gap: 3,
  },
  chatCitationText: {
    color: '#7a6248',
    fontSize: 11,
    lineHeight: 16,
  },
  chatComposer: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
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
  testEntryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  testEntryButton: {
    flex: 1,
  },
  testHomeTitle: {
    color: '#5f4227',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  testHomeDesc: {
    color: '#7d6449',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
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
  avatarButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 42,
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 5,
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

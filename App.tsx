import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  authorizeHealthKit,
  loadHealthSnapshot,
  type HealthSnapshot,
  type HealthWorkoutRecord,
} from './src/health/healthData';
import { HealthInsightsBoard } from './src/health/HealthInsightsBoard';

type AuthMode = 'login' | 'register';
type EditorMode = 'name' | 'password';

type AuthUser = {
  id: string;
  name?: string;
  email: string;
};

const API_BASE_URL = 'http://127.0.0.1:2818';
const API_ERROR_MESSAGE_MAP: Record<string, string> = {
  'Email already registered': '邮箱已被注册',
  'Invalid email or password': '邮箱或密码错误',
  Unauthorized: '未授权，请重新登录',
  'Route not found': '接口不存在',
  'Validation failed': '请求参数不合法',
};

const AVATAR_BG_COLORS = ['#a7342d', '#8a5d3b', '#7a4f2e', '#9c3a31', '#6c4d2f', '#8d6a45'];
const AVATAR_BORDER_COLORS = ['#c89f74', '#b78d65', '#c39768', '#c88b79', '#b98f62', '#c6a57e'];

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

  return trimmedMessage;
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

function SnapshotRawPanel({ snapshot }: { snapshot: HealthSnapshot }): React.JSX.Element {
  const latestWorkouts = (snapshot.workouts ?? []).slice(0, 3);
  const glucoseMmolL = mgDlToMmolL(snapshot.metabolic?.bloodGlucoseMgDl);

  const rows = [
    {
      label: '活动趋势点',
      value: `${snapshot.activity?.stepsHourlySeriesToday?.length ?? 0} / ${snapshot.activity?.activeEnergyHourlySeriesToday?.length ?? 0} / ${snapshot.activity?.exerciseMinutesHourlySeriesToday?.length ?? 0}`,
      note: '步数/活动能量/运动分钟',
    },
    {
      label: '睡眠样本',
      value: `${snapshot.sleep?.samplesLast36h?.length ?? 0}`,
      note: `分期统计: Core ${formatMetric(snapshot.sleep?.stageMinutesLast36h?.asleepCoreMinutes)} min, Deep ${formatMetric(snapshot.sleep?.stageMinutesLast36h?.asleepDeepMinutes)} min, REM ${formatMetric(snapshot.sleep?.stageMinutesLast36h?.asleepREMMinutes)} min`,
    },
    {
      label: '心率趋势点',
      value: `${snapshot.heart?.heartRateSeriesLast24h?.length ?? 0}`,
      note: `HRV 趋势点: ${snapshot.heart?.heartRateVariabilitySeriesLast7d?.length ?? 0}`,
    },
    {
      label: '血氧趋势点',
      value: `${snapshot.oxygen?.bloodOxygenSeriesLast24h?.length ?? 0}`,
      note: `最新血氧: ${formatMetric(snapshot.oxygen?.bloodOxygenPercent, 1)} %`,
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

function App(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#f6eddd" />
      <LoginScreen />
    </SafeAreaView>
  );
}

function LoginScreen(): React.JSX.Element {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState('');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);

  const [testMode, setTestMode] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthSnapshot, setHealthSnapshot] = useState<HealthSnapshot | null>(null);
  const [healthError, setHealthError] = useState('');
  const [healthAuthorized, setHealthAuthorized] = useState<boolean | null>(null);
  const [visualReady, setVisualReady] = useState(false);

  const [profilePanelVisible, setProfilePanelVisible] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('name');
  const [editorValue, setEditorValue] = useState('');
  const [avatarSeed, setAvatarSeed] = useState(() => Math.floor(Math.random() * 100000));

  const canUseHealth = Boolean(token);

  const avatar = useMemo(() => buildAvatar(currentUser, avatarSeed), [currentUser, avatarSeed]);

  const onSubmit = async () => {
    const normalizedBase = API_BASE_URL.replace(/\/+$/, '');

    if (!email.trim() || !password.trim()) {
      Alert.alert('提示', '邮箱和密码不能为空');
      return;
    }

    if (mode === 'register' && !name.trim()) {
      Alert.alert('提示', '注册模式下请填写昵称');
      return;
    }

    if (mode === 'register' && password.trim().length < 8) {
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
      const body =
        mode === 'login'
          ? { email: email.trim(), password: password.trim() }
          : { name: name.trim(), email: email.trim(), password: password.trim() };

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

      setPassword('');
      setConfirmPassword('');
      setTestMode(false);
      setHealthSnapshot(null);
      setHealthError('');
      setHealthAuthorized(null);
      setVisualReady(false);
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
      const normalizedBase = API_BASE_URL.replace(/\/+$/, '');
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

  const onLoadHealthData = async (useMock = false) => {
    if (!canUseHealth) {
      Alert.alert('提示', '请先登录后再读取健康数据');
      return;
    }

    setHealthLoading(true);
    setHealthError('');
    try {
      const snapshot = await loadHealthSnapshot(useMock);
      setHealthSnapshot(snapshot);
      setVisualReady(true);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '';
      setHealthError(localizeErrorMessage(rawMessage, '读取健康数据失败'));
    } finally {
      setHealthLoading(false);
    }
  };

  const onAuthorizeHealth = async () => {
    if (!canUseHealth) {
      Alert.alert('提示', '请先登录后再进行 HealthKit 授权');
      return;
    }

    setHealthLoading(true);
    setHealthError('');
    try {
      const granted = await authorizeHealthKit();
      setHealthAuthorized(granted);
      if (!granted) {
        setHealthError('未完成授权，请检查系统健康权限设置');
      } else {
        Alert.alert('成功', '已完成 HealthKit 一键授权');
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : '';
      setHealthError(localizeErrorMessage(rawMessage, 'HealthKit 授权失败'));
    } finally {
      setHealthLoading(false);
    }
  };

  const onLogout = () => {
    setToken('');
    setCurrentUser(null);
    setPassword('');
    setConfirmPassword('');
    setHealthSnapshot(null);
    setHealthError('');
    setHealthAuthorized(null);
    setVisualReady(false);
    setTestMode(false);
    setProfilePanelVisible(false);
    setEditorVisible(false);
    setMode('login');
  };

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
        <View style={[styles.content, styles.contentSpacing]}>
          <View style={styles.titleBlock}>
            <View style={styles.seal} />
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
                  }}
                >
                  <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>登录</Text>
                </Pressable>
                <Pressable
                  style={[styles.tabButton, mode === 'register' && styles.tabButtonActive]}
                  onPress={() => setMode('register')}
                >
                  <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>注册</Text>
                </Pressable>
              </View>

              {mode === 'register' ? (
                <>
                  <Text style={styles.label}>昵称</Text>
                  <TextInput
                    autoCapitalize="none"
                    placeholder="请输入昵称"
                    placeholderTextColor="#99866b"
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                  />
                </>
              ) : null}

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

              <Text style={styles.label}>密码</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="off"
                textContentType="oneTimeCode"
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

              {mode === 'register' ? (
                <>
                  <Text style={styles.label}>确认密码</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="off"
                    textContentType="oneTimeCode"
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

              <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={onSubmit} disabled={loading}>
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
              <Text style={styles.testHomeDesc}>进入测试模式，读取并核验 HealthKit 全量数据。</Text>
              <Pressable style={styles.button} onPress={() => setTestMode(true)}>
                <Text style={styles.buttonText}>测试模式</Text>
              </Pressable>
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
              <Text style={styles.healthHint}>上方按钮用于授权与读取，读取 Mock 后自动进入可视化页面。</Text>

              <View style={styles.healthActionRow}>
                <Pressable
                  style={[styles.healthActionButton, healthLoading && styles.buttonDisabled]}
                  onPress={onAuthorizeHealth}
                  disabled={healthLoading}
                >
                  <Text style={styles.healthActionText}>{healthLoading ? '处理中...' : '一键授权'}</Text>
                </Pressable>
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

              {healthAuthorized !== null ? (
                <Text style={styles.healthStatusText}>一键授权：{healthAuthorized ? '成功' : '失败'}</Text>
              ) : null}

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
  seal: {
    width: 38,
    height: 38,
    borderRadius: 4,
    marginBottom: 14,
    backgroundColor: '#a7342d',
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
  helperText: {
    marginTop: 12,
    color: '#8e7659',
    fontSize: 12,
    textAlign: 'center',
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

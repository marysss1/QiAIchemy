import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
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
} from './src/health/healthData';

type AuthMode = 'login' | 'register';

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

async function readApiResponse<T>(response: Response): Promise<{ data: T | null; rawText: string }> {
  const rawText = await response.text();
  const contentType = response.headers.get('content-type') ?? '';
  const looksLikeJson = contentType.includes('application/json') || /^[\s]*[\[{]/.test(rawText);

  if (!looksLikeJson) {
    return { data: null, rawText };
  }

  try {
    return { data: (rawText ? JSON.parse(rawText) : {}) as T, rawText };
  } catch {
    return { data: null, rawText };
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
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState('');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthSnapshot, setHealthSnapshot] = useState<HealthSnapshot | null>(null);
  const [healthError, setHealthError] = useState('');
  const [healthAuthorized, setHealthAuthorized] = useState<boolean | null>(null);
  const canUseHealth = Boolean(token);

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
      Alert.alert('成功', '已刷新用户信息');
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
    setHealthSnapshot(null);
    setHealthError('');
    setHealthAuthorized(null);
  };

  const displaySteps = healthSnapshot?.activity?.stepsToday;
  const displayHeartRate = healthSnapshot?.heart?.latestHeartRateBpm;
  const displaySleepMinutes = healthSnapshot?.sleep?.asleepMinutesLast36h;
  const displayOxygen = healthSnapshot?.oxygen?.bloodOxygenPercent;
  const displayGlucose = healthSnapshot?.metabolic?.bloodGlucoseMgDl;
  const displayDaylight = healthSnapshot?.environment?.daylightMinutesToday;
  const displayWorkoutCount = healthSnapshot?.workouts?.length;

  return (
    <View style={styles.screen}>
      <View style={styles.inkHaloTop} />
      <View style={styles.inkHaloBottom} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View
          style={[
            styles.content,
            {
              paddingTop: 30,
              paddingBottom: 24,
            },
          ]}
        >
          <View style={styles.titleBlock}>
            <View style={styles.seal} />
            <Text style={styles.cnTitle}>岐元灵术</Text>
            <Text style={styles.enTitle}>QiAlchemy</Text>
            <Text style={styles.subtitle}>中医养生与AI融合实验</Text>
          </View>

          <View style={styles.card}>
            {!token ? (
              <>
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

                {mode === 'register' && (
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
                )}

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

                {mode === 'register' && (
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
                )}

                <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={onSubmit} disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#fff5ef" />
                  ) : (
                    <Text style={styles.buttonText}>{mode === 'login' ? '登录' : '注册并登录'}</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.userBox}>
                  <Text style={styles.userTitle}>已登录</Text>
                  <Text style={styles.userText}>邮箱：{currentUser?.email}</Text>
                  <Text style={styles.userText}>昵称：{currentUser?.name || '未设置'}</Text>
                </View>

                <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={onFetchMe} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff5ef" /> : <Text style={styles.buttonText}>刷新资料</Text>}
                </Pressable>

                <Pressable style={styles.secondaryButton} onPress={onLogout}>
                  <Text style={styles.secondaryButtonText}>退出登录</Text>
                </Pressable>
              </>
            )}

            <Text style={styles.helperText}>登录后可开始你的中医养生AI对话</Text>

            <View style={styles.healthPanel}>
              <Text style={styles.healthTitle}>HealthKit 全量数据读取</Text>
              {!canUseHealth ? (
                <Text style={styles.healthLockedHint}>请先登录，登录后才能授权并读取健康数据</Text>
              ) : null}
              <View style={styles.healthActionRow}>
                <Pressable
                  style={[styles.healthActionButton, (!canUseHealth || healthLoading) && styles.buttonDisabled]}
                  onPress={onAuthorizeHealth}
                  disabled={!canUseHealth || healthLoading}
                >
                  <Text style={styles.healthActionText}>{healthLoading ? '处理中...' : '一键授权'}</Text>
                </Pressable>
                <Pressable
                  style={[styles.healthActionButton, (!canUseHealth || healthLoading) && styles.buttonDisabled]}
                  onPress={() => onLoadHealthData(false)}
                  disabled={!canUseHealth || healthLoading}
                >
                  <Text style={styles.healthActionText}>读取真实数据</Text>
                </Pressable>
                <Pressable
                  style={[styles.healthActionButton, styles.healthActionButtonSecondary, (!canUseHealth || healthLoading) && styles.buttonDisabled]}
                  onPress={() => onLoadHealthData(true)}
                  disabled={!canUseHealth || healthLoading}
                >
                  <Text style={styles.healthActionText}>读取 Mock 数据</Text>
                </Pressable>
              </View>

              {healthSnapshot ? (
                <View style={styles.healthResultBox}>
                  <Text style={styles.healthResultText}>
                    数据源：{healthSnapshot.source === 'healthkit' ? 'HealthKit' : 'Mock'}
                  </Text>
                  <Text style={styles.healthResultText}>
                    授权状态：{healthSnapshot.authorized ? '已授权' : '未授权'}
                  </Text>
                  <Text style={styles.healthResultText}>
                    今日步数：{displaySteps ?? '--'}
                  </Text>
                  <Text style={styles.healthResultText}>
                    最新心率：{displayHeartRate ?? '--'} bpm
                  </Text>
                  <Text style={styles.healthResultText}>
                    睡眠时长：{displaySleepMinutes ?? '--'} 分钟
                  </Text>
                  <Text style={styles.healthResultText}>
                    血氧：{displayOxygen ?? '--'} %
                  </Text>
                  <Text style={styles.healthResultText}>
                    血糖：{displayGlucose ?? '--'} mg/dL
                  </Text>
                  <Text style={styles.healthResultText}>
                    日照时间：{displayDaylight ?? '--'} 分钟
                  </Text>
                  <Text style={styles.healthResultText}>
                    运动记录数：{displayWorkoutCount ?? '--'}
                  </Text>
                  {healthAuthorized !== null ? (
                    <Text style={styles.healthResultText}>
                      一键授权：{healthAuthorized ? '成功' : '失败'}
                    </Text>
                  ) : null}
                  {healthSnapshot.note ? (
                    <Text style={styles.healthResultText}>备注：{healthSnapshot.note}</Text>
                  ) : null}
                </View>
              ) : null}

              {healthError ? <Text style={styles.healthError}>{healthError}</Text> : null}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    justifyContent: 'space-between',
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
    borderWidth: 1,
    borderColor: 'rgba(94, 62, 32, 0.2)',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 252, 246, 0.9)',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
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
  secondaryButton: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#b13c2f',
  },
  secondaryButtonText: {
    color: '#9b362b',
    fontSize: 15,
    fontWeight: '700',
  },
  userBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d8c4a7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: '#fffdf8',
  },
  userTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4e3520',
    marginBottom: 6,
  },
  userText: {
    fontSize: 13,
    color: '#6a533d',
    marginBottom: 2,
  },
  helperText: {
    marginTop: 12,
    color: '#8e7659',
    fontSize: 12,
    textAlign: 'center',
  },
  healthPanel: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(94, 62, 32, 0.16)',
  },
  healthTitle: {
    color: '#5f4227',
    fontSize: 13,
    fontWeight: '700',
  },
  healthLockedHint: {
    marginTop: 8,
    color: '#8e7659',
    fontSize: 12,
  },
  healthActionRow: {
    marginTop: 8,
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
  healthResultBox: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d8c4a7',
    backgroundColor: '#fffdf8',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  healthResultText: {
    color: '#5b452f',
    fontSize: 12,
    marginBottom: 2,
  },
  healthError: {
    marginTop: 8,
    color: '#a7342d',
    fontSize: 12,
  },
});

export default App;

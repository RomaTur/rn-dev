import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { device } from '../../device/native';
import { InspectorIdentity } from '../../device/types';
import { Button, Field, Notice, palette, styles } from '../../shared/ui';
import { Icon } from '../../shared/ui/Icon';
const Context = createContext<{
  name: string;
  lock: () => Promise<void>;
} | null>(null);
export function useInspector() {
  const context = useContext(Context);
  if (!context) throw new Error('Inspector session missing');
  return context;
}
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [known, setKnown] = useState<InspectorIdentity | null>(null);
  const [session, setSession] = useState<InspectorIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    device
      .getIdentity()
      .then(value => {
        if (active) {
          setKnown(value);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(
            'Не удалось прочитать локальный профиль. Перезапустите приложение.',
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit() {
    if (busy) return;
    if (!/^\d{6}$/.test(pin)) {
      setError('Введите PIN из шести цифр.');
      return;
    }
    if (
      !known &&
      (name.trim().length < 2 || name.trim().length > 80 || pin !== confirm)
    ) {
      setError('Укажите имя (2–80 символов) и повторите PIN.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const identity = known
        ? await device.unlock(pin)
        : await device.createIdentity(name.trim(), pin);
      setKnown(identity);
      setSession(identity);
      setPin('');
      setConfirm('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось открыть профиль');
      setPin('');
      setConfirm('');
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.paper,
        }}
      >
        <ActivityIndicator color={palette.leaf} />
      </View>
    );
  if (session)
    return (
      <Context.Provider
        value={{
          name: session.name,
          lock: async () => {
            await device.lock();
            setSession(null);
            setPin('');
            setConfirm('');
          },
        }}
      >
        {children}
      </Context.Provider>
    );
  return (
    <ScrollView
      testID="auth-scroll"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
        backgroundColor: palette.white,
      }}
    >
      <View style={auth.form}>
        <Text style={auth.wordmark}>Woodland</Text>
        <Text accessibilityRole="header" style={[styles.title, auth.center]}>
          {known ? 'Вход инспектора' : 'Профиль инспектора'}
        </Text>
        {known ? (
          <Text style={[styles.muted, auth.center]}>{known.name}</Text>
        ) : (
          <Field
            label="Имя инспектора"
            testID="auth-name"
            value={name}
            onChangeText={setName}
            editable={!busy}
          />
        )}
        <View style={auth.pinFields}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.label}>PIN · 6 цифр</Text>
            <TextInput
              style={[styles.input, known && auth.unlockPin]}
              testID="auth-pin"
              accessibilityLabel="PIN"
              value={pin}
              onChangeText={value => setPin(value.replace(/\D/g, ''))}
              secureTextEntry
              keyboardType="number-pad"
              showSoftInputOnFocus={!known}
              maxLength={6}
              editable={!busy}
            />
          </View>
          {!known && (
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.label}>Повторите PIN</Text>
              <TextInput
                style={styles.input}
                testID="auth-confirm"
                accessibilityLabel="Повторите PIN"
                value={confirm}
                onChangeText={value => setConfirm(value.replace(/\D/g, ''))}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={6}
                editable={!busy}
              />
            </View>
          )}
        </View>
        {known && (
          <View style={auth.keypad}>
            {[
              '1',
              '2',
              '3',
              '4',
              '5',
              '6',
              '7',
              '8',
              '9',
              '',
              '0',
              'delete',
            ].map(key =>
              key ? (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={key === 'delete' ? 'Удалить цифру' : key}
                  disabled={
                    busy ||
                    (key === 'delete' ? pin.length === 0 : pin.length >= 6)
                  }
                  onPress={() =>
                    setPin(current =>
                      key === 'delete'
                        ? current.slice(0, -1)
                        : (current + key).slice(0, 6),
                    )
                  }
                  style={({ pressed }) => [
                    auth.key,
                    pressed && auth.pressedKey,
                  ]}
                >
                  {key === 'delete' ? (
                    <Icon name="chevron-left" size={20} />
                  ) : (
                    <Text style={auth.keyNumber}>{key}</Text>
                  )}
                </Pressable>
              ) : (
                <View key="space" style={auth.keySpace} />
              ),
            )}
          </View>
        )}
        {!!error && <Notice text={error} />}
        <Button testID="auth-submit" busy={busy} onPress={submit}>
          {known ? 'Начать работу' : 'Создать профиль'}
        </Button>
        {!known && (
          <Text style={styles.muted}>
            Локальный демопрофиль. PIN нельзя восстановить. Удаление данных
            приложения удалит осмотры и отчёты.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const auth = StyleSheet.create({
  form: { width: '100%', maxWidth: 368, alignSelf: 'center', gap: 12 },
  wordmark: {
    color: palette.accent,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  center: { textAlign: 'center' },
  pinFields: { flexDirection: 'row', gap: 12 },
  unlockPin: { textAlign: 'center', letterSpacing: 7 },
  keypad: {
    width: 168,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginVertical: 4,
  },
  key: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.paper,
    borderRadius: 24,
  },
  keySpace: { width: 48, height: 48 },
  pressedKey: { backgroundColor: palette.tint },
  keyNumber: {
    color: palette.ink,
    fontSize: 21,
    fontVariant: ['tabular-nums'],
  },
});

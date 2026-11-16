import React, { useCallback, useState } from 'react';
import { StatusBar, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthGate } from '../features/session/AuthGate';
import { Notice, palette, styles } from '../shared/ui';
import { Workspace } from './navigation/Workspace';
import { WarehouseProvider } from './warehouse/WarehouseProvider';

export default function App() {
  const [error, setError] = useState('');
  const onLoadError = useCallback((message: string) => setError(message), []);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.darknav }}>
        <StatusBar barStyle="light-content" />
        {error ? (
          <View
            style={{
              flex: 1,
              padding: 28,
              gap: 20,
              backgroundColor: palette.paper,
            }}
          >
            <Text style={styles.title}>Не удалось открыть данные</Text>
            <Notice text={error} />
            <Text style={styles.text}>
              Сохранённые данные требуют проверки. Повторно откройте приложение
              после устранения ошибки.
            </Text>
          </View>
        ) : (
          <AuthGate>
            <WarehouseProvider onLoadError={onLoadError}>
              <Workspace />
            </WarehouseProvider>
          </AuthGate>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

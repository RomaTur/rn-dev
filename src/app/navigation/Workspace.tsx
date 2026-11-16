import React, { useCallback, useState } from 'react';
import { Alert, BackHandler, ScrollView, View } from 'react-native';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { History } from '../../features/activity/HistoryScreen';
import { Sync } from '../../features/activity/SyncScreen';
import { Jobs } from '../../features/dispatch/DispatchScreen';
import { Overview } from '../../features/overview/OverviewScreen';
import { Quality } from '../../features/quality/QualityScreen';
import { useInspector } from '../../features/session/AuthGate';
import { Stock } from '../../features/stock/StockScreen';
import { Notice, palette } from '../../shared/ui';
import { useWarehouse } from '../warehouse/WarehouseProvider';
import { sections, type SectionName, type WorkspaceRoutes } from './routes';
import { WorkspaceBar } from './WorkspaceBar';
import { WorkspaceMenu } from './WorkspaceMenu';

const Stack = createNativeStackNavigator<WorkspaceRoutes>();
const names = Object.keys(sections) as SectionName[];

export function Workspace() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="quality"
        screenOptions={{
          headerShown: false,
          animation: 'none',
          contentStyle: { backgroundColor: palette.paper },
        }}
      >
        {names.map(name => (
          <Stack.Screen key={name} name={name} component={WorkspaceScreen} />
        ))}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function WorkspaceScreen({
  navigation,
  route,
}: NativeStackScreenProps<WorkspaceRoutes, SectionName>) {
  const page = route.name;
  const { state, error, clearError, busy } = useWarehouse();
  const inspector = useInspector();
  const [dirty, setDirty] = useState(false);
  const [menu, setMenu] = useState(false);

  const selectSection = useCallback(
    (name: SectionName, focusKey?: string) => {
      if (name === page && !focusKey) {
        setMenu(false);
        return;
      }
      const go = () => {
        setMenu(false);
        clearError();
        // Main sections are peers. Keep only the destination; a detached screen
        // must not retain an editor or a hardware Back handler.
        navigation.reset({
          index: 0,
          routes: [
            name === 'quality' ? { name, params: { focusKey } } : { name },
          ],
        });
      };
      if (!dirty) {
        go();
        return;
      }
      Alert.alert(
        'Есть несохранённые данные',
        'Сначала сохраните осмотр или подтвердите выход.',
        [
          { text: 'Остаться', style: 'cancel' },
          { text: 'Выйти без сохранения', style: 'destructive', onPress: go },
        ],
      );
    },
    [clearError, dirty, navigation, page],
  );

  useFocusEffect(
    useCallback(() => {
      if (page === 'quality') return;
      const back = BackHandler.addEventListener('hardwareBackPress', () => {
        selectSection('quality');
        return true;
      });
      return () => back.remove();
    }, [page, selectSection]),
  );

  function lock() {
    const applyLock = () => {
      setMenu(false);
      inspector.lock();
    };
    if (!dirty) {
      applyLock();
      return;
    }
    Alert.alert(
      'Есть несохранённые данные',
      'Заблокировать приложение без сохранения?',
      [
        { text: 'Остаться', style: 'cancel' },
        { text: 'Заблокировать', onPress: applyLock },
      ],
    );
  }

  const content =
    page === 'stock' ? (
      <Stock />
    ) : page === 'jobs' ? (
      <Jobs onInspect={key => selectSection('quality', key)} />
    ) : page === 'history' ? (
      <History />
    ) : page === 'sync' ? (
      <Sync />
    ) : (
      <Overview go={selectSection} />
    );

  return (
    <View style={{ flex: 1, backgroundColor: palette.paper }}>
      <WorkspaceBar
        title={sections[page]}
        inspectorName={inspector.name}
        pending={state.outbox.length}
        busy={busy}
        onMenu={() => setMenu(true)}
      />
      {!!error && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Notice text={error} />
        </View>
      )}
      {page === 'quality' ? (
        <Quality focusKey={route.params?.focusKey} onDirty={setDirty} />
      ) : (
        <ScrollView
          testID="workspace-scroll"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            padding: 20,
            paddingBottom: 40,
            flexGrow: 1,
          }}
        >
          {content}
        </ScrollView>
      )}
      <WorkspaceMenu
        menu={menu}
        page={page}
        inspectorName={inspector.name}
        onClose={() => setMenu(false)}
        onSelect={selectSection}
        onLock={lock}
      />
    </View>
  );
}

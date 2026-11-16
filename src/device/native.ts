import {NativeModules, Platform} from 'react-native';
import type {WoodlandDevicePort} from './types';

function native(): WoodlandDevicePort {
  const module = NativeModules.WoodlandDevice as WoodlandDevicePort | undefined;
  if (Platform.OS !== 'android' || !module) {
    throw new Error('Функции устройства доступны в установленном Android-приложении Woodland.');
  }
  return module;
}

export const device: WoodlandDevicePort = {
  getIdentity: async () => native().getIdentity(),
  createIdentity: async (name, pin) => native().createIdentity(name, pin),
  unlock: async pin => native().unlock(pin),
  lock: async () => native().lock(),
  capturePhoto: async () => native().capturePhoto(),
  pickDate: async initial => native().pickDate(initial),
  createPdf: async input => native().createPdf(input),
  openReport: async fileName => native().openReport(fileName),
  shareReport: async fileName => native().shareReport(fileName),
  printReport: async fileName => native().printReport(fileName),
};

/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('react-native/Libraries/Settings/Settings', () => ({
  _settings: {} as Record<string, unknown>,
  get(key: string) {
    return this._settings[key];
  },
  set(nextSettings: Record<string, unknown>) {
    this._settings = {...this._settings, ...nextSettings};
  },
}));

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});

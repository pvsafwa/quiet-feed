import { requireNativeModule } from 'expo';

interface ExpoPipInterface {
  enterPip(aspectRatioWidth?: number, aspectRatioHeight?: number): boolean;
  isPipSupported(): boolean;
  setShouldEnterPipOnLeave(enabled: boolean): boolean;
  isInPip(): boolean;
  setPlaybackState(playing: boolean): boolean;
  syncPlaybackPosition(position: number, duration: number, playing: boolean): boolean;
}

const ExpoPip = requireNativeModule<ExpoPipInterface>('ExpoPip');

export default ExpoPip;

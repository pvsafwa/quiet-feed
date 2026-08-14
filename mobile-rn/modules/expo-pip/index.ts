import { requireNativeModule } from 'expo';

interface ExpoPipInterface {
  enterPip(aspectRatioWidth?: number, aspectRatioHeight?: number): boolean;
  isPipSupported(): boolean;
  setShouldEnterPipOnLeave(enabled: boolean): boolean;
  isInPip(): boolean;
  updateVideoMetadata(title: string, channelTitle: string, durationSec: number): boolean;
  setPlaybackState(playing: boolean): boolean;
  syncPlaybackPosition(position: number, duration: number, playing: boolean): boolean;
  stopPlayback(): boolean;
  setOrientationLandscape(): boolean;
  setOrientationPortrait(): boolean;
  unlockOrientation(): boolean;
  installApk(filePath: string): boolean;
  downloadApk(url: string, fileName: string): Promise<string>;
}

const ExpoPip = requireNativeModule<ExpoPipInterface>('ExpoPip');

export default ExpoPip;

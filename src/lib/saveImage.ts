import { Asset } from 'expo-asset';
import * as MediaLibrary from 'expo-media-library';

/** Saves a bundled image (require(...)) to the device gallery. Returns false if permission is denied. */
export async function saveBundledImage(moduleId: number, _filename?: string): Promise<boolean> {
  const { granted } = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!granted) return false;
  const [file] = await Asset.loadAsync(moduleId);
  await MediaLibrary.Asset.create(file.localUri ?? file.uri);
  return true;
}

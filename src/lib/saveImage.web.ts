import { Asset } from 'expo-asset';
import { downloadOnWeb } from './webDownload';

export async function saveBundledImage(moduleId: number, filename = 'image.jpg'): Promise<boolean> {
  const asset = Asset.fromModule(moduleId);
  const blob = await (await fetch(asset.uri)).blob();
  downloadOnWeb(blob, filename, blob.type || 'image/jpeg');
  return true;
}

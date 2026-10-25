/** Never resolve a Promise with a Capacitor proxy: its get trap exposes `then`. */
export async function loadNativePlugin<T>(
  name: string,
  loader: () => Promise<{ registerPlugin: <P>(name: string) => P }> = () => import('@capacitor/core'),
): Promise<{ plugin: T }> {
  const module = await loader();
  return { plugin: module.registerPlugin<T>(name) };
}

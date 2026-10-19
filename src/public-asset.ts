/** Public assets share the deployment base, including independent PR previews. */
export function publicAsset(path: string, base = import.meta.env.BASE_URL) {
  return `${base.replace(/\/?$/, '/')}${path.replace(/^\/+/, '')}`;
}

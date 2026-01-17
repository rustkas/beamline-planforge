const asset_base_url = import.meta.env.PUBLIC_ASSET_BASE_URL ?? "";

export function resolve_asset_url(uri: string): string {
  if (!uri) return "";
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
  const normalized = uri.startsWith("/") ? uri : `/${uri}`;
  return asset_base_url ? `${asset_base_url}${normalized}` : normalized;
}

export function get_asset_base_url(): string {
  return asset_base_url;
}

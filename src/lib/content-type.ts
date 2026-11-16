export type ContentType = 'live' | 'movie' | 'series';

export function getContentType(groupName?: string): ContentType {
  const name = groupName ?? '';
  if (/^(VOD|Movies):/i.test(name)) return 'movie';
  if (/^(TV )?Series:/i.test(name)) return 'series';
  return 'live';
}

export function cleanCategoryName(groupName?: string): string {
  const name = groupName ?? '';
  return name.replace(/^(VOD|Movies|(TV )?Series):\s*/i, '').trim();
}

export const SQL_IS_MOVIE = `(group_name LIKE 'VOD:%' OR group_name LIKE 'Movies:%')`;
export const SQL_IS_SERIES = `(group_name LIKE 'Series:%' OR group_name LIKE 'TV Series:%')`;
export const SQL_IS_LIVE = `(NOT (group_name LIKE 'VOD:%' OR group_name LIKE 'Movies:%') AND NOT (group_name LIKE 'Series:%' OR group_name LIKE 'TV Series:%'))`;

export const SQL_GROUP_IS_MOVIE = `(name LIKE 'VOD:%' OR name LIKE 'Movies:%')`;
export const SQL_GROUP_IS_SERIES = `(name LIKE 'Series:%' OR name LIKE 'TV Series:%')`;
export const SQL_GROUP_IS_LIVE = `(NOT (name LIKE 'VOD:%' OR name LIKE 'Movies:%') AND NOT (name LIKE 'Series:%' OR name LIKE 'TV Series:%'))`;

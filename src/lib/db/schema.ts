import Dexie, { type EntityTable } from 'dexie';

// Channel interface
export interface Channel {
  id: string;
  sourceId?: string;
  name: string;
  logo?: string;
  url: string;
  groupId: string;
  groupName: string;
  tvgId?: string;
  tvgName?: string;
  catchupSupported: boolean;
  catchupDays?: number;
  catchupSource?: string;
  order: number;
  favorite?: number; // 0 or 1 for safer indexing
  favoriteOrder?: number;
  favoritedAt?: string;
  rating?: number | null;
}

// Group/Category interface
export interface Group {
  id: string;
  name: string;
  channelCount: number;
  order: number;
  favorite?: number; // 0 or 1
  favoriteOrder?: number;
  favoritedAt?: string;
}

// EPG Program interface
export interface EPGProgram {
  id: string;
  channelTvgId: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  icon?: string;
  category?: string;
}

// DVR Job interface
export interface DVRJob {
  id: string;
  channelId: string;
  channelName: string;
  channelUrl: string;
  programId?: string;
  programTitle?: string;
  startTime: Date;
  endTime: Date;
  originalStartTime?: Date;
  originalEndTime?: Date;
  prePadding?: number; // minutes
  postPadding?: number; // minutes
  duration: number; // in seconds
  status: 'scheduled' | 'recording' | 'completed' | 'failed' | 'cancelled';
  outputPath?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Playlist source interface
export interface PlaylistSource {
  id: string;
  name: string;
  type: 'M3U' | 'XTREAM';
  url?: string;
  xmltvUrl?: string;
  // Xtream Codes specific
  server?: string;
  username?: string;
  password?: string;
  lastSync?: Date;
  channelCount?: number;
  enabled: boolean;
  createdAt: Date;
}

// EPG Source interface
export interface EPGSource {
  id: string;
  name: string;
  url: string;
  lastSync?: Date;
  programCount?: number;
  refreshInterval: number; // hours
  enabled: boolean;
  createdAt: Date;
}

// Settings interface
export interface Settings {
  id: string;
  key: string;
  value: string;
}

// Dexie database class
class DeckTVDatabase extends Dexie {
  channels!: EntityTable<Channel, 'id'>;
  groups!: EntityTable<Group, 'id'>;
  epgPrograms!: EntityTable<EPGProgram, 'id'>;
  dvrJobs!: EntityTable<DVRJob, 'id'>;
  playlistSources!: EntityTable<PlaylistSource, 'id'>;
  epgSources!: EntityTable<EPGSource, 'id'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor() {
    super('DeckTVDatabase');

    this.version(1).stores({
      channels: 'id, name, groupId, groupName, tvgId, order, [groupId+order]',
      groups: 'id, name, order',
      epgPrograms: 'id, channelTvgId, start, end, [channelTvgId+start], [channelTvgId+end]',
      dvrJobs: 'id, channelId, status, startTime, [status+startTime]',
      playlistSources: 'id, name, type, enabled',
      epgSources: 'id, name, enabled',
      settings: 'id, key'
    });

    this.version(2).stores({
      channels: 'id, name, groupId, groupName, tvgId, order, favorite, [groupId+order]',
      groups: 'id, name, order, favorite'
    });

    this.version(3).stores({
      channels: 'id, name, groupId, groupName, tvgId, order, favorite, rating, [groupId+order]'
    });
  }
}

// Singleton database instance
export const db = new DeckTVDatabase();

// Helper to generate unique IDs
export function generateId(): string {
  return crypto.randomUUID();
}

// Helper to clear all data
export async function clearAllData(): Promise<void> {
  await Promise.all([
    db.channels.clear(),
    db.groups.clear(),
    db.epgPrograms.clear(),
  ]);
}

// Helper to get channel count by group
export async function getGroupChannelCounts(): Promise<Map<string, number>> {
  const channels = await db.channels.toArray();
  const counts = new Map<string, number>();

  for (const channel of channels) {
    const current = counts.get(channel.groupId) || 0;
    counts.set(channel.groupId, current + 1);
  }

  return counts;
}

// Helper to get current EPG program for a channel
export async function getCurrentProgram(tvgId: string): Promise<EPGProgram | undefined> {
  const now = new Date();

  return await db.epgPrograms
    .where('channelTvgId')
    .equals(tvgId)
    .filter(program => program.start <= now && program.end > now)
    .first();
}

// Helper to get EPG programs for a channel within a time range
export async function getChannelPrograms(
  tvgId: string,
  startTime: Date,
  endTime: Date
): Promise<EPGProgram[]> {
  return await db.epgPrograms
    .where('channelTvgId')
    .equals(tvgId)
    .filter(program =>
      (program.start >= startTime && program.start < endTime) ||
      (program.end > startTime && program.end <= endTime) ||
      (program.start <= startTime && program.end >= endTime)
    )
    .sortBy('start');
}

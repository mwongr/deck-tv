'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { NavRail } from '@/components/layout/NavRail';
import { TriplePane } from '@/components/layout/TriplePane';
import { GroupSidebar } from '@/components/channels/GroupSidebar';
import { ChannelList } from '@/components/channels/ChannelList';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import { EPGTimeline } from '@/components/epg/Timeline';
import { EPGGuide } from '@/components/epg/EPGGuide';
import { SearchView } from '@/components/content/SearchView';
import { MoviesView } from '@/components/content/MoviesView';
import { SeriesView } from '@/components/content/SeriesView';
import { RecordingsView } from '@/components/content/RecordingsView';
import { MyListView } from '@/components/favorites/MyListView';
import { SearchModal } from '@/components/ui/SearchModal';
import { WelcomeScreen } from '@/components/ui/WelcomeScreen';
import { TopBar } from '@/components/layout/TopBar';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { useFavorites } from '@/hooks/useFavorites';
import { getContentType } from '@/lib/content-type';
import { type Channel, type Group, type EPGProgram } from '@/lib/db';

type Section = 'favorites' | 'live' | 'movies' | 'series' | 'epg' | 'search' | 'recordings';

export default function Home() {
  return (
    <Suspense fallback={<div className="h-screen bg-black" />}>
      <ToastProvider>
        <HomeContent />
      </ToastProvider>
    </Suspense>
  );
}

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<Section>('live');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [epgGroupId, setEpgGroupId] = useState<string | null>(null); // Separate state for TV Guide
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isNavRailExpanded, setIsNavRailExpanded] = useState(false);

  // Cross-section category navigation state
  const [movieInitialCategoryId, setMovieInitialCategoryId] = useState<string | null>(null);
  const [seriesInitialCategoryId, setSeriesInitialCategoryId] = useState<string | null>(null);

  const { toggleFavorite } = useFavorites();

  // State for server config
  const [isServerConfigured, setIsServerConfigured] = useState<boolean | null>(null);
  const [showSetup, setShowSetup] = useState(false);

  // Sync active section with URL
  useEffect(() => {
    const section = searchParams.get('section');
    if (section && ['favorites', 'live', 'movies', 'series', 'epg', 'search', 'recordings'].includes(section)) {
      setActiveSection(section as Section);
    }
  }, [searchParams]);

  // Check server status
  useEffect(() => {
    fetch('/api/setup/status')
      .then(res => res.json())
      .then(data => setIsServerConfigured(data.configured))
      .catch(err => console.error('Failed to check server status:', err));
  }, []);

  // Fetch groups from Server
  const [groups, setGroups] = useState<Group[]>([]);

  const refreshGroups = useCallback(() => {
    const controller = new AbortController();

    fetch('/api/channels?type=groups', { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (!controller.signal.aborted) {
          setGroups(data.groups || []);
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') console.error(err);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const cleanup = refreshGroups();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [refreshGroups, isServerConfigured]);

  // Listen to favorites changes to refresh groups/counts
  useEffect(() => {
    const handleFavChange = () => {
      refreshGroups();
    };
    window.addEventListener('favorites:changed', handleFavChange);
    return () => window.removeEventListener('favorites:changed', handleFavChange);
  }, [refreshGroups]);

  // Fetch channels from Server when group changes
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    if (!selectedGroupId) return;

    const controller = new AbortController();

    // Determine filter
    const query = selectedGroupId === 'favorites'
      ? '?favorite=1'
      : `?groupId=${selectedGroupId}`;

    fetch(`/api/channels${query}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (!controller.signal.aborted) {
          setChannels(data.channels || []);
        }
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error(err);
        }
      });

    return () => controller.abort();
  }, [selectedGroupId]);

  const hasData = isServerConfigured;

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      // Ctrl+K to open channel search (works anywhere)
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
        return;
      }

      // / to open channel search (only when not typing)
      if (e.key === '/' && !isSearchOpen && !isInput) {
        e.preventDefault();
        setIsSearchOpen(true);
      }

      // Escape to close modals
      if (e.key === 'Escape') {
        if (isSearchOpen) setIsSearchOpen(false);
      }

      // F to toggle fullscreen when playing
      if ((e.key === 'f' || e.key === 'F') && selectedChannel && !isInput) {
        if (document.fullscreenElement) {
          document.exitFullscreen?.();
        } else {
          const playerEl = document.querySelector('.player-container');
          if (playerEl?.requestFullscreen) {
            playerEl.requestFullscreen();
          } else {
            document.documentElement.requestFullscreen?.();
          }
        }
      }

      // S key to toggle favorite on selectedChannel in Live TV
      if ((e.key === 's' || e.key === 'S') && selectedChannel && !isInput && activeSection === 'live') {
        e.preventDefault();
        toggleFavorite(selectedChannel, 'channel');
      }

      // Number keys to switch sections
      if (!isInput) {
        if (e.key === '1') setActiveSection('live');
        if (e.key === '2') setActiveSection('movies');
        if (e.key === '3') setActiveSection('series');
        if (e.key === '4') setActiveSection('epg');
        if (e.key === '5') setActiveSection('recordings');
        if (e.key === '6') setActiveSection('favorites');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen, selectedChannel, activeSection, toggleFavorite]);

  // Auto-select first group when data loads
  useEffect(() => {
    if (groups && groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(groups[0].id);
    }
  }, [groups, selectedGroupId]);

  const handleGroupSelect = useCallback((group: Group) => {
    setSelectedGroupId(group.id);
    setSelectedChannel(null);
  }, []);

  const handleChannelSelect = useCallback((channel: Channel) => {
    setSelectedChannel(channel);
    setSelectedGroupId(prev => {
      // If currently viewing favorites or opening from the favorites section, stay in favorites
      if (prev === 'favorites' || activeSection === 'favorites' || (activeSection === 'epg' && epgGroupId === 'favorites')) {
        return 'favorites';
      }
      // If currently viewing a custom group, stay in that custom group
      if (prev?.startsWith('custom:')) {
        return prev;
      }
      return channel.groupId;
    });
    setIsSidebarCollapsed(false);
    if (activeSection !== 'live') {
      setActiveSection('live');
    }
  }, [activeSection, epgGroupId]);

  const handleGroupOpen = useCallback((group: Group) => {
    const kind = getContentType(group.name);
    if (kind === 'movie') {
      setMovieInitialCategoryId(group.id);
      setActiveSection('movies');
    } else if (kind === 'series') {
      setSeriesInitialCategoryId(group.id);
      setActiveSection('series');
    } else {
      setSelectedGroupId(group.id);
      setSelectedChannel(null);
      setIsSidebarCollapsed(false);
      setActiveSection('live');
    }
  }, []);

  const handleSearchSelect = useCallback((channel: Channel) => {
    setSelectedChannel(channel);
    setSelectedGroupId(channel.groupId);
    setIsSearchOpen(false);
    setActiveSection('live');
  }, []);

  const handleSearchSubmit = useCallback((query: string) => {
    setSearchQuery(query);
    setActiveSection('search');
  }, []);

  const handleProgramSelect = useCallback((program: EPGProgram, channel: Channel) => {
    // EPG program select
  }, []);

  const handleSectionChange = useCallback((section: string) => {
    setActiveSection(section as Section);
    const params = new URLSearchParams(window.location.search);
    params.set('section', section);
    router.push(`/?${params.toString()}`);
  }, [router]);

  const handleGroupFavorite = useCallback(async (group: Group) => {
    const newStatus = group.favorite ? 0 : 1;
    // Optimistic update
    setGroups(prev => prev.map(g =>
      g.id === group.id ? { ...g, favorite: newStatus } : g
    ));
    await toggleFavorite(group, 'group', newStatus === 1);
  }, [toggleFavorite]);

  // Show welcome screen if no data OR if user explicitly requested setup
  if (hasData === false || showSetup) {
    return <WelcomeScreen onSuccess={() => {
      setShowSetup(false);
      window.location.reload();
    }} />;
  }

  // Show loading state
  if (hasData === undefined) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-foreground-secondary">Loading...</p>
        </div>
      </div>
    );
  }

  // Render content based on active section
  const renderContent = () => {
    switch (activeSection) {
      case 'favorites':
        return (
          <MyListView
            onChannelSelect={handleChannelSelect}
            onGroupOpen={handleGroupOpen}
            onNavigateSection={handleSectionChange}
          />
        );

      case 'live':
        return (
          <TriplePane
            isLeftCollapsed={true}
            leftPane={null}
            middlePane={
              <ChannelList
                channels={channels || []}
                selectedChannelId={selectedChannel?.id || null}
                onChannelSelect={handleChannelSelect}
                onFavoriteToggle={refreshGroups}
                selectedGroupId={selectedGroupId}
              />
            }
            rightPane={
              <div className="h-full flex flex-col">
                <VideoPlayer
                  channel={selectedChannel}
                  className="flex-1"
                />
                {selectedChannel && (
                  <EPGTimeline
                    channel={selectedChannel}
                    className="h-40"
                  />
                )}
              </div>
            }
          />
        );

      case 'movies':
        return (
          <MoviesView
            onMovieSelect={handleChannelSelect}
            initialCategoryId={movieInitialCategoryId}
          />
        );

      case 'series':
        return (
          <SeriesView
            onSeriesSelect={handleChannelSelect}
            initialCategoryId={seriesInitialCategoryId}
          />
        );

      case 'epg':
        return (
          <EPGGuide
            onChannelSelect={handleChannelSelect}
            onProgramSelect={handleProgramSelect}
            initialGroupId={epgGroupId}
            onGroupChange={setEpgGroupId}
          />
        );

      case 'search':
        return (
          <SearchView
            key={searchQuery}
            initialQuery={searchQuery}
            onChannelSelect={handleChannelSelect}
            onGroupOpen={handleGroupOpen}
            onNavigateSection={handleSectionChange}
          />
        );

      case 'recordings':
        return <RecordingsView />;

      default:
        return null;
    }
  };

  return (
    <main className="h-screen flex overflow-hidden bg-background">
      {/* Navigation & Contextual Sidebar (Full Height First Column) */}
      <NavRail
        isExpanded={!isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      >
        {['live'].includes(activeSection) && (
          <GroupSidebar
            groups={groups || []}
            selectedGroupId={selectedGroupId}
            onGroupSelect={handleGroupSelect}
            onGroupFavorite={handleGroupFavorite}
          />
        )}
      </NavRail>

      {/* Main View Area (Header + Content) */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <TopBar
          searchQuery={activeSection === 'search' ? searchQuery : ''}
          onSearchSubmit={handleSearchSubmit}
          onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Server Not Configured Warning */}
        {!isServerConfigured && isServerConfigured !== null && !showSetup && (
          <div className="bg-amber-600 text-white px-4 py-2 flex items-center justify-between shadow-md z-50">
            <div className="flex items-center gap-2">
              <span className="font-bold">⚠️ Server Database Empty</span>
              <span className="text-sm hidden sm:inline opacity-90">
                Your channels are only saved locally on this device. Other devices cannot see them.
              </span>
            </div>
            <button
              onClick={() => setShowSetup(true)}
              className="bg-white text-amber-600 px-3 py-1 rounded text-sm font-bold hover:bg-amber-50 transition-colors"
            >
              Configure Server
            </button>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {renderContent()}
        </div>
      </div>
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelect={handleSearchSelect}
      />
    </main>
  );
}

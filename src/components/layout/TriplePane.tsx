'use client';

import { ReactNode } from 'react';

interface TriplePaneProps {
    leftPane: ReactNode;
    middlePane: ReactNode;
    rightPane: ReactNode;
    isLeftCollapsed?: boolean;
}

export function TriplePane({
    leftPane,
    middlePane,
    rightPane,
    isLeftCollapsed = false,
}: TriplePaneProps) {
    return (
        <div className="h-full flex overflow-hidden">
            {/* Left Pane - Groups/Categories */}
            <aside
                className={`
          h-full bg-background-secondary border-r border-border
          transition-all duration-300 ease-in-out shrink-0
          ${isLeftCollapsed ? 'w-0 overflow-hidden opacity-0' : 'w-[200px]'}
        `}
            >
                <div className="h-full overflow-y-auto">
                    {leftPane}
                </div>
            </aside>

            {/* Middle Pane - Channel List */}
            <aside
                className={`
          h-full bg-background border-r border-border shrink-0
          transition-all duration-300 ease-in-out
          ${isLeftCollapsed ? 'w-[320px] lg:w-[360px]' : 'w-[320px]'}
        `}
            >
                <div className="h-full flex flex-col">
                    {middlePane}
                </div>
            </aside>

            {/* Right Pane - Video Player + EPG */}
            <main className="flex-1 h-full bg-[#000] overflow-hidden">
                {rightPane}
            </main>
        </div>
    );
}

import React from 'react';
import { cn } from '../../utils/cn';

export default function LogoMarquee({ items, className }) {
  const safeItems = items?.length ? items : [];
  // duplicate for seamless loop
  const loopItems = [...safeItems, ...safeItems];

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent" />

      <div className="mp-marquee flex w-max items-center gap-4">
        {loopItems.map((label, idx) => (
          <div
            key={`${label}-${idx}`}
            className="select-none whitespace-nowrap rounded-full border border-border bg-card/60 px-4 py-2 text-xs font-semibold tracking-wide text-muted-foreground"
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

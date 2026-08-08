'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Menu, LucideIcon } from 'lucide-react';

export interface SidebarItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number;
}

interface AdminSidebarProps {
  items: SidebarItem[];
  title?: string;
  collapsible?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}

function SidebarNav({ items, isOpen, pathname, onNavigate }: {
  items: SidebarItem[];
  isOpen: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(item.href);

        return (
          <Link key={item.href} href={item.href} onClick={onNavigate}>
            <Button
              variant={isActive ? 'default' : 'ghost'}
              size="sm"
              className="w-full justify-start h-11"
            >
              <Icon className="w-5 h-5" />
              {isOpen && (
                <div className="flex-1 flex items-center justify-between ml-2">
                  <span className="font-medium">{item.title}</span>
                  {item.badge && (
                    <Badge variant="secondary" className="ml-2">
                      {item.badge}
                    </Badge>
                  )}
                </div>
              )}
            </Button>
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminSidebar({
  items,
  title = 'Admin Portal',
  isOpen: controlledIsOpen,
  onToggle,
}: AdminSidebarProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalIsOpen(!internalIsOpen);
    }
  };

  return (
    <>
      {/* Mobile hamburger trigger — shown in place of the sidebar below md */}
      <div className="md:hidden fixed top-3 left-3 z-40">
        <Button variant="outline" size="icon" className="h-10 w-10 bg-background shadow-sm" onClick={() => setMobileOpen(true)}>
          <Menu className="w-5 h-5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </div>

      {/* Mobile off-canvas drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <SheetHeader className="p-4 border-b">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <SidebarNav items={items} isOpen pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Static sidebar — desktop/tablet only */}
      <aside className={`hidden md:flex ${
        isOpen ? 'w-64' : 'w-16'
      } transition-all duration-300 border-r bg-card flex-col`}>
        <div className="p-4 border-b">
          <Button variant="ghost" size="sm" onClick={handleToggle} className="w-full justify-start">
            <Menu className="w-5 h-5" />
            {isOpen && <span className="ml-2 font-medium">{title}</span>}
          </Button>
        </div>
        <SidebarNav items={items} isOpen={isOpen} pathname={pathname} />
      </aside>
    </>
  );
}

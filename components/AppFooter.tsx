import { getAppVersion } from '@/lib/version';

export default function AppFooter() {
  const version = getAppVersion();

  return (
    <footer className="border-t bg-background/95">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-center px-4 py-3 text-center text-xs text-muted-foreground sm:text-sm">
        <span>
          Made at ULAB by Atanu Roy and Kaviul Hossain. Version {version}
        </span>
      </div>
    </footer>
  );
}

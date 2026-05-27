import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground p-4">
      <h1 className="text-6xl font-bold text-primary">404</h1>
      <h2 className="mt-4 text-2xl font-semibold text-muted-foreground">Page Not Found</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Could not find the requested resource.
      </p>
      <Link href="/asset-overview" className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary">
        Return to Asset Overview
      </Link>
    </div>
  );
}
import { redirect } from 'next/navigation';

interface RootPortalPageProps {
  params: Promise<{ locale: string }>;
}

/** Root portal route — immediately redirects to the dashboard */
export default async function RootPortalPage({ params }: RootPortalPageProps) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard`);
}

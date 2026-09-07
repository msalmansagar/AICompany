import { redirect } from 'next/navigation';

interface AdminIndexProps {
  params: Promise<{ locale: string }>;
}

export default async function AdminIndexPage({ params }: AdminIndexProps) {
  const { locale } = await params;
  redirect(`/${locale}/admin/portal`);
}

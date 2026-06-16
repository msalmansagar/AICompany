import React from 'react';
import { notFound } from 'next/navigation';
import { serverGet } from '../../../../../../lib/api-client';
import { CmsEditorClient } from './CmsEditorClient';
import type { CmsContent } from '@portal/types';
import type { Metadata } from 'next';

interface EditPageProps {
  params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: EditPageProps): Promise<Metadata> {
  const { id } = await params;
  let title = 'Edit Content';
  try {
    const content = await serverGet<CmsContent>(`/api/admin/cms/${id}`);
    title = `Edit — ${content.title}`;
  } catch {
    // Non-fatal — fall through to default title
  }
  return { title };
}

export default async function AdminCmsEditPage({ params }: EditPageProps) {
  const { id } = await params;

  let content: CmsContent;
  try {
    content = await serverGet<CmsContent>(`/api/admin/cms/${id}`);
  } catch {
    notFound();
  }

  return <CmsEditorClient content={content} />;
}

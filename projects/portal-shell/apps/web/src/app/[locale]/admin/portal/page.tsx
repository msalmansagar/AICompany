'use client';

import React, { useState } from 'react';
import {
  Field,
  Input,
  Select,
  Switch,
  Button,
  Spinner,
  Tab,
  TabList,
  tokens,
} from '@fluentui/react-components';
import {
  SaveRegular,
  SettingsRegular,
  ArrowClockwiseRegular,
  DismissRegular,
} from '@fluentui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePortalConfig } from '../../../../contexts/PortalConfigContext';
import { clientGet, clientPatch } from '../../../../lib/api-client';
import type { PortalConfig } from '@portal/types';

// ── D365 design tokens ────────────────────────────────────────────────────────
const COMMAND_BAR_BG  = '#FFFFFF';
const COMMAND_DIVIDER = '#EDEBE9';
const RECORD_HDR_BG   = '#FFFFFF';
const CONTENT_BG      = '#F3F2F1';
const CARD_BG         = '#FFFFFF';

type SettingsTab = 'branding' | 'layout' | 'notifications' | 'footer';

export default function AdminPortalPage() {
  const queryClient   = useQueryClient();
  const contextConfig = usePortalConfig();
  const [activeTab, setActiveTab] = useState<SettingsTab>('branding');

  const { data: config, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'portal-config'],
    queryFn: async () => {
      const res = await clientGet<{ data: PortalConfig }>('/api/admin/portal-config');
      return res.data;
    },
    initialData: contextConfig,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<PortalConfig>) =>
      clientPatch(`/api/admin/portal-config/${config?.id}`, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'portal-config'] });
      setDraft({});
    },
  });

  const [draft, setDraft] = useState<Partial<PortalConfig>>({});
  const merged = { ...config, ...draft } as PortalConfig;
  const hasDraft = Object.keys(draft).length > 0;

  function set<K extends keyof PortalConfig>(key: K, value: PortalConfig[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
        <Spinner label="Loading portal settings…" />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── D365 Command Bar ────────────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: COMMAND_BAR_BG,
          borderBottom: `1px solid ${COMMAND_DIVIDER}`,
          padding: '6px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          flexShrink: 0,
        }}
      >
        <Button
          appearance="subtle"
          icon={<SaveRegular />}
          onClick={() => mutation.mutate(draft)}
          disabled={mutation.isPending || !hasDraft}
          style={{ fontWeight: 500 }}
        >
          {mutation.isPending ? 'Saving…' : 'Save'}
        </Button>
        <div style={{ width: '1px', height: '20px', backgroundColor: COMMAND_DIVIDER, margin: '0 4px' }} />
        <Button
          appearance="subtle"
          icon={<ArrowClockwiseRegular />}
          onClick={() => void refetch()}
        >
          Refresh
        </Button>
        {hasDraft && (
          <Button
            appearance="subtle"
            icon={<DismissRegular />}
            onClick={() => setDraft({})}
          >
            Discard
          </Button>
        )}
      </div>

      {/* ── D365 Entity Record Header ────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: RECORD_HDR_BG,
          borderBottom: `1px solid ${COMMAND_DIVIDER}`,
          padding: '16px 28px 0 28px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div
            style={{
              width: '40px', height: '40px', borderRadius: '8px',
              backgroundColor: '#EEF2FC',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <SettingsRegular style={{ fontSize: '22px', color: '#0078D4' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#242424', margin: 0, lineHeight: 1.2 }}>
              {merged.portalName || 'Portal Settings'}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: '11px', fontWeight: 600, color: '#107C10',
                  backgroundColor: '#DFF6DD', padding: '2px 8px', borderRadius: '12px',
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#107C10', display: 'inline-block' }} />
                Active
              </span>
              {hasDraft && (
                <span
                  style={{
                    fontSize: '11px', color: '#8A8886',
                    backgroundColor: '#F3F2F1', padding: '2px 8px',
                    borderRadius: '12px', fontWeight: 500,
                  }}
                >
                  Unsaved changes
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tab strip */}
        <TabList
          selectedValue={activeTab}
          onTabSelect={(_, d) => setActiveTab(d.value as SettingsTab)}
          size="small"
        >
          <Tab value="branding">Branding</Tab>
          <Tab value="layout">Layout</Tab>
          <Tab value="notifications">Notifications</Tab>
          <Tab value="footer">Footer</Tab>
        </TabList>
      </div>

      {/* ── Content Area ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', backgroundColor: CONTENT_BG }}>
        <div style={{ maxWidth: '720px' }}>

          {activeTab === 'branding' && (
            <SettingsCard title="Branding">
              <FieldGrid>
                <Field label="Portal Name">
                  <Input
                    value={merged.portalName ?? ''}
                    onChange={(_, d) => set('portalName', d.value)}
                  />
                </Field>
                <Field label="Logo URL">
                  <Input
                    value={merged.logoUrl ?? ''}
                    onChange={(_, d) => set('logoUrl', d.value)}
                  />
                </Field>
                <Field label="Favicon URL">
                  <Input
                    value={merged.faviconUrl ?? ''}
                    onChange={(_, d) => set('faviconUrl', d.value)}
                  />
                </Field>
                <Field label="Primary Color (hex)">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {merged.primaryColor && (
                      <span
                        style={{
                          width: '18px', height: '18px', borderRadius: '4px',
                          backgroundColor: merged.primaryColor,
                          border: '1px solid rgba(0,0,0,0.15)',
                          display: 'inline-block', flexShrink: 0,
                        }}
                      />
                    )}
                    <Input
                      value={merged.primaryColor ?? ''}
                      onChange={(_, d) => set('primaryColor', d.value)}
                      placeholder="#0078D4"
                      style={{ flex: 1 }}
                    />
                  </div>
                </Field>
                <Field label="Accent Color (hex)">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {merged.accentColor && (
                      <span
                        style={{
                          width: '18px', height: '18px', borderRadius: '4px',
                          backgroundColor: merged.accentColor,
                          border: '1px solid rgba(0,0,0,0.15)',
                          display: 'inline-block', flexShrink: 0,
                        }}
                      />
                    )}
                    <Input
                      value={merged.accentColor ?? ''}
                      onChange={(_, d) => set('accentColor', d.value)}
                      placeholder="#50E6FF"
                      style={{ flex: 1 }}
                    />
                  </div>
                </Field>
                <Field label="Font Family">
                  <Input
                    value={merged.fontFamily ?? ''}
                    onChange={(_, d) => set('fontFamily', d.value)}
                    placeholder="'Segoe UI', sans-serif"
                  />
                </Field>
              </FieldGrid>
            </SettingsCard>
          )}

          {activeTab === 'layout' && (
            <SettingsCard title="Layout & Navigation">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Field label="Navigation Layout">
                  <Select
                    value={merged.navLayout ?? 'sidebar'}
                    onChange={(_, d) => set('navLayout', d.value as PortalConfig['navLayout'])}
                  >
                    <option value="sidebar">Sidebar</option>
                    <option value="top-nav">Top Navigation</option>
                  </Select>
                </Field>
                <Field label="Sidebar Default State">
                  <Select
                    value={merged.sidebarDefaultState ?? 'expanded'}
                    onChange={(_, d) =>
                      set('sidebarDefaultState', d.value as PortalConfig['sidebarDefaultState'])
                    }
                  >
                    <option value="expanded">Expanded</option>
                    <option value="collapsed">Collapsed</option>
                  </Select>
                </Field>
                <Field label="Landing Page">
                  <Input
                    value={merged.landingPage ?? 'dashboard'}
                    onChange={(_, d) => set('landingPage', d.value)}
                    placeholder="dashboard"
                  />
                </Field>
                <Field label="Header — Show Entity Switcher">
                  <Switch
                    checked={merged.headerShowEntitySwitcher ?? false}
                    onChange={(_, d) => set('headerShowEntitySwitcher', d.checked)}
                  />
                </Field>
                <Field label="Header — Show Support Link">
                  <Switch
                    checked={merged.headerShowSupport ?? false}
                    onChange={(_, d) => set('headerShowSupport', d.checked)}
                  />
                </Field>
                {merged.headerShowSupport && (
                  <>
                    <Field label="Support Label">
                      <Input
                        value={merged.headerSupportLabel ?? ''}
                        onChange={(_, d) => set('headerSupportLabel', d.value)}
                      />
                    </Field>
                    <Field label="Support URL">
                      <Input
                        value={merged.headerSupportUrl ?? ''}
                        onChange={(_, d) => set('headerSupportUrl', d.value)}
                        type="url"
                      />
                    </Field>
                  </>
                )}
              </div>
            </SettingsCard>
          )}

          {activeTab === 'notifications' && (
            <SettingsCard title="Notifications">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <Field label="Show Notification Bell">
                  <Switch
                    checked={merged.headerShowNotifications ?? true}
                    onChange={(_, d) => set('headerShowNotifications', d.checked)}
                  />
                </Field>
                <Field label="Poll Interval (seconds)" hint="Between 10 and 120 seconds">
                  <Input
                    type="number"
                    value={String(merged.notificationPollIntervalSeconds ?? 30)}
                    onChange={(_, d) =>
                      set(
                        'notificationPollIntervalSeconds',
                        Math.min(120, Math.max(10, parseInt(d.value, 10) || 30)),
                      )
                    }
                    style={{ width: '120px' }}
                  />
                </Field>
              </div>
            </SettingsCard>
          )}

          {activeTab === 'footer' && (
            <SettingsCard title="Footer">
              <FieldGrid>
                <Field label="Left Logo URL">
                  <Input
                    value={merged.footerLeftLogoUrl ?? ''}
                    onChange={(_, d) => set('footerLeftLogoUrl', d.value)}
                  />
                </Field>
                <Field label="Right Logo URL">
                  <Input
                    value={merged.footerRightLogoUrl ?? ''}
                    onChange={(_, d) => set('footerRightLogoUrl', d.value)}
                  />
                </Field>
                <Field label="Powered By Text">
                  <Input
                    value={merged.footerPoweredByText ?? ''}
                    onChange={(_, d) => set('footerPoweredByText', d.value)}
                  />
                </Field>
              </FieldGrid>
            </SettingsCard>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Local layout helpers ──────────────────────────────────────────────────────

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        border: '1px solid #EDEBE9',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        marginBottom: '16px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid #F0F0F0',
          backgroundColor: '#FAFAFA',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#323130' }}>{title}</span>
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
      }}
    >
      {children}
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import {
  Title2,
  Body1,
  Field,
  Input,
  Select,
  Switch,
  Button,
  Card,
  CardHeader,
  Divider,
  makeStyles,
  tokens,
  Spinner,
} from '@fluentui/react-components';
import { SaveRegular } from '@fluentui/react-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePortalConfig } from '../../../../contexts/PortalConfigContext';
import { clientGet, clientPatch } from '../../../../lib/api-client';
import type { PortalConfig } from '@portal/types';

const useStyles = makeStyles({
  page: {
    maxWidth: '800px',
  },
  section: {
    marginBlockEnd: tokens.spacingVerticalXL,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalL,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingBlockStart: tokens.spacingVerticalL,
  },
});

export default function AdminPortalPage() {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const contextConfig = usePortalConfig();

  const { data: config, isLoading } = useQuery({
    queryKey: ['admin', 'portal-config'],
    queryFn: () => clientGet<PortalConfig>('/api/admin/portal-config'),
    initialData: contextConfig,
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<PortalConfig>) =>
      clientPatch(`/api/admin/portal-config/${config?.id}`, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'portal-config'] });
    },
  });

  const [draft, setDraft] = useState<Partial<PortalConfig>>({});

  const merged = { ...config, ...draft } as PortalConfig;

  function handleChange<K extends keyof PortalConfig>(key: K, value: PortalConfig[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  if (isLoading) {
    return <Spinner label="Loading portal settings…" />;
  }

  return (
    <div className={styles.page}>
      <Title2 block>Portal Settings</Title2>
      <Body1 block style={{ marginBlockEnd: tokens.spacingVerticalXL }}>
        Configure branding, navigation layout, and auth providers for the portal.
      </Body1>

      <Card className={styles.section}>
        <CardHeader header={<Title2>Branding</Title2>} />
        <div className={styles.grid}>
          <Field label="Portal Name">
            <Input
              value={merged.portalName ?? ''}
              onChange={(_, d) => handleChange('portalName', d.value)}
            />
          </Field>
          <Field label="Logo URL">
            <Input
              value={merged.logoUrl ?? ''}
              onChange={(_, d) => handleChange('logoUrl', d.value)}
            />
          </Field>
          <Field label="Primary Color (hex)">
            <Input
              value={merged.primaryColor ?? ''}
              onChange={(_, d) => handleChange('primaryColor', d.value)}
              placeholder="#0078D4"
            />
          </Field>
          <Field label="Accent Color (hex)">
            <Input
              value={merged.accentColor ?? ''}
              onChange={(_, d) => handleChange('accentColor', d.value)}
              placeholder="#50E6FF"
            />
          </Field>
        </div>
      </Card>

      <Card className={styles.section}>
        <CardHeader header={<Title2>Layout</Title2>} />
        <Field label="Navigation Layout">
          <Select
            value={merged.navLayout ?? 'sidebar'}
            onChange={(_, d) => handleChange('navLayout', d.value as PortalConfig['navLayout'])}
          >
            <option value="sidebar">Sidebar</option>
            <option value="top-nav">Top Navigation</option>
          </Select>
        </Field>
        <Field label="Sidebar Default State">
          <Select
            value={merged.sidebarDefaultState ?? 'expanded'}
            onChange={(_, d) =>
              handleChange('sidebarDefaultState', d.value as PortalConfig['sidebarDefaultState'])
            }
          >
            <option value="expanded">Expanded</option>
            <option value="collapsed">Collapsed</option>
          </Select>
        </Field>
      </Card>

      <Card className={styles.section}>
        <CardHeader header={<Title2>Notifications</Title2>} />
        <Field label="Poll Interval (seconds, 10–120)">
          <Input
            type="number"
            value={String(merged.notificationPollIntervalSeconds ?? 30)}
            onChange={(_, d) =>
              handleChange(
                'notificationPollIntervalSeconds',
                Math.min(120, Math.max(10, parseInt(d.value, 10) || 30)),
              )
            }
          />
        </Field>
        <Field label="Show Notification Bell">
          <Switch
            checked={merged.headerShowNotifications ?? true}
            onChange={(_, d) => handleChange('headerShowNotifications', d.checked)}
          />
        </Field>
      </Card>

      <div className={styles.actions}>
        <Button
          appearance="primary"
          icon={<SaveRegular />}
          onClick={() => mutation.mutate(draft)}
          disabled={mutation.isPending || Object.keys(draft).length === 0}
        >
          {mutation.isPending ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

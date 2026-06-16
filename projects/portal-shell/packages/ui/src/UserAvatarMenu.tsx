'use client';

import React from 'react';
import {
  Avatar,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  PersonRegular,
  SettingsRegular,
  GlobeRegular,
  SignOutRegular,
} from '@fluentui/react-icons';
import type { UserProfile } from '@portal/types';

interface UserAvatarMenuProps {
  user: UserProfile;
  onSignOut: () => void;
  onProfileClick: () => void;
  onLanguageToggle: () => void;
  currentLocale: string;
  switchLanguageLabel: string;
}

const useStyles = makeStyles({
  menuButton: {
    padding: '4px',
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground3,
    },
    ':focus-visible': {
      outline: `2px solid ${tokens.colorBrandStroke1}`,
      outlineOffset: '2px',
    },
  },
  menuItem: {
    minWidth: '180px',
  },
});

function getInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0]?.[0] ?? '').toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
}

export function UserAvatarMenu({
  user,
  onSignOut,
  onProfileClick,
  onLanguageToggle,
  currentLocale,
  switchLanguageLabel,
}: UserAvatarMenuProps) {
  const styles = useStyles();
  const initials = getInitials(user.displayName);

  return (
    <Menu>
      <MenuButton
        appearance="subtle"
        aria-label={`User menu for ${user.displayName}`}
        style={{ padding: '2px', borderRadius: '50%' }}
      >
        <Avatar
          name={user.displayName}
          initials={initials}
          image={user.avatarUrl ? { src: user.avatarUrl } : undefined}
          size={32}
          color="brand"
          aria-hidden="true"
        />
      </MenuButton>

      <MenuList className={styles.menuItem}>
        <MenuItem icon={<PersonRegular />} onClick={onProfileClick}>
          {user.displayName}
        </MenuItem>
        <MenuDivider />
        <MenuItem icon={<GlobeRegular />} onClick={onLanguageToggle}>
          {switchLanguageLabel}
        </MenuItem>
        <MenuDivider />
        <MenuItem icon={<SignOutRegular />} onClick={onSignOut}>
          Sign out
        </MenuItem>
      </MenuList>
    </Menu>
  );
}
